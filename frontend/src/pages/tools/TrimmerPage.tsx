import { useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Copy,
  Download,
  HardDriveDownload,
  Play,
  Plus,
  Scissors,
  Timer,
  Trash2,
  Waves,
} from 'lucide-react'
import ToolPageShell from '../../components/tools/ToolPageShell'
import ToolResultPanel from '../../components/tools/ToolResultPanel'
import UniversalFileInput from '../../components/common/UniversalFileInput'
import { ToolForm } from '../../lib/toolForms'
import { api, errorMessage, resolveUrl, type ArtifactFile, type Run, type Workspace } from '../../lib/api'
import { useToolExecute } from '../../hooks/useToolExecute'
import DependencyGate from '../../components/deps/DependencyGate'
import { useToolDeps } from '../../hooks/useToolDeps'
import type { ToolPageProps } from '../../lib/toolPageTypes'

interface TrimRegion {
  start: number
  end: number
}

type DragKind =
  | { kind: 'create'; index: number; anchor: number }
  | { kind: 'move'; index: number; offset: number }
  | { kind: 'edge'; index: number; edge: 'start' | 'end' }

const MIN_REGION = 0.05
const VIDEO_EXT = /\.(mp4|mkv|webm|mov|avi|m4v|ts)$/i

const round3 = (value: number) => Math.round(value * 1000) / 1000
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

function clock(seconds: number): string {
  const safe = Math.max(0, seconds)
  const minutes = Math.floor(safe / 60)
  return `${minutes}:${(safe - minutes * 60).toFixed(2).padStart(5, '0')}`
}

function looseRegions(raw: unknown): TrimRegion[] {
  if (!Array.isArray(raw)) return []
  const out: TrimRegion[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const { start, end } = item as { start?: unknown; end?: unknown }
    const s = Number(start)
    const e = Number(end)
    if (Number.isFinite(s) && Number.isFinite(e) && e > s && s >= 0) out.push({ start: round3(s), end: round3(e) })
  }
  return out
}

function parseRegions(text: string): { regions: TrimRegion[]; error: string | null } {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    return { regions: [], error: `regions is not valid JSON: ${err instanceof Error ? err.message : String(err)}` }
  }
  if (!Array.isArray(parsed)) {
    return { regions: [], error: 'regions must be a JSON array of { "start": <seconds>, "end": <seconds> } objects.' }
  }
  const regions: TrimRegion[] = []
  for (const [index, item] of parsed.entries()) {
    if (!item || typeof item !== 'object') {
      return { regions: [], error: `regions[${index}] must be an object with numeric start and end.` }
    }
    const { start, end } = item as { start?: unknown; end?: unknown }
    if (typeof start !== 'number' || typeof end !== 'number' || !Number.isFinite(start) || !Number.isFinite(end)) {
      return { regions: [], error: `regions[${index}].start and regions[${index}].end must both be finite numbers.` }
    }
    if (start < 0) return { regions: [], error: `regions[${index}].start must be 0 or greater (got ${start}).` }
    if (end <= start) {
      return { regions: [], error: `regions[${index}].end (${end}) must be greater than its start (${start}).` }
    }
    regions.push({ start: round3(start), end: round3(end) })
  }
  return { regions, error: null }
}

function sourceName(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path
}

export default function TrimmerPage({ manifest, initialParams, initialInputPath, onComplete }: ToolPageProps) {
  const execute = useToolExecute('trimmer')
  const deps = useToolDeps('trimmer')
  const probe = useToolExecute('mediainfo')

  const [params, setParams] = useState<Record<string, unknown>>(() => ({
    ...initialParams,
    ...(initialInputPath ? { input_path: initialInputPath } : {}),
  }))
  const [regionsText, setRegionsText] = useState(() => JSON.stringify(looseRegions(initialParams.regions), null, 2))
  const [regionsJsonError, setRegionsJsonError] = useState<string | null>(null)
  const [duration, setDuration] = useState<number | null>(null)
  const [durationSource, setDurationSource] = useState<string | null>(null)
  const [durationError, setDurationError] = useState<string | null>(null)
  const [mediaUrl, setMediaUrl] = useState('')
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [mode, setMode] = useState<'standalone' | 'workspace'>('standalone')

  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [runId, setRunId] = useState('')
  const [artifactName, setArtifactName] = useState('')
  const [runs, setRuns] = useState<Run[]>([])
  const [runArtifacts, setRunArtifacts] = useState<ArtifactFile[]>([])
  const [workspaceTrim, setWorkspaceTrim] = useState<string[] | null>(null)
  const [workspaceTrimError, setWorkspaceTrimError] = useState<string | null>(null)
  const [workspaceBusy, setWorkspaceBusy] = useState(false)

  const trackRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragKind | null>(null)

  const regions = useMemo(() => looseRegions(params.regions), [params.regions])
  const inputPath = typeof params.input_path === 'string' ? params.input_path : ''
  const inputName = inputPath ? sourceName(inputPath) : ''

  // Any manifest key this page does not render itself is rendered through the
  // shared schema-driven form, so no declared parameter can be dropped.
  const uncoveredSchema = useMemo(() => {
    const out: Record<string, unknown> = {}
    for (const [key, spec] of Object.entries(manifest.parameters_schema ?? {})) {
      if (key !== 'regions') out[key] = spec
    }
    return out
  }, [manifest])

  const applyRegions = (next: TrimRegion[]) => {
    setParams((prev) => ({ ...prev, regions: next }))
    setRegionsText(JSON.stringify(next, null, 2))
    setRegionsJsonError(null)
  }

  const updateRegion = (index: number, patch: Partial<TrimRegion>) => {
    applyRegions(regions.map((region, i) => (i === index ? { ...region, ...patch } : region)))
  }

  const moveRegion = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= regions.length) return
    const next = [...regions]
    const [row] = next.splice(index, 1)
    next.splice(target, 0, row)
    applyRegions(next)
    setActiveIndex(target)
  }

  const problems = useMemo(() => {
    const found: string[] = []
    if (!inputPath) found.push('input_path is empty — the backend rejects the run without a source file.')
    if (regions.length === 0) found.push('regions is empty — the backend rejects the run without at least one region.')
    regions.forEach((region, index) => {
      if (region.end - region.start < MIN_REGION) {
        found.push(`Region ${index + 1} is shorter than ${MIN_REGION}s (${clock(region.start)} → ${clock(region.end)}).`)
      }
      if (duration !== null && region.end > duration + 0.001) {
        found.push(`Region ${index + 1} ends at ${clock(region.end)}, past the measured duration ${clock(duration)}.`)
      }
    })
    return found
  }, [inputPath, regions, duration])

  const readDurationFromFile = async () => {
    setDuration(null)
    setDurationSource(null)
    setDurationError(null)
    const result = await probe.run({ input_path: inputPath })
    if (!result) return
    if (result.status !== 'completed') {
      setDurationError(result.error ?? 'The mediainfo run did not complete.')
      return
    }
    const reported = Number((result.data?.format as { duration?: unknown } | undefined)?.duration)
    if (!Number.isFinite(reported) || reported <= 0) {
      setDurationError(
        `The mediainfo run completed (status "completed") but returned no usable format.duration value, so the timeline has no real length to draw.`,
      )
      return
    }
    setDuration(round3(reported))
    setDurationSource(`mediainfo → format.duration (${reported})`)
  }

  const readDurationFromUrl = async () => {
    setDuration(null)
    setDurationSource(null)
    setDurationError(null)
    try {
      const info = await api.getVideoInfo(mediaUrl)
      if (typeof info.duration !== 'number' || !Number.isFinite(info.duration) || info.duration <= 0) {
        setDurationError('The probe returned no duration for this URL, so there is no real length to draw.')
        return
      }
      setDuration(round3(info.duration))
      setDurationSource(`getVideoInfo → duration (${info.duration})`)
    } catch (err) {
      setDurationError(errorMessage(err) || String(err))
    }
  }

  const timeAt = (clientX: number): number | null => {
    const element = trackRef.current
    if (!element || duration === null || duration <= 0) return null
    const rect = element.getBoundingClientRect()
    if (rect.width <= 0) return null
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1)
    return round3(ratio * duration)
  }

  const applyDrag = (drag: DragKind, time: number) => {
    if (drag.kind === 'create') {
      updateRegion(drag.index, { end: Math.max(time, drag.anchor) })
      return
    }
    const current = regions[drag.index]
    if (!current) return
    if (drag.kind === 'move') {
      const length = current.end - current.start
      const start = clamp(time - drag.offset, 0, Math.max(0, (duration ?? current.end) - length))
      updateRegion(drag.index, { start: round3(start), end: round3(start + length) })
      return
    }
    if (drag.edge === 'start') {
      updateRegion(drag.index, { start: round3(Math.min(time, current.end - MIN_REGION)) })
    } else {
      updateRegion(drag.index, { end: round3(Math.max(time, current.start + MIN_REGION)) })
    }
  }

  const onRegionsText = (text: string) => {
    setRegionsText(text)
    const parsed = parseRegions(text)
    setRegionsJsonError(parsed.error)
    if (!parsed.error) setParams((prev) => ({ ...prev, regions: parsed.regions }))
  }

  const runStandalone = async () => {
    const payload = { ...params, input_path: inputPath, regions }
    const result = await execute.run(payload)
    if (result?.status === 'completed') onComplete?.(result, payload)
  }

  const loadWorkspaces = async () => {
    setWorkspaceTrim(null)
    setWorkspaceTrimError(null)
    try {
      const { workspaces: list } = await api.listWorkspaces()
      setWorkspaces(list)
    } catch (err) {
      setWorkspaceTrimError(errorMessage(err) || String(err))
    }
  }

  const loadRuns = async (id: string) => {
    setRunId('')
    setArtifactName('')
    setRuns([])
    setRunArtifacts([])
    if (!id) return
    try {
      const { runs: list } = await api.listRuns(id)
      setRuns(list)
    } catch (err) {
      setWorkspaceTrimError(errorMessage(err) || String(err))
    }
  }

  const loadArtifacts = async (workspace: string, run: string) => {
    setArtifactName('')
    setRunArtifacts([])
    if (!workspace || !run) return
    try {
      const { artifacts } = await api.listArtifacts(workspace, run)
      setRunArtifacts(artifacts)
    } catch (err) {
      setWorkspaceTrimError(errorMessage(err) || String(err))
    }
  }

  const runWorkspaceTrim = async () => {
    setWorkspaceBusy(true)
    setWorkspaceTrim(null)
    setWorkspaceTrimError(null)
    try {
      const response = await api.trimArtifact(workspaceId, runId, artifactName, regions)
      setWorkspaceTrim(response.artifacts)
    } catch (err) {
      setWorkspaceTrimError(errorMessage(err) || String(err))
    } finally {
      setWorkspaceBusy(false)
    }
  }

  const previewSrc = inputPath ? resolveUrl(`/api/artifacts/content?path=${encodeURIComponent(inputPath)}`) : ''

  return (
    <ToolPageShell
      manifest={manifest}
      gate={<DependencyGate toolId="trimmer" state={deps} />}
      headerActions={
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 font-mono text-xs text-slate-300">
          <Timer className="size-3.5 text-sky-400" />
          {duration === null ? 'duration unknown' : `${clock(duration)} measured`}
        </span>
      }
    >
      <div className="space-y-4 rounded-2xl border border-slate-800 bg-[#0a0e14] p-4 font-mono text-slate-200 shadow-[0_0_0_1px_rgba(148,163,184,0.06)]">
        {/* ── SOURCE ─────────────────────────────────────────────────────────── */}
        <section className="space-y-3" data-param-key="input_path">
          <header className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-sky-400">
            <Waves className="size-3.5" /> Source
          </header>
          <label htmlFor="trimmer-source" className="block text-xs font-semibold text-slate-300">
            Input media path
          </label>
          <UniversalFileInput
            value={inputPath}
            onChange={(path) => setParams((prev) => ({ ...prev, input_path: path ?? '' }))}
            placeholder="/absolute/path/to/media.mp4"
            accept="audio/*,video/*"
          />
          <p className="text-xs text-slate-400">
            Drops and uploads go through <span className="text-slate-200">POST /api/upload</span>; the returned server path is
            what the trimmer receives as <span className="text-slate-200">input_path</span>.
          </p>

          <div className="flex flex-wrap items-end gap-2 pt-1">
            <div className="min-w-64 flex-1">
              <label htmlFor="trimmer-url" className="mb-1 block text-xs font-semibold text-slate-300">
                Or probe a remote URL for its real duration
              </label>
              <input
                id="trimmer-url"
                type="text"
                value={mediaUrl}
                onChange={(event) => setMediaUrl(event.target.value)}
                placeholder="https://…"
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-600 focus:border-sky-500 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => void readDurationFromUrl()}
              disabled={!mediaUrl.trim()}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-100 hover:border-sky-500 disabled:opacity-40"
            >
              Probe URL
            </button>
            <button
              type="button"
              onClick={() => void readDurationFromFile()}
              disabled={!inputPath || probe.busy}
              className="rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-sky-400 disabled:opacity-40"
            >
              {probe.busy ? `Reading… ${probe.state.elapsedSeconds.toFixed(1)}s` : 'Read duration (ffprobe)'}
            </button>
          </div>

          {durationSource && (
            <p className="rounded-lg border border-emerald-800 bg-emerald-950/40 px-2.5 py-1.5 text-xs text-emerald-300">
              Timeline length measured from {durationSource}.
            </p>
          )}
          {durationError && (
            <p className="flex items-start gap-1.5 rounded-lg border border-amber-700 bg-amber-950/40 px-2.5 py-1.5 text-xs text-amber-200">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span className="break-words">{durationError}</span>
            </p>
          )}
          {previewSrc && (
            <div className="max-w-md">
              {VIDEO_EXT.test(inputName) ? (
                <video controls preload="metadata" src={previewSrc} className="w-full rounded-lg border border-slate-800" />
              ) : (
                <audio controls preload="metadata" src={previewSrc} className="w-full" />
              )}
            </div>
          )}
        </section>

        {/* ── TIMELINE ───────────────────────────────────────────────────────── */}
        <section className="space-y-2">
          <header className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-sky-400">
              <Scissors className="size-3.5" /> Timeline
            </span>
            <span className="text-xs text-slate-400">
              {duration === null
                ? 'Length unknown — enter exact seconds below, or read the duration first.'
                : 'Drag across the bar to mark a region. Drag a block to move it, or its edges to trim it.'}
            </span>
          </header>

          <div
            ref={trackRef}
            onPointerDown={(event) => {
              if (event.button !== 0) return
              const time = timeAt(event.clientX)
              if (time === null) return
              event.currentTarget.setPointerCapture(event.pointerId)
              const index = regions.length
              applyRegions([...regions, { start: time, end: time }])
              setActiveIndex(index)
              dragRef.current = { kind: 'create', index, anchor: time }
            }}
            onPointerMove={(event) => {
              const drag = dragRef.current
              if (!drag) return
              const time = timeAt(event.clientX)
              if (time === null) return
              applyDrag(drag, time)
            }}
            onPointerUp={(event) => {
              dragRef.current = null
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId)
              }
            }}
            className={`relative h-20 touch-none select-none rounded-xl border border-slate-800 bg-slate-950 ${
              duration === null ? 'opacity-50' : 'cursor-crosshair'
            }`}
            role="group"
            aria-label="Trim timeline"
          >
            <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-slate-800" />
            {duration !== null &&
              [0, 0.25, 0.5, 0.75, 1].map((ratio) => (
                <span
                  key={ratio}
                  className="pointer-events-none absolute top-1 font-mono text-[10px] text-slate-600"
                  style={{ left: `${ratio * 100}%` }}
                >
                  {clock(round3(ratio * duration))}
                </span>
              ))}
            {duration !== null &&
              regions.map((region, index) => {
                const left = (region.start / duration) * 100
                const width = ((region.end - region.start) / duration) * 100
                const active = index === activeIndex
                return (
                  <div
                    key={index}
                    onPointerDown={(event) => {
                      if (event.button !== 0) return
                      event.stopPropagation()
                      const time = timeAt(event.clientX)
                      if (time === null) return
                      trackRef.current?.setPointerCapture(event.pointerId)
                      setActiveIndex(index)
                      dragRef.current = { kind: 'move', index, offset: time - region.start }
                    }}
                    className={`absolute top-6 flex h-9 items-stretch overflow-hidden rounded-md border text-[10px] font-bold ${
                      active
                        ? 'border-sky-300 bg-sky-500/80 text-slate-950'
                        : 'border-sky-800 bg-sky-900/70 text-sky-200'
                    }`}
                    style={{ left: `${clamp(left, 0, 100)}%`, width: `${Math.max(width, 0.4)}%`, cursor: 'grab' }}
                  >
                    <span
                      onPointerDown={(event) => {
                        event.stopPropagation()
                        trackRef.current?.setPointerCapture(event.pointerId)
                        dragRef.current = { kind: 'edge', index, edge: 'start' }
                      }}
                      className="w-2 shrink-0 cursor-ew-resize bg-slate-950/50"
                      aria-label={`Trim start of region ${index + 1}`}
                    />
                    <span className="flex flex-1 items-center justify-center overflow-hidden px-1 whitespace-nowrap">
                      {clock(region.start)} → {clock(region.end)}
                    </span>
                    <span
                      onPointerDown={(event) => {
                        event.stopPropagation()
                        trackRef.current?.setPointerCapture(event.pointerId)
                        dragRef.current = { kind: 'edge', index, edge: 'end' }
                      }}
                      className="w-2 shrink-0 cursor-ew-resize bg-slate-950/50"
                      aria-label={`Trim end of region ${index + 1}`}
                    />
                  </div>
                )
              })}
          </div>
        </section>

        {/* ── REGION LIST ────────────────────────────────────────────────────── */}
        <section className="space-y-2" data-param-key="regions">
          <header className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-400">
              Regions ({regions.length})
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  // An explicit 0 → 1s region; both numbers are typed values, never a guess about the media.
                  applyRegions([...regions, { start: 0, end: round3(duration === null ? 1 : Math.min(1, duration)) }])
                  setActiveIndex(regions.length)
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-bold text-slate-100 hover:border-sky-500"
              >
                <Plus className="size-3" /> Append region
              </button>
              <button
                type="button"
                onClick={() =>
                  void navigator.clipboard?.writeText(JSON.stringify(regions.map(({ start, end }) => ({ start, end }))))
                }
                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-slate-200 hover:border-sky-500"
              >
                <Copy className="size-3" /> Copy regions
              </button>
            </div>
          </header>

          {regions.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-700 px-3 py-2 text-xs text-slate-400">
              No regions yet. Drag across the timeline bar, or append one and type exact seconds.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {regions.map((region, index) => (
                <li
                  key={index}
                  className={`flex flex-wrap items-end gap-2 rounded-lg border px-2.5 py-2 ${
                    index === activeIndex ? 'border-sky-700 bg-sky-950/40' : 'border-slate-800 bg-slate-900/60'
                  }`}
                >
                  <span className="font-mono text-xs font-bold text-sky-300">#{index + 1}</span>
                  <label className="text-[11px] text-slate-400">
                    <span className="block">start (s)</span>
                    <input
                      type="number"
                      step="0.001"
                      min={0}
                      value={region.start}
                      onChange={(event) => updateRegion(index, { start: round3(Number(event.target.value)) })}
                      className="w-24 rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 text-xs text-slate-100"
                    />
                  </label>
                  <label className="text-[11px] text-slate-400">
                    <span className="block">end (s)</span>
                    <input
                      type="number"
                      step="0.001"
                      min={0}
                      value={region.end}
                      onChange={(event) => updateRegion(index, { end: round3(Number(event.target.value)) })}
                      className="w-24 rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 text-xs text-slate-100"
                    />
                  </label>
                  <span className="font-mono text-xs text-slate-400">{(region.end - region.start).toFixed(3)}s</span>
                  <span className="ml-auto flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveRegion(index, -1)}
                      disabled={index === 0}
                      aria-label={`Move region ${index + 1} earlier`}
                      className="rounded border border-slate-700 p-1 text-slate-300 hover:border-sky-500 disabled:opacity-30"
                    >
                      <ArrowUp className="size-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveRegion(index, 1)}
                      disabled={index === regions.length - 1}
                      aria-label={`Move region ${index + 1} later`}
                      className="rounded border border-slate-700 p-1 text-slate-300 hover:border-sky-500 disabled:opacity-30"
                    >
                      <ArrowDown className="size-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        applyRegions(regions.filter((_, i) => i !== index))
                        setActiveIndex(null)
                      }}
                      aria-label={`Remove region ${index + 1}`}
                      className="rounded border border-slate-700 p-1 text-slate-300 hover:border-rose-500"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <details className="rounded-lg border border-slate-800 bg-slate-900/60 px-2.5 py-1.5">
            <summary className="cursor-pointer text-xs font-semibold text-slate-300">regions (raw JSON)</summary>
            <textarea
              id="trimmer-regions-json"
              value={regionsText}
              onChange={(event) => onRegionsText(event.target.value)}
              rows={Math.min(10, Math.max(3, regions.length * 3 + 1))}
              spellCheck={false}
              className="mt-2 w-full rounded border border-slate-700 bg-slate-950 p-2 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
            />
            {regionsJsonError && (
              <p className="mt-1 break-words text-xs text-rose-300">{regionsJsonError}</p>
            )}
          </details>
        </section>

        {/* ── MODE ───────────────────────────────────────────────────────────── */}
        <section className="space-y-2 border-t border-slate-800 pt-3">
          <div className="flex items-center gap-1.5">
            {(['standalone', 'workspace'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setMode(value)
                  if (value === 'workspace' && workspaces.length === 0) void loadWorkspaces()
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                  mode === value ? 'bg-sky-500 text-slate-950' : 'border border-slate-700 bg-slate-800 text-slate-200'
                }`}
              >
                {value === 'standalone' ? 'Standalone (trimmer tool)' : 'Workspace run (trim endpoint)'}
              </button>
            ))}
          </div>

          {mode === 'standalone' ? (
            <p className="text-xs text-slate-400">
              POSTS <span className="text-slate-200">/api/tools/trimmer/execute</span> with{' '}
              <span className="text-slate-200">{'{ input_path, regions }'}</span>.
            </p>
          ) : (
            <div className="space-y-2">
              <div className="grid gap-2 sm:grid-cols-3">
                <label className="text-[11px] text-slate-400">
                  <span className="mb-1 block">Workspace</span>
                  <select
                    value={workspaceId}
                    onChange={(event) => {
                      setWorkspaceId(event.target.value)
                      setWorkspaceTrim(null)
                      void loadRuns(event.target.value)
                    }}
                    className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
                  >
                    <option value="">— select —</option>
                    {workspaces.map((workspace) => (
                      <option key={workspace.id} value={workspace.id}>
                        {workspace.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-[11px] text-slate-400">
                  <span className="mb-1 block">Run</span>
                  <select
                    value={runId}
                    onChange={(event) => {
                      setRunId(event.target.value)
                      setWorkspaceTrim(null)
                      void loadArtifacts(workspaceId, event.target.value)
                    }}
                    disabled={!workspaceId}
                    className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100 disabled:opacity-40"
                  >
                    <option value="">— select —</option>
                    {runs.map((run) => (
                      <option key={run.id} value={run.id}>
                        {run.id}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-[11px] text-slate-400">
                  <span className="mb-1 block">Artifact</span>
                  <select
                    value={artifactName}
                    onChange={(event) => setArtifactName(event.target.value)}
                    disabled={!runId}
                    className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100 disabled:opacity-40"
                  >
                    <option value="">— select —</option>
                    {runArtifacts.map((artifact) => (
                      <option key={artifact.path} value={artifact.name}>
                        {artifact.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button
                type="button"
                onClick={() => void runWorkspaceTrim()}
                disabled={workspaceBusy || !workspaceId || !runId || !artifactName || regions.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-emerald-950 hover:bg-emerald-400 disabled:opacity-40"
              >
                <HardDriveDownload className="size-3.5" />
                {workspaceBusy ? 'Trimming…' : 'POST /artifacts/{name}/trim'}
              </button>
              {workspaceTrimError && (
                <p className="break-words rounded-lg border border-rose-800 bg-rose-950/50 px-2.5 py-1.5 text-xs text-rose-200">
                  {workspaceTrimError}
                </p>
              )}
              {workspaceTrim && (
                <ul className="space-y-1">
                  {workspaceTrim.map((name) => (
                    <li key={name} className="flex items-center justify-between gap-2 rounded border border-slate-800 px-2 py-1 text-xs">
                      <span className="truncate text-slate-200">{name}</span>
                      <span className="flex items-center gap-1">
                        <a
                          href={api.artifactPreviewUrl(workspaceId, runId, name)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-0.5 text-slate-200 hover:border-sky-500"
                        >
                          <Play className="size-3" /> Preview
                        </a>
                        <a
                          href={api.artifactDownloadUrl(workspaceId, runId, name)}
                          className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-0.5 text-slate-200 hover:border-sky-500"
                        >
                          <Download className="size-3" /> Download
                        </a>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {workspaceTrim && workspaceTrim.length === 0 && (
                <p className="text-xs text-amber-200">
                  The endpoint answered with an empty artifact list — fmpeg produced no segment for these regions.
                </p>
              )}
            </div>
          )}
        </section>

        {Object.keys(uncoveredSchema).length > 0 && (
          <section className="space-y-2 border-t border-slate-800 pt-3">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-400">Other manifest parameters</h3>
            <ToolForm
              toolId={manifest.id}
              schema={uncoveredSchema}
              value={params}
              onChange={setParams}
              disabled={execute.busy}
            />
          </section>
        )}

        {problems.length > 0 && (
          <ul className="space-y-1 rounded-lg border border-amber-800 bg-amber-950/30 px-3 py-2">
            {problems.map((problem) => (
              <li key={problem} className="flex items-start gap-1.5 text-xs text-amber-200">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span>{problem}</span>
              </li>
            ))}
          </ul>
        )}

        {execute.state.phase !== 'idle' && (
          <div className="rounded-xl bg-white/95 p-3 text-slate-900">
            <ToolResultPanel
              state={execute.state}
              toolId={manifest.id}
              toolName={manifest.name}
              onRerun={execute.reset}
            />
          </div>
        )}

        <footer className="space-y-2 border-t border-slate-800 pt-3">

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-slate-400">
              {regions.length} region{regions.length === 1 ? '' : 's'} · {Object.keys(manifest.parameters_schema ?? {}).length}{' '}
              manifest parameter(s)
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={execute.reset}
                disabled={execute.busy}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-bold text-slate-200 disabled:opacity-40"
              >
                Clear results
              </button>
              <button
                type="button"
                onClick={() => void runStandalone()}
                disabled={execute.busy || problems.length > 0 || !deps.ready}
                className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-4 py-1.5 text-xs font-bold text-slate-950 hover:bg-sky-400 disabled:opacity-40"
              >
                <Scissors className="size-3.5" />
                {execute.busy ? `Trimming… ${execute.state.elapsedSeconds.toFixed(1)}s` : 'Cut segments with FFmpeg'}
              </button>
            </div>
          </div>
        </footer>
      </div>
    </ToolPageShell>
  )
}
