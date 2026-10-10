import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, errorMessage, type ToolManifest } from '../../lib/api'
import { useToolExecute } from '../../hooks/useToolExecute'
import { useToolDeps } from '../../hooks/useToolDeps'
import DependencyGate from '../../components/deps/DependencyGate'
import ToolResultPanel from '../../components/tools/ToolResultPanel'
import { formatBytes } from '../../lib/depsApi'
import RealWaveform from './RealWaveform'
import {
  AUDIO_PROCESSOR_ID,
  ALWAYS_STEREO,
  READABLE_KINDS,
  artifactAudioUrl,
  type FieldSpec,
} from './audioProcessorModel'

interface ArtifactIndexEntry {
  name: string
  path: string
  kind: string
  size: number
}

interface RunRecord {
  /** Real returned artifact name, exactly as the backend wrote it. */
  name: string
  path: string
  /** Size read from the artifact index after that run, or null if it is gone. */
  size: number | null
  params: Record<string, unknown>
  /** Measured seconds, from the run itself. */
  seconds: number | null
}

/** `1:05.240` — long enough for a minute and short enough for an hour. */
function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--'
  const whole = Math.floor(seconds)
  const millis = Math.round((seconds - whole) * 1000)
  const minutes = Math.floor(whole / 60)
  const secs = whole % 60
  if (minutes >= 60) return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  return `${minutes}:${String(secs).padStart(2, '0')}.${String(millis).padStart(3, '0')}`
}

export interface AudioProcessorWorkspaceProps {
  manifest: ToolManifest
  initialInputPath?: string
}

/**
 * The working state: the real waveform holds the page and a control rail floats
 * over it. Everything the manifest declares is bound to its own key; the two
 * the tool is known for are set as pill segments because that is what choosing
 * an output format is, and anything a future manifest adds falls through to a
 * plain control rather than being dropped.
 */
export default function AudioProcessorWorkspace({ manifest, initialInputPath }: AudioProcessorWorkspaceProps) {
  const navigate = useNavigate()
  const execute = useToolExecute(AUDIO_PROCESSOR_ID)
  const deps = useToolDeps(AUDIO_PROCESSOR_ID)
  const fileRef = useRef<HTMLInputElement>(null)

  const schema = (manifest.parameters_schema ?? {}) as Record<string, FieldSpec>

  /*
   * Seeded from the manifest's own defaults rather than from this file, so the
   * first run does exactly what the backend would do untouched.
   */
  const [params, setParams] = useState<Record<string, unknown>>(() => {
    const seeded: Record<string, unknown> = {}
    for (const [key, spec] of Object.entries(schema)) {
      if (spec?.default !== undefined) seeded[key] = spec.default
    }
    seeded.input_path = initialInputPath ?? ''
    return seeded
  })

  const [recent, setRecent] = useState<ArtifactIndexEntry[]>([])
  const [index, setIndex] = useState<Record<string, number>>({})
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [history, setHistory] = useState<RunRecord[]>([])
  const [which, setWhich] = useState<'source' | 'result'>('source')
  const [sourceSeconds, setSourceSeconds] = useState<number | null>(null)
  const [resultSeconds, setResultSeconds] = useState<number | null>(null)
  const [waveError, setWaveError] = useState<string | null>(null)
  const [playError, setPlayError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [playToken, setPlayToken] = useState(0)

  const setKey = useCallback(
    (key: string, value: unknown) => setParams((previous) => ({ ...previous, [key]: value })),
    [],
  )

  const inputPath = String(params.input_path ?? '')
  const format = String(params.format ?? '')
  const sampleRate = params.sample_rate

  const refreshIndex = useCallback(async () => {
    const response = await api.getRecentArtifacts()
    const entries = response.artifacts.filter((entry) => READABLE_KINDS.has(entry.kind.toLowerCase()))
    setRecent(entries)
    setIndex(Object.fromEntries(response.artifacts.map((entry) => [entry.path, entry.size])))
  }, [])

  useEffect(() => {
    // A convenience list, not the source of truth for anything on the page.
    refreshIndex().catch(() => undefined)
  }, [refreshIndex])

  const upload = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      const uploaded = await api.uploadFile(file)
      setKey('input_path', uploaded.path)
      setWhich('source')
    } catch (cause: unknown) {
      setUploadError(errorMessage(cause))
    } finally {
      setUploading(false)
    }
  }

  const result = execute.state.result
  const output = result?.status === 'completed' ? result.artifacts[0] : undefined
  const outputPath = output?.path ?? ''

  const shownPath = which === 'result' && outputPath ? outputPath : inputPath
  const shownUrl = shownPath ? artifactAudioUrl(shownPath) : ''

  /*
   * Playback is the waveform itself, so listening to a run is showing that run:
   * a name from the ledger switches the view to those bytes and starts them.
   */
  const listenTo = useCallback((path: string) => {
    if (path === outputPath) {
      setWhich('result')
    } else if (path === inputPath) {
      setWhich('source')
    } else {
      return
    }
    setWaveError(null)
    setPlayToken((token) => token + 1)
  }, [inputPath, outputPath])

  const runSignature = useMemo(
    () => JSON.stringify({ input_path: inputPath, format, sample_rate: sampleRate }),
    [inputPath, format, sampleRate],
  )
  const [lastSignature, setLastSignature] = useState<string | null>(null)
  const stale = result?.status === 'completed' && lastSignature !== null && lastSignature !== runSignature

  const run = async () => {
    setLastSignature(runSignature)
    const ran = await execute.run({
      input_path: inputPath.trim(),
      format,
      sample_rate: sampleRate,
    })
    if (ran?.status === 'completed' && ran.artifacts.length > 0) {
      // Sizes are the artifact index's, read a moment after the write.
      const response = await api.getRecentArtifacts().catch(() => null)
      if (response) setIndex(Object.fromEntries(response.artifacts.map((entry) => [entry.path, entry.size])))
      setHistory((previous) => [
        {
          name: ran.artifacts[0].name,
          path: ran.artifacts[0].path,
          size: response ? (Object.fromEntries(response.artifacts.map((e) => [e.path, e.size]))[ran.artifacts[0].path] ?? null) : null,
          params: { format, sample_rate: sampleRate },
          seconds: ran.durationSeconds ?? null,
        },
        ...previous,
      ])
      setWhich('result')
    }
    refreshIndex().catch(() => undefined)
  }

  const clear = () => {
    execute.reset()
    setLastSignature(null)
    setKey('input_path', '')
    setHistory([])
    setWhich('source')
  }

  const canRun = inputPath.trim() !== '' && !execute.busy && deps.ready

  /*
   * Keys the manifest declares that the two pill controls do not cover. They
   * are rendered generically so a parameter added to the backend cannot be
   * dropped from the page without someone noticing.
   */
  const pillKeys = new Set(['format', 'sample_rate'])
  const otherKeys = Object.keys(schema).filter((key) => !pillKeys.has(key))

  return (
    <div
      className="ap-root"
      onPaste={(event) => {
        const text = event.clipboardData.getData('text').trim()
        if (!text) return
        event.preventDefault()
        setKey('input_path', text)
      }}
    >
      <header className="ap-bar">
        <button type="button" className="ap-bar__home" onClick={() => navigate('/')}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M8.5 2.5 4 7l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          All tools
        </button>
        <span className="ap-bar__mark">
          <span className="ap-bar__dot" aria-hidden="true" />
          {manifest.name}
        </span>
        <span className="ap-bar__id">{AUDIO_PROCESSOR_ID}</span>
      </header>

      <div className="ap-stage">
        <main className="ap-main">
          <div className="ap-wave">
            <div className="ap-wave__head">
              <div className="ap-pills" role="group" aria-label="Which file the waveform shows">
                <button
                  type="button"
                  className="ap-pill"
                  aria-pressed={which === 'source'}
                  disabled={!inputPath}
                  onClick={() => setWhich('source')}
                >
                  Source
                </button>
                <button
                  type="button"
                  className="ap-pill"
                  aria-pressed={which === 'result'}
                  disabled={!output}
                  onClick={() => setWhich('result')}
                >
                  Result
                </button>
              </div>
              <p className="ap-wave__meta">
                {shownPath ? shownPath.split('/').pop() : 'no file chosen'}
                {index[shownPath] !== undefined && <> · {formatBytes(index[shownPath])}</>}
                {(which === 'source' ? sourceSeconds : resultSeconds) !== null && (
                  <> · <span className="ap-mono">{clock((which === 'source' ? sourceSeconds : resultSeconds) as number)}</span></>
                )}
              </p>
              <button
                type="button"
                className="ap-btn ap-btn--small ap-transport"
                disabled={!shownUrl}
                onClick={() => {
                  setWaveError(null)
                  setPlayError(null)
                  setPlayToken((token) => token + 1)
                }}
              >
                {playing ? 'Pause' : 'Play'}
              </button>
            </div>

            <div
              className="ap-wave__stage"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event: DragEvent<HTMLDivElement>) => {
                event.preventDefault()
                void upload(event.dataTransfer.files?.[0])
              }}
            >
              {shownUrl ? (
                <RealWaveform
                  url={shownUrl}
                  waveColor="#1A1A18"
                  progressColor="#B4763A"
                  cursorColor="#8A4F22"
                  playToken={playToken}
                  onPlayingChange={setPlaying}
                  onDuration={(seconds) => {
                    if (which === 'source') setSourceSeconds(seconds)
                    else setResultSeconds(seconds)
                  }}
                  onError={(message) => setWaveError(message)}
                  onPlayError={(message) => setPlayError(message)}
                />
              ) : (
                <div className="ap-wave__empty">
                  <p className="ap-wave__empty-title">
                    {inputPath ? 'No waveform to draw yet.' : 'Nothing to draw yet.'}
                  </p>
                  <p className="ap-wave__empty-body">
                    {inputPath
                      ? 'Press Measure, or choose the file from the rail, and this draws the peaks of the bytes on disk.'
                      : 'Choose a file with Choose a file on the intro page, drop one anywhere on this panel, or type a path this machine can read.'}
                  </p>
                </div>
              )}
            </div>

            <p className="ap-wave__foot">
              {waveError
                ? `The last decode failed: ${waveError}`
                : playError
                  ? `This browser would not start playback: ${playError}`
                  : 'Click the waveform to seek, or use Play. Drop another file anywhere on this panel to change the source.'}
            </p>
          </div>

          {history.length > 0 && (
            <section className="ap-ledger" aria-label="Files this workspace has written">
              <h2 className="ap-ledger__title">Files this workspace has written</h2>
              <ul className="ap-ledger__list">
                {history.map((entry, position) => (
                  <li className="ap-ledger__row" key={`${entry.path}-${position}`}>
                    <div className="ap-ledger__facts">
                      <p className="ap-ledger__name">{entry.name}</p>
                      <p className="ap-ledger__meta ap-mono">
                        {entry.size === null ? 'size not in the index' : formatBytes(entry.size)}
                        {' · '}
                        {String(entry.params.format)}
                        {' · '}
                        {String(entry.params.sample_rate)} Hz
                        {entry.seconds !== null ? ` · ${entry.seconds.toFixed(2)}s measured` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="ap-btn ap-btn--small"
                      onClick={() => listenTo(entry.path)}
                    >
                      Listen
                    </button>
                  </li>
                ))}
              </ul>
              <p className="ap-ledger__note">
                The backend names every output after the source stem and the format, so converting the
                same file to the same format twice writes the same filename and the second run
                replaces the first file on disk.
              </p>
            </section>
          )}

          {execute.state.phase !== 'idle' && (
            <div className="ap-report">
              <ToolResultPanel
                state={execute.state}
                toolId={AUDIO_PROCESSOR_ID}
                toolName={manifest.name}
                onRerun={execute.reset}
                onOpenAudioPlayer={(media) => listenTo(media.path)}
              />
            </div>
          )}
        </main>

        {/* The rail floats over the waveform on a wide viewport. */}
        <aside className="ap-rail" aria-label="Conversion controls">
          <div className="ap-rail__inner">
            <div className="ap-field" data-param-key="input_path">
              <span className="ap-label" title="input_path">Source file</span>
              <input
                id="ap-source"
                className="ap-input"
                type="text"
                value={inputPath}
                placeholder="/absolute/path/clip.mp4"
                aria-label="Path to the file to convert on this machine"
                onChange={(event) => setKey('input_path', event.target.value)}
              />
              <div
                className="ap-drop"
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
                {uploading ? 'Uploading…' : 'Drop a file, or click to browse'}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="audio/*,video/*"
                className="ap-sr"
                aria-label="Upload an audio or video file to convert"
                onChange={(event) => {
                  void upload(event.target.files?.[0])
                  event.target.value = ''
                }}
              />
              {recent.length > 0 && (
                <select
                  className="ap-input"
                  value=""
                  aria-label="Media already on this machine"
                  onChange={(event) => {
                    if (event.target.value) setKey('input_path', event.target.value)
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
                <p className="ap-error" role="alert">
                  {uploadError}
                </p>
              )}
            </div>

            <div className="ap-field" data-param-key="format">
              <span className="ap-label" id="ap-format-label" title="format">
                {schema.format?.title ?? 'Format'}
              </span>
              <div className="ap-pills ap-pills--wrap" role="group" aria-labelledby="ap-format-label">
                {(schema.format?.enum ?? []).map((option) => {
                  const value = String(option)
                  return (
                    <button
                      key={value}
                      type="button"
                      className="ap-pill"
                      aria-pressed={format === value}
                      onClick={() => setKey('format', value)}
                    >
                      {value}
                    </button>
                  )
                })}
              </div>
              <p className="ap-hint">The container the output file is written in.</p>
            </div>

            <div className="ap-field" data-param-key="sample_rate">
              <span className="ap-label" id="ap-rate-label" title="sample_rate">
                {schema.sample_rate?.title ?? 'Sample rate'}
                {schema.sample_rate?.unit ? ` (${schema.sample_rate.unit})` : ''}
              </span>
              <div className="ap-pills ap-pills--wrap" role="group" aria-labelledby="ap-rate-label">
                {(schema.sample_rate?.enum ?? []).map((option) => {
                  const value = Number(option)
                  return (
                    <button
                      key={String(option)}
                      type="button"
                      className="ap-pill"
                      aria-pressed={Number(sampleRate) === value}
                      onClick={() => setKey('sample_rate', value)}
                    >
                      {Number(option) >= 1000 ? `${value / 1000}k` : value}
                    </button>
                  )
                })}
              </div>
              <p className="ap-hint">
                Resampled to this rate on the way out. The source rate is not preserved.
                {ALWAYS_STEREO ? ' Video is dropped and the result is always two channels.' : ''}
              </p>
            </div>

            {otherKeys.map((key) => {
              const spec = schema[key]
              const value = params[key]
              return (
                <div className="ap-field" data-param-key={key} key={key}>
                  <label className="ap-label" htmlFor={`ap-${key}`} title={key}>
                    {spec?.title ?? key}
                  </label>
                  {Array.isArray(spec?.enum) ? (
                    <select
                      id={`ap-${key}`}
                      className="ap-input"
                      value={String(value ?? '')}
                      onChange={(event) => setKey(key, event.target.value)}
                    >
                      {(spec?.enum ?? []).map((option) => (
                        <option key={String(option)} value={String(option)}>
                          {String(option)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={`ap-${key}`}
                      className="ap-input"
                      type={spec?.type === 'number' ? 'number' : 'text'}
                      value={String(value ?? '')}
                      onChange={(event) =>
                        setKey(key, spec?.type === 'number' ? Number(event.target.value) : event.target.value)
                      }
                    />
                  )}
                  {spec?.description && <p className="ap-hint">{spec.description}</p>}
                </div>
              )
            })}
          </div>
        </aside>
      </div>

      <footer className="ap-dock" data-tool-gate-region={AUDIO_PROCESSOR_ID}>
        <button
          type="button"
          className="ap-btn ap-btn--accent ap-btn--run"
          onClick={() => void run()}
          disabled={!canRun}
        >
          {execute.busy
            ? `Converting… ${execute.state.elapsedSeconds.toFixed(1)}s`
            : `Convert to ${format || '—'}${sampleRate ? ` · ${sampleRate} Hz` : ''}`}
        </button>
        <button type="button" className="ap-btn ap-btn--outline" onClick={clear} disabled={execute.busy}>
          Clear
        </button>
        <p className="ap-dock__note" role="status">
          {execute.busy
            ? `Running — ${execute.state.elapsedSeconds.toFixed(1)}s measured.`
            : stale
              ? 'The source or settings changed since that run. Its output is below and no longer matches these settings.'
              : !inputPath
                ? 'No source file yet, so there is nothing to convert.'
                : `${format || '—'} at ${sampleRate ?? '—'} Hz, from ${inputPath.split('/').pop()}`}
        </p>
        <div className="ap-dock__gate">
          <DependencyGate toolId={AUDIO_PROCESSOR_ID} state={deps} accent="#B4763A" />
        </div>
      </footer>

    </div>
  )
}