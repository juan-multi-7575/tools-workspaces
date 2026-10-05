import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, errorMessage, type ToolManifest } from '../../lib/api'
import { useToolExecute } from '../../hooks/useToolExecute'
import { useToolDeps } from '../../hooks/useToolDeps'
import DependencyGate from '../../components/deps/DependencyGate'
import ToolResultPanel from '../../components/tools/ToolResultPanel'
import { formatBytes } from '../../lib/depsApi'
import {
  TRIMMER_ID,
  buildSegments,
  clamp,
  fitSegments,
  timecode,
  type FieldSpec,
  type Region,
} from './trimmerModel'

const AUDIO_KINDS = new Set([
  'wav', 'mp3', 'flac', 'ogg', 'm4a', 'aac', 'wma', 'aiff', 'aif', 'opus', 'mp4', 'webm', 'mov', 'mkv',
])

interface ArtifactIndexEntry {
  name: string
  path: string
  kind: string
  size: number
}

/**
 * The length of the source, and where it came from.
 *
 * There is no default case here on purpose. A duration that cannot be read from
 * the backend leaves `duration` null and the reason in `reason`, and the
 * timeline stays inert rather than inventing an axis to drag against.
 */
type Probe =
  | { phase: 'idle'; duration: null; reason: null; source: null; label: null; for: string }
  | { phase: 'probing'; duration: null; reason: null; source: null; label: null; for: string }
  | { phase: 'ready'; duration: number; reason: null; source: string; label: string; for: string }
  | { phase: 'failed'; duration: null; reason: string; source: null; label: null; for: string }

const IDLE_PROBE: Probe = { phase: 'idle', duration: null, reason: null, source: null, label: null, for: '' }

function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

export interface TrimmerWorkspaceProps {
  manifest: ToolManifest
  initialInputPath?: string
}

/**
 * The working state: one enormous centred timeline, the source and the regions
 * in a narrow rail beside it, and a trailing action bar that sits outside the
 * scrolling area so the dependency gate's install control is on screen by
 * construction.
 */
export default function TrimmerWorkspace({ manifest, initialInputPath }: TrimmerWorkspaceProps) {
  const navigate = useNavigate()
  const execute = useToolExecute(TRIMMER_ID)
  const deps = useToolDeps(TRIMMER_ID)
  const fileRef = useRef<HTMLInputElement>(null)
  const stripRef = useRef<HTMLDivElement>(null)
  const probeToken = useRef(0)

  const schema = (manifest.parameters_schema ?? {}) as Record<string, FieldSpec>
  const [inputPath, setInputPath] = useState(initialInputPath ?? '')
  const [regions, setRegions] = useState<Region[]>([])
  const [playhead, setPlayhead] = useState(0)
  const [probe, setProbe] = useState<Probe>(IDLE_PROBE)
  const [recent, setRecent] = useState<ArtifactIndexEntry[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [scrubbing, setScrubbing] = useState(false)
  const [drag, setDrag] = useState<{ index: number; edge: 'start' | 'end' } | null>(null)

  const duration = probe.phase === 'ready' ? probe.duration : null
  const measured = probe.for === inputPath.trim() && inputPath.trim() !== ''
  const readable = measured && probe.phase === 'ready' ? probe.duration : null

  const refreshIndex = useCallback(async () => {
    const response = await api.getRecentArtifacts()
    setRecent(
      response.artifacts.filter((entry) => AUDIO_KINDS.has(entry.kind.toLowerCase())),
    )
  }, [])

  useEffect(() => {
    // The recent list is a convenience, not the source of truth for anything;
    // if it cannot be read the rest of the workspace still works.
    refreshIndex().catch(() => undefined)
  }, [refreshIndex])

  /**
   * Ask the backend how long the source is. A URL is asked through the
   * downloader's info probe; a file is asked by really running `mediainfo` on
   * it and reading the duration out of the payload that run returned.
   */
  const measure = useCallback(async (value: string) => {
    const target = value.trim()
    const token = ++probeToken.current
    if (!target) {
      setProbe({ ...IDLE_PROBE })
      return
    }
    setProbe({ phase: 'probing', duration: null, reason: null, source: null, label: null, for: target })
    try {
      if (isUrl(target)) {
        const info = await api.getVideoInfo(target)
        if (token !== probeToken.current) return
        if (typeof info.duration === 'number' && info.duration > 0) {
          setProbe({
            phase: 'ready',
            duration: info.duration,
            reason: null,
            source: 'getVideoInfo',
            label: info.title ?? target,
            for: target,
          })
        } else {
          setProbe({
            phase: 'failed',
            duration: null,
            reason: `The downloader's info probe returned no duration for this URL${info.title ? ` (${info.title})` : ''}.`,
            source: null,
            label: null,
            for: target,
          })
        }
        return
      }

      const result = await api.executeTool('mediainfo', {
        kind: 'standalone',
        destination: '',
        params: { input_path: target },
      })
      if (token !== probeToken.current) return
      if (result.status !== 'completed') {
        setProbe({
          phase: 'failed',
          duration: null,
          reason: errorMessage(result.error) || `mediainfo exited with status "${result.status}".`,
          source: null,
          label: null,
          for: target,
        })
        return
      }
      const seconds = Number(result.data?.format?.duration)
      if (!Number.isFinite(seconds) || seconds <= 0) {
        setProbe({
          phase: 'failed',
          duration: null,
          reason: 'mediainfo completed but its payload carries no duration for this file.',
          source: null,
          label: null,
          for: target,
        })
        return
      }
      const format = String(result.data?.format?.format_name ?? '')
      setProbe({
        phase: 'ready',
        duration: seconds,
        reason: null,
        source: 'mediainfo',
        label: format ? `mediainfo · ${format}` : 'mediainfo',
        for: target,
      })
    } catch (cause: unknown) {
      if (token !== probeToken.current) return
      setProbe({
        phase: 'failed',
        duration: null,
        reason: errorMessage(cause),
        source: null,
        label: null,
        for: target,
      })
    }
  }, [])

  // A file uploaded or picked here is measured immediately: the whole timeline
  // depends on it, so making the user press a second button would be a tax.
  const upload = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      const uploaded = await api.uploadFile(file)
      setInputPath(uploaded.path)
      setRegions([])
      setPlayhead(0)
      void measure(uploaded.path)
      refreshIndex().catch(() => undefined)
    } catch (cause: unknown) {
      setUploadError(errorMessage(cause))
    } finally {
      setUploading(false)
    }
  }

  const timeFromClientX = useCallback(
    (clientX: number) => {
      const rect = stripRef.current?.getBoundingClientRect()
      if (!rect || rect.width <= 0 || !duration) return 0
      return clamp(((clientX - rect.left) / rect.width) * duration, 0, duration)
    },
    [duration],
  )

  const setRegionEdge = useCallback((index: number, edge: 'start' | 'end', seconds: number) => {
    setRegions((previous) =>
      previous.map((region, position) => {
        if (position !== index) return region
        const next = edge === 'start' ? { ...region, start: seconds } : { ...region, end: seconds }
        // A region can never invert: the ends swap rather than the run failing
        // later with a negative duration.
        if (next.end <= next.start) {
          return edge === 'start' ? { start: seconds, end: seconds } : { start: seconds, end: seconds }
        }
        return next
      }),
    )
  }, [])

  const onStripPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!duration) return
    if ((event.target as HTMLElement).closest('[data-trim-handle]')) return
    event.preventDefault()
    setScrubbing(true)
    setPlayhead(timeFromClientX(event.clientX))
  }

  const onStripPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (!duration) return
    const seconds = timeFromClientX(event.clientX)
    if (drag) setRegionEdge(drag.index, drag.edge, seconds)
    else if (scrubbing) setPlayhead(seconds)
  }

  const endGesture = () => {
    setScrubbing(false)
    setDrag(null)
  }

  useEffect(() => {
    if (!drag) return
    const stop = () => setDrag(null)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    return () => {
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
  }, [drag])

  const startHandleDrag = (index: number, edge: 'start' | 'end') => (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!duration) return
    event.preventDefault()
    event.stopPropagation()
    // Capture keeps the move events coming even when the pointer leaves the
    // glyph. It throws for a pointer id the browser is not tracking, so it is
    // asked for rather than assumed; the drag works without it either way.
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      /* no active pointer to capture — the window-level listener still ends it */
    }
    setDrag({ index, edge })
  }

  const nudgeHandle = (index: number, edge: 'start' | 'end') => (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!duration) return
    const step = event.shiftKey ? 5 : 0.1
    const region = regions[index]
    if (!region) return
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      const from = edge === 'start' ? region.start : region.end
      const to = clamp(from + (event.key === 'ArrowLeft' ? -step : step), 0, duration)
      setRegionEdge(index, edge, to)
    } else if (event.key === 'Home') {
      event.preventDefault()
      setRegionEdge(index, edge, 0)
    } else if (event.key === 'End') {
      event.preventDefault()
      setRegionEdge(index, edge, duration)
    }
  }

  /*
   * The glyph count a stretch earns is a function of its length; how many of
   * those the strip can actually hold is a function of how wide it is. Both are
   * measured off the rendered DOM — the strip's client width and a real
   * rendered glyph — because a glyph wider than its slot would eat the spacing
   * the selection is drawn with.
   */
  const [stripWidth, setStripWidth] = useState(0)
  const [glyphWidth, setGlyphWidth] = useState(0)

  useEffect(() => {
    const strip = stripRef.current
    if (!strip || !duration) return
    const measure = () => {
      const glyph = strip.querySelector('.tr-glyph') as HTMLElement | null
      setStripWidth(strip.clientWidth)
      setGlyphWidth(glyph ? glyph.offsetWidth : 0)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(strip)
    return () => observer.disconnect()
  }, [duration])

  const segments = useMemo(
    () => (duration ? fitSegments(buildSegments(duration, regions), duration, stripWidth, glyphWidth) : []),
    [duration, regions, stripWidth, glyphWidth],
  )

  const addRegionAtPlayhead = () => {
    if (!duration) return
    const start = clamp(playhead, 0, Math.max(0, duration - 0.1))
    const end = clamp(start + Math.max(1, duration * 0.1), start + 0.1, duration)
    setRegions((previous) => [...previous, { start, end }])
  }

  /**
   * What was actually sent, and what is on screen now. A completed run whose
   * signature no longer matches is marked stale rather than left looking current.
   */
  const runSignature = useMemo(
    () => JSON.stringify({ input_path: inputPath, regions: regions.map((region) => [region.start, region.end]) }),
    [inputPath, regions],
  )
  const [lastSignature, setLastSignature] = useState<string | null>(null)
  const result = execute.state.result
  const stale = result?.status === 'completed' && lastSignature !== null && lastSignature !== runSignature

  const urlOnly = isUrl(inputPath.trim())
  const canRun = Boolean(readable) && !urlOnly && regions.length > 0 && !execute.busy && deps.ready

  const run = async () => {
    setLastSignature(runSignature)
    const resultRun = await execute.run({
      input_path: inputPath.trim(),
      regions: regions.map((region) => ({ start: region.start, end: region.end })),
    })
    if (resultRun?.status === 'completed') refreshIndex().catch(() => undefined)
  }

  const clear = () => {
    execute.reset()
    setLastSignature(null)
    setInputPath('')
    setRegions([])
    setPlayhead(0)
    setProbe(IDLE_PROBE)
  }

  // The largest thing on the page is the timeline, so the timeline takes drops.
  const onStripDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    void upload(event.dataTransfer.files?.[0])
  }

  return (
    <div
      className="tr-root"
      onPaste={(event) => {
        const text = event.clipboardData.getData('text')
        if (!text) return
        const value = text.trim()
        if (!value) return
        event.preventDefault()
        setInputPath(value)
        void measure(value)
      }}
    >
      <header className="tr-bar">
        <button type="button" className="tr-bar__home" onClick={() => navigate('/')}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M8.5 2.5 4 7l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          All tools
        </button>
        <span className="tr-bar__mark">
          <span className="tr-bar__dot" aria-hidden="true" />
          {manifest.name}
        </span>
        <span className="tr-bar__id">{TRIMMER_ID}</span>
      </header>

      <div className="tr-stage">
        <aside className="tr-rail" aria-label="Source and regions">
          <div className="tr-field" data-param-key="input_path">
            <span className="tr-label" title="input_path">Source file</span>
            <div className="tr-source">
              <input
                id="tr-source-input"
                className="tr-input"
                type="text"
                value={inputPath}
                placeholder="/absolute/path/clip.mp4"
                aria-label="Path or URL of the file to trim"
                onChange={(event) => setInputPath(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void measure(inputPath)
                }}
              />
              <button type="button" className="tr-btn tr-btn--small" onClick={() => void measure(inputPath)}>
                Measure
              </button>
            </div>
            <div
              className="tr-source__drop"
              role="button"
              tabIndex={0}
              onClick={() => fileRef.current?.click()}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  fileRef.current?.click()
                }
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                void upload(event.dataTransfer.files?.[0])
              }}
            >
              {uploading ? 'Uploading…' : 'Drop a file here, or click to browse'}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="audio/*,video/*"
              className="tr-sr"
              aria-label="Upload an audio or video file to trim"
              onChange={(event) => {
                void upload(event.target.files?.[0])
                event.target.value = ''
              }}
            />
            {recent.length > 0 && (
              <select
                className="tr-input"
                value=""
                aria-label="Media already on this machine"
                onChange={(event) => {
                  if (!event.target.value) return
                  setInputPath(event.target.value)
                  setRegions([])
                  void measure(event.target.value)
                }}
              >
                <option value="">— media already on this machine —</option>
                {recent.map((entry) => (
                  <option key={entry.path} value={entry.path}>
                    {entry.name} · {formatBytes(entry.size)}
                  </option>
                ))}
              </select>
            )}
            {uploadError && (
              <p className="tr-error" role="alert">
                {uploadError}
              </p>
            )}
          </div>

          <div className="tr-field tr-measure" data-probe-state={probe.phase}>
            <span className="tr-label">Length</span>
            {probe.phase === 'probing' && probe.for === inputPath.trim() && (
              <p className="tr-measure__body">Measuring with the backend…</p>
            )}
            {probe.phase === 'ready' && probe.for === inputPath.trim() && (
              <p className="tr-measure__body">
                <strong className="tr-mono">{timecode(probe.duration)}</strong>
                <span className="tr-measure__from"> · {probe.duration.toFixed(3)} s · {probe.label}</span>
              </p>
            )}
            {probe.phase === 'failed' && probe.for === inputPath.trim() && (
              <p className="tr-error" role="alert">
                The backend could not measure this source. {probe.reason}
              </p>
            )}
            {!measured && <p className="tr-measure__body tr-measure__idle">No source measured yet.</p>}
          </div>

          <div className="tr-field" data-param-key="regions">
            <span className="tr-label" title="regions">
              {schema.regions?.title ?? 'Regions'} · {regions.length}
            </span>
            <p className="tr-hint">
              Each region is one output file, cut between <span className="tr-mono">start</span> and{' '}
              <span className="tr-mono">end</span> in seconds from the start of the source.
            </p>

            {regions.length === 0 ? (
              <p className="tr-empty">
                No regions yet. Put the playhead where a region should begin, then add one — or
                type the seconds straight into the fields below.
              </p>
            ) : (
              <ol className="tr-regions">
                {regions.map((region, index) => (
                  <li className="tr-region" key={index}>
                    <div className="tr-region__row">
                      <label className="tr-region__num" htmlFor={`tr-start-${index}`}>
                        {String(index + 1).padStart(2, '0')}
                      </label>
                      <label className="tr-sr" htmlFor={`tr-start-${index}`}>Start seconds</label>
                      <input
                        id={`tr-start-${index}`}
                        className="tr-input tr-mono tr-num"
                        type="number"
                        min={0}
                        step={0.1}
                        value={Number(region.start.toFixed(3))}
                        onChange={(event) =>
                          setRegionEdge(index, 'start', Number(event.target.value))
                        }
                      />
                      <label className="tr-sr" htmlFor={`tr-end-${index}`}>End seconds</label>
                      <input
                        id={`tr-end-${index}`}
                        className="tr-input tr-mono tr-num"
                        type="number"
                        min={0}
                        step={0.1}
                        value={Number(region.end.toFixed(3))}
                        onChange={(event) => setRegionEdge(index, 'end', Number(event.target.value))}
                      />
                      <button
                        type="button"
                        className="tr-btn tr-btn--ghost"
                        onClick={() => setRegions((previous) => previous.filter((_, position) => position !== index))}
                        aria-label={`Remove region ${index + 1}`}
                      >
                        Remove
                      </button>
                    </div>
                    <p className="tr-region__len tr-mono">
                      {timecode(region.start)} → {timecode(region.end)} ·{' '}
                      {(region.end - region.start).toFixed(3)} s
                    </p>
                  </li>
                ))}
              </ol>
            )}

            <button
              type="button"
              className="tr-btn tr-btn--outline tr-btn--wide"
              onClick={addRegionAtPlayhead}
              disabled={!readable}
            >
              Add a region at the playhead
            </button>
            {!readable && (
              <p className="tr-hint">
                Regions need a measured length first — there is nothing to place them against
                otherwise.
              </p>
            )}
          </div>

          {execute.state.phase !== 'idle' && (
            <div className="tr-report">
              <ToolResultPanel
                state={execute.state}
                toolId={TRIMMER_ID}
                toolName={manifest.name}
                onRerun={execute.reset}
              />
            </div>
          )}
        </aside>

        <main className="tr-field-main">
          <div
            className="tr-strip-wrap"
            data-scrubbing={scrubbing || drag ? 'true' : 'false'}
            onDragOver={(event) => event.preventDefault()}
            onDrop={onStripDrop}
          >
            <div className="tr-strip-head">
              <span className="tr-mono tr-strip__time">{timecode(readable ? playhead : 0)}</span>
              <span className="tr-strip__mid">
                {readable ? `${readable.toFixed(3)} s measured` : 'no measured length'}
              </span>
              <span className="tr-mono tr-strip__time">
                {readable ? timecode(readable) : '--:--.---'}
              </span>
            </div>

            <div
              className="tr-strip"
              ref={stripRef}
              data-live={readable ? 'true' : 'false'}
              role="slider"
              tabIndex={readable ? 0 : -1}
              aria-label="Timeline playhead position in seconds"
              aria-valuemin={0}
              aria-valuemax={readable ? Math.round(readable) : 0}
              aria-valuenow={readable ? Number(playhead.toFixed(1)) : 0}
              aria-valuetext={readable ? timecode(playhead) : 'no measured length'}
              onPointerDown={onStripPointerDown}
              onPointerMove={onStripPointerMove}
              onPointerUp={endGesture}
              onPointerLeave={endGesture}
              onKeyDown={(event) => {
                if (!readable) return
                if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                  event.preventDefault()
                  setPlayhead(clamp(playhead + (event.key === 'ArrowLeft' ? -1 : 1), 0, readable))
                }
              }}
            >
              {readable ? (
                <>
                  <div className="tr-strip__segments" aria-hidden="true">
                    {segments.map((segment) => (
                      <div
                        className="tr-seg"
                        key={segment.key}
                        data-inside={segment.inside ? 'true' : 'false'}
                        style={{ flexGrow: segment.end - segment.start, flexBasis: 0 }}
                      >
                        {segment.letters.map((glyph, index) => (
                          <span
                            className="tr-glyph"
                            key={`${segment.key}-${index}`}
                            style={{ left: `${((index + 0.5) / segment.letters.length) * 100}%` }}
                          >
                            {glyph}
                          </span>
                        ))}
                      </div>
                    ))}
                  </div>

                  {regions.map((region, index) => (
                    <div className="tr-handles" key={index}>
                      <button
                        type="button"
                        className="tr-handle"
                        data-trim-handle="start"
                        data-edge="start"
                        role="slider"
                        aria-label={`Region ${index + 1} start, ${timecode(region.start)}`}
                        aria-valuemin={0}
                        aria-valuemax={Math.round(readable)}
                        aria-valuenow={Number(region.start.toFixed(1))}
                        style={{ left: `${(region.start / readable) * 100}%` }}
                        onPointerDown={startHandleDrag(index, 'start')}
                        onPointerMove={onStripPointerMove}
                        onPointerUp={endGesture}
                        onKeyDown={nudgeHandle(index, 'start')}
                      >
                        C
                      </button>
                      <button
                        type="button"
                        className="tr-handle"
                        data-trim-handle="end"
                        data-edge="end"
                        role="slider"
                        aria-label={`Region ${index + 1} end, ${timecode(region.end)}`}
                        aria-valuemin={0}
                        aria-valuemax={Math.round(readable)}
                        aria-valuenow={Number(region.end.toFixed(1))}
                        style={{ left: `${(region.end / readable) * 100}%` }}
                        onPointerDown={startHandleDrag(index, 'end')}
                        onPointerMove={onStripPointerMove}
                        onPointerUp={endGesture}
                        onKeyDown={nudgeHandle(index, 'end')}
                      >
                        T
                      </button>
                    </div>
                  ))}

                  <div className="tr-playhead" style={{ left: `${(playhead / readable) * 100}%` }} aria-hidden="true" />
                </>
              ) : (
                <p className="tr-strip__off">
                  {probe.phase === 'failed' && probe.for === inputPath.trim()
                    ? 'The length of this source is unknown, so there is no axis to cut against.'
                    : probe.phase === 'probing' && probe.for === inputPath.trim()
                      ? 'Asking the backend how long this source is…'
                      : 'Set a source and measure it to open the timeline.'}
                </p>
              )}
            </div>

            <div className="tr-strip-foot">
              <span className="tr-mono">0.000 s</span>
              <span className="tr-hint">
                {readable
                  ? 'Drag the C and T glyphs to move a region edge. Click anywhere on the band to scrub the playhead.'
                  : 'The band needs a measured length. Drop a file on it to start.'}
              </span>
            </div>
          </div>
        </main>
      </div>

      <footer className="tr-dock" data-tool-gate-region={TRIMMER_ID}>
        <div className="tr-dock__main">
          <button
            type="button"
            className="tr-btn tr-btn--accent tr-btn--run"
            onClick={() => void run()}
            disabled={!canRun}
          >
            {execute.busy
              ? `Cutting… ${execute.state.elapsedSeconds.toFixed(1)}s`
              : regions.length > 0
                ? `Cut ${regions.length} ${regions.length === 1 ? 'region' : 'regions'}`
                : 'Cut the selected regions'}
          </button>
          <button type="button" className="tr-btn tr-btn--outline" onClick={clear} disabled={execute.busy}>
            Clear
          </button>

          <p className="tr-dock__note" role="status">
            {execute.busy
              ? `Running — ${execute.state.elapsedSeconds.toFixed(1)}s measured.`
              : urlOnly
                ? 'This backend cuts a file on this machine, so a URL cannot be trimmed here — download it first.'
                : stale
                  ? 'The source or regions changed since that run. Its output is below and no longer matches these settings.'
                  : regions.length === 0
                    ? 'No regions selected, so there is nothing to cut.'
                    : `${regions.length} ${regions.length === 1 ? 'region' : 'regions'} · ${regions
                        .reduce((sum, region) => sum + (region.end - region.start), 0)
                        .toFixed(3)} s selected of ${readable?.toFixed(3) ?? '—'} s`}
          </p>
        </div>

        <div className="tr-dock__gate">
          <DependencyGate toolId={TRIMMER_ID} state={deps} accent="#3B82F6" />
        </div>
      </footer>
    </div>
  )
}