import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  ChevronDown,
  ChevronRight,
  FileUp,
  Gauge,
  Link2,
  Loader2,
  Play,
  Radio,
  Search,
  Square,
  Terminal,
  Trash2,
  Video,
} from 'lucide-react'
import { api, errorMessage, resolveUrl, type DownloadTask, type ToolManifest } from '../../lib/api'
import { useToolExecute } from '../../hooks/useToolExecute'
import DependencyGate from '../../components/deps/DependencyGate'
import { useToolDeps } from '../../hooks/useToolDeps'
import ToolResultPanel from '../../components/tools/ToolResultPanel'
import DownloaderForm from '../../components/tools/DownloaderForm'
import DynamicForm from '../../components/common/DynamicForm'
import RequiredFieldError from '../../components/common/RequiredFieldError'
import type { ToolPageProps, ToolExecutionState } from '../../lib/toolPageTypes'

const DOWNLOADER_ID = 'media.download.yt-dlp'

/** The four atomic media helpers, each a real standalone tool id with its own manifest. */
const RESOLVE_ID = 'media.download.resolve'
const FORMAT_ID = 'media.download.format_select'
const SUBTITLE_ID = 'media.subtitle.fetch'
const THUMBNAIL_ID = 'media.thumbnail.get'
const HELPER_IDS = [RESOLVE_ID, FORMAT_ID, SUBTITLE_ID, THUMBNAIL_ID] as const

/**
 * Keys that `DownloaderForm` renders with a labelled control whose onChange writes
 * that exact key into the params object. Verified against
 * frontend/src/components/tools/DownloaderForm.tsx.
 */
const DOWNLOADER_FORM_KEYS: ReadonlySet<string> = new Set([
  'url',
  'download_mode',
  'format_preset',
  'audio_format',
  'extract_audio',
  'writesubtitles',
  'embed_subs',
  'embed_thumbnail',
  'cookies_from_browser',
  'limit_rate',
  'output_template',
  'raw_args',
])

/**
 * `POST /api/workspaces/{id}/pipeline/resolve-url` is workspace-scoped in its path
 * but the handler never reads the id — it calls `resolve_media_url(url)` directly
 * (backend/app/main.py). `ToolPageProps` carries no workspace id, so a fixed
 * scope segment is used to reach the real resolver endpoint. No data is faked.
 */
const RESOLVE_SCOPE_ID = 'tool-scope'

const ACTIVE_STATUSES = new Set(['queued', 'running'])
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled'])
const POLL_MS = 4000

type Tone = 'info' | 'ok' | 'error'
interface LogLine {
  id: number
  at: string
  text: string
  tone: Tone
}

interface ProbeState {
  state: 'idle' | 'probing' | 'ready' | 'error'
  title?: string | null
  author?: string | null
  duration?: number | null
  thumbnail?: string | null
  provider?: string | null
  error?: string | null
  /** Every key the backend actually sent back, so nothing is hidden from the user. */
  keys: string[]
}

interface ResolveProbe {
  ok: boolean
  title?: string | null
  duration_seconds?: number | null
  uploader?: string | null
  extractor?: string | null
  thumbnail?: string | null
  is_live?: boolean
  error?: unknown
}

function stamp(): string {
  return new Date().toISOString().slice(11, 23)
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function formatBytes(bytes: number): string {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  let n = bytes
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i += 1
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function formatDuration(seconds: number): string {
  const total = Math.round(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (v: number) => String(v).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

/** Real progress fields only — nothing is derived when the payload is silent. */
function ProgressReadout({
  live,
  status,
}: {
  live: Record<string, unknown>
  status: string
}) {
  const percent = numberOrNull(live.percent)
  const downloaded = numberOrNull(live.downloaded_bytes)
  const total = numberOrNull(live.total_bytes)
  const speed = textOrNull(live.speed)
  const eta = textOrNull(live.eta)
  const empty =
    percent === null && downloaded === null && total === null && speed === null && eta === null

  if (empty) {
    return (
      <span className="text-[12px] text-slate-500">
        no progress fields reported{status === 'queued' ? ' while queued' : ''}
      </span>
    )
  }

  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-slate-400">
      {percent !== null ? (
        <>
          <span className="tabular-nums text-emerald-300">{percent.toFixed(1)}%</span>
          <span className="h-1.5 w-24 overflow-hidden border border-emerald-500/40 bg-slate-900">
            <span
              className="block h-full bg-emerald-400"
              style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
            />
          </span>
          <span className="text-slate-600">(backend percent)</span>
        </>
      ) : null}
      {downloaded !== null || total !== null ? (
        <span className="tabular-nums">
          {downloaded === null ? 'downloaded: —' : formatBytes(downloaded)}
          {' / '}
          {total === null ? 'total: —' : formatBytes(total)}
        </span>
      ) : null}
      {speed ? <span>speed {speed}</span> : null}
      {eta ? <span>eta {eta}</span> : null}
    </span>
  )
}

function ConsoleFrame({
  title,
  icon,
  accent = 'border-slate-800',
  children,
  action,
}: {
  title: string
  icon: ReactNode
  accent?: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <section className={`border ${accent} bg-[#0d131b]`}>
      <header className="flex items-center justify-between gap-2 border-b border-slate-800 bg-[#111a24] px-3 py-2">
        <h2 className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.18em] text-slate-300">
          <span className="text-emerald-400">{icon}</span>
          {title}
        </h2>
        {action}
      </header>
      <div className="p-3">{children}</div>
    </section>
  )
}

function HelperSection({
  helperId,
  helperManifest,
  helperError,
  helperParams,
  onHelperParams,
  open,
  onToggle,
  executeState,
  onRun,
  busy,
  renderResult,
}: {
  helperId: string
  helperManifest: ToolManifest | null
  helperError: string | null
  helperParams: Record<string, unknown>
  onHelperParams: (next: Record<string, unknown>) => void
  open: boolean
  onToggle: () => void
  executeState: ToolExecutionState
  onRun: () => void
  busy: boolean
  renderResult: () => ReactNode
}) {
  return (
    <section className="border border-slate-800 bg-[#0d131b]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 border-b border-slate-800 bg-[#111a24] px-3 py-2 text-left"
      >
        <span className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.18em] text-slate-300">
          {open ? <ChevronDown className="size-3.5 text-emerald-400" /> : <ChevronRight className="size-3.5 text-emerald-400" />}
          <span className="text-slate-500">helper</span>
          <span className="normal-case tracking-normal text-slate-200">{helperManifest?.name ?? helperId}</span>
        </span>
        <span className="font-mono text-[12px] text-slate-500">{helperId}</span>
      </button>

      {open && (
        <div className="space-y-3 p-3">
          <p className="font-mono text-[12px] text-slate-500">
            {helperManifest?.description ?? (helperError ? '' : 'loading manifest…')}
          </p>
          {helperError && (
            <p role="alert" className="border border-rose-800 bg-rose-950/40 p-2 text-[12px] text-rose-300">
              {helperError}
            </p>
          )}
          {helperManifest && (
            <div className="border border-slate-800 bg-[#0a0f16] p-3">
              <DynamicForm
                schema={helperManifest.parameters_schema ?? {}}
                value={helperParams}
                onChange={onHelperParams}
              />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onRun}
              disabled={busy || !helperManifest}
              className="inline-flex items-center gap-1.5 border border-emerald-500/50 bg-emerald-500/10 px-3 py-1.5 text-[12px] font-bold uppercase tracking-wider text-emerald-300 disabled:opacity-40"
            >
              {busy ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3 fill-current" />}
              {busy ? `running ${executeState.elapsedSeconds.toFixed(1)}s` : 'run helper'}
            </button>
            <span className="font-mono text-[12px] text-slate-600">
              posts {'{ kind: "standalone", destination: "", params }'} to /api/tools/{helperId}/execute
            </span>
          </div>
          {executeState.phase !== 'idle' && renderResult()}
        </div>
      )}
    </section>
  )
}

export default function DownloaderPage({
  manifest,
  initialParams,
  initialInputPath,
  onComplete,
  onSendToTool,
  onOpenAudioPlayer,
}: ToolPageProps) {
  const [params, setParams] = useState<Record<string, unknown>>(() =>
    initialInputPath && !initialParams.url ? { ...initialParams, url: initialInputPath } : initialParams,
  )

  // ---- schema coverage -----------------------------------------------------
  const schema = useMemo(() => manifest.parameters_schema ?? {}, [manifest])
  const allKeys = useMemo(() => Object.keys(schema), [schema])
  const complementKeys = useMemo(
    () => allKeys.filter((key) => !DOWNLOADER_FORM_KEYS.has(key)),
    [allKeys],
  )
  const complementSchema = useMemo(
    () => Object.fromEntries(complementKeys.map((key) => [key, schema[key]])),
    [complementKeys, schema],
  )

  // ---- queue ---------------------------------------------------------------
  const [tasks, setTasks] = useState<DownloadTask[]>([])
  const [queueError, setQueueError] = useState<string | null>(null)
  const [queueBusy, setQueueBusy] = useState(false)
  const [liveProgress, setLiveProgress] = useState<Record<string, Record<string, unknown>>>({})
  const [now, setNow] = useState(() => Date.now())
  const [log, setLog] = useState<LogLine[]>([])
  const logSeq = useRef(0)
  const streams = useRef(new Map<string, EventSource>())

  // ---- intake / probe ------------------------------------------------------
  const [probe, setProbe] = useState<ProbeState>({ state: 'idle', keys: [] })
  const [dropNote, setDropNote] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  // ---- queue settings ------------------------------------------------------
  const [settings, setSettings] = useState<{ max_concurrent: number; persisted: number } | null>(null)
  const [settingsDraft, setSettingsDraft] = useState('')
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [settingsNote, setSettingsNote] = useState<string | null>(null)

  // ---- standalone ----------------------------------------------------------
  const standalone = useToolExecute(DOWNLOADER_ID)
  const deps = useToolDeps(DOWNLOADER_ID)
  const [enqueueNote, setEnqueueNote] = useState<string | null>(null)

  // ---- atomic helpers ------------------------------------------------------
  const resolveExec = useToolExecute(RESOLVE_ID)
  const formatExec = useToolExecute(FORMAT_ID)
  const subtitleExec = useToolExecute(SUBTITLE_ID)
  const thumbnailExec = useToolExecute(THUMBNAIL_ID)
  const [helperManifests, setHelperManifests] = useState<Record<string, ToolManifest>>({})
  const [helperErrors, setHelperErrors] = useState<Record<string, string>>({})
  const [helperParams, setHelperParams] = useState<Record<string, Record<string, unknown>>>({})
  const [openHelpers, setOpenHelpers] = useState<Record<string, boolean>>({})
  const [resolveProbe, setResolveProbe] = useState<ResolveProbe | null>(null)
  const [resolveProbeError, setResolveProbeError] = useState<string | null>(null)
  const [thumbnailBroken, setThumbnailBroken] = useState(false)

  const setHelperParam = useCallback((helperId: string, next: Record<string, unknown>) => {
    setHelperParams((prev) => ({ ...prev, [helperId]: { ...(prev[helperId] ?? {}), ...next } }))
  }, [])

  const appendLog = useCallback((text: string, tone: Tone = 'info') => {
    logSeq.current += 1
    const line: LogLine = { id: logSeq.current, at: stamp(), text, tone }
    setLog((prev) => [...prev.slice(-199), line])
  }, [])

  // ---- queue loading -------------------------------------------------------
  const refreshQueue = useCallback(async () => {
    try {
      const { downloads } = await api.listDownloads()
      setTasks(downloads)
      setQueueError(null)
      return downloads
    } catch (err) {
      setQueueError(errorMessage(err) || 'GET /api/downloads failed.')
      return []
    }
  }, [])

  const closeStream = useCallback((taskId: string) => {
    const stream = streams.current.get(taskId)
    if (stream) {
      stream.close()
      streams.current.delete(taskId)
    }
  }, [])

  const subscribe = useCallback(
    (taskId: string) => {
      if (streams.current.has(taskId)) return
      if (typeof EventSource === 'undefined') return
      const stream = new EventSource(api.downloadStreamUrl(taskId))
      streams.current.set(taskId, stream)
      stream.onmessage = (event) => {
        let payload: Record<string, unknown>
        try {
          payload = JSON.parse(event.data) as Record<string, unknown>
        } catch {
          appendLog(`${taskId} :: unparsable SSE frame`, 'error')
          return
        }
        setLiveProgress((prev) => ({ ...prev, [taskId]: payload }))
        appendLog(`${taskId} :: ${JSON.stringify(payload)}`)
        const status = typeof payload.status === 'string' ? payload.status : ''
        if (TERMINAL_STATUSES.has(status)) {
          closeStream(taskId)
          void refreshQueue()
        }
      }
      stream.onerror = () => {
        appendLog(`${taskId} :: SSE stream closed by the server`)
        closeStream(taskId)
        void refreshQueue()
      }
    },
    [appendLog, closeStream, refreshQueue],
  )

  // initial load + helper manifests
  useEffect(() => {
    let active = true
    void refreshQueue()
    api
      .getDownloadSettings()
      .then((value) => {
        if (!active) return
        setSettings(value)
        setSettingsDraft(String(value.max_concurrent))
      })
      .catch((err) => active && setSettingsError(errorMessage(err) || 'GET /api/settings/download failed.'))
    for (const helperId of HELPER_IDS) {
      api
        .getTool(helperId)
        .then((helperManifest) => {
          if (!active) return
          setHelperManifests((prev) => ({ ...prev, [helperId]: helperManifest }))
          setHelperParams((prev) => {
            if (prev[helperId]) return prev
            const seeded: Record<string, unknown> = {}
            for (const [key, spec] of Object.entries(helperManifest.parameters_schema ?? {})) {
              if (spec && typeof spec === 'object' && 'default' in spec) seeded[key] = (spec as { default: unknown }).default
            }
            return { ...prev, [helperId]: seeded }
          })
        })
        .catch((err) => {
          if (!active) return
          setHelperErrors((prev) => ({ ...prev, [helperId]: errorMessage(err) || `GET /api/tools/${helperId} failed.` }))
        })
    }
    return () => {
      active = false
    }
  }, [refreshQueue])

  // subscribe to live tasks, close finished ones, and unmount cleanly
  useEffect(() => {
    for (const task of tasks) {
      if (ACTIVE_STATUSES.has(task.status)) subscribe(task.id)
      else closeStream(task.id)
    }
  }, [tasks, subscribe, closeStream])

  useEffect(
    () => () => {
      for (const stream of streams.current.values()) stream.close()
      streams.current.clear()
    },
    [],
  )

  const hasActive = useMemo(() => tasks.some((task) => ACTIVE_STATUSES.has(task.status)), [tasks])

  // measured wall-clock elapsed only, and it never fabricates progress
  useEffect(() => {
    if (!hasActive) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [hasActive])

  useEffect(() => {
    if (!hasActive) return
    const timer = setInterval(() => {
      void refreshQueue()
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [hasActive, refreshQueue])

  // ---- actions -------------------------------------------------------------
  const runProbe = useCallback(async () => {
    const url = String(params.url ?? '').trim()
    if (!url) return
    setProbe({ state: 'probing', keys: [] })
    try {
      const info = await api.getVideoInfo(url)
      const keys = Object.keys(info ?? {})
      if (!info || info.title == null) {
        setProbe({
          state: 'ready',
          title: null,
          author: info?.author_name ?? null,
          duration: info?.duration ?? null,
          thumbnail: info?.thumbnail_url ?? null,
          provider: info?.provider_name ?? null,
          keys,
        })
        return
      }
      setProbe({
        state: 'ready',
        title: info.title,
        author: info.author_name ?? null,
        duration: info.duration ?? null,
        thumbnail: info.thumbnail_url ?? null,
        provider: info.provider_name ?? null,
        keys,
      })
    } catch (err) {
      setProbe({ state: 'error', error: errorMessage(err) || 'GET /api/tools/downloader/info failed.', keys: [] })
    }
  }, [params.url])

  const readDroppedFile = useCallback(
    async (file: File) => {
      const name = file.name.toLowerCase()
      if (!name.endsWith('.url') && !name.endsWith('.txt')) {
        setDropNote(`rejected ${file.name}: only .url and .txt files are read (got .${name.split('.').pop() ?? '?'})`)
        return
      }
      let text: string
      try {
        text = await file.text()
      } catch (err) {
        setDropNote(`could not read ${file.name}: ${errorMessage(err)}`)
        return
      }
      // A .url file is INI-style ("URL=..."); a .txt is one URL per line.
      const candidates = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('[') && !line.startsWith(';') && !line.startsWith('#'))
        .map((line) => (line.startsWith('URL=') ? line.slice(4).trim() : line))
        .filter((line) => /^https?:\/\//i.test(line))
      const first = candidates[0]
      if (!first) {
        setDropNote(`${file.name} contained no http(s) URL line`)
        return
      }
      setParams((prev) => ({ ...prev, url: first }))
      setDropNote(
        candidates.length > 1
          ? `${file.name}: ${candidates.length} URLs found, the first one is loaded`
          : `${file.name}: 1 URL loaded`,
      )
    },
    [],
  )

  const enqueue = useCallback(async () => {
    setEnqueueNote(null)
    try {
      const res = await api.enqueueDownload(params)
      setEnqueueNote(`POST /api/downloads -> id ${res.id}, status "${res.status}"`)
      appendLog(`enqueue ${res.id} :: status "${res.status}"`, 'ok')
      const downloads = await refreshQueue()
      subscribe(res.id)
      if (!downloads.some((task) => task.id === res.id)) {
        appendLog(`enqueue ${res.id} :: not present in the first /api/downloads response yet`, 'error')
      }
    } catch (err) {
      const message = errorMessage(err) || 'POST /api/downloads failed.'
      setEnqueueNote(message)
      appendLog(`enqueue failed :: ${message}`, 'error')
    }
  }, [params, appendLog, refreshQueue, subscribe])

  const cancelTask = useCallback(
    async (taskId: string) => {
      try {
        const res = await api.cancelDownload(taskId)
        appendLog(`cancel ${taskId} :: cancelled=${res.cancelled}`, res.cancelled ? 'ok' : 'error')
        closeStream(taskId)
        await refreshQueue()
      } catch (err) {
        appendLog(`cancel ${taskId} :: ${errorMessage(err) || 'POST cancel failed.'}`, 'error')
      }
    },
    [appendLog, closeStream, refreshQueue],
  )

  const removeTask = useCallback(
    async (taskId: string) => {
      try {
        const res = await api.removeDownload(taskId)
        appendLog(`remove ${taskId} :: deleted=${res.deleted}`, res.deleted ? 'ok' : 'error')
        closeStream(taskId)
        setLiveProgress((prev) => {
          const next = { ...prev }
          delete next[taskId]
          return next
        })
        await refreshQueue()
      } catch (err) {
        appendLog(`remove ${taskId} :: ${errorMessage(err) || 'DELETE failed.'}`, 'error')
      }
    },
    [appendLog, closeStream, refreshQueue],
  )

  const saveSettings = useCallback(async () => {
    setSettingsError(null)
    setSettingsNote(null)
    const next = Number(settingsDraft)
    if (!Number.isInteger(next) || next < 1) {
      setSettingsError('max_concurrent must be an integer of 1 or more')
      return
    }
    try {
      const res = await api.updateDownloadSettings(next)
      setSettings((prev) => (prev ? { ...prev, max_concurrent: res.max_concurrent } : prev))
      setSettingsNote(`POST /api/settings/download -> max_concurrent ${res.max_concurrent}`)
      appendLog(`settings :: max_concurrent ${res.max_concurrent}`, 'ok')
    } catch (err) {
      setSettingsError(errorMessage(err) || 'POST /api/settings/download failed.')
    }
  }, [settingsDraft, appendLog])

  const runStandalone = useCallback(async () => {
    const result = await standalone.run(params)
    if (result && result.status === 'completed') onComplete?.(result, params)
  }, [standalone, params, onComplete])

  const runResolve = useCallback(async () => {
    setResolveProbe(null)
    setResolveProbeError(null)
    const helperParamsValue = helperParams[RESOLVE_ID] ?? {}
    const url = String(helperParamsValue.url ?? '').trim()
    await resolveExec.run(helperParamsValue)
    if (!url) {
      setResolveProbeError('no url supplied to the resolve endpoint')
      return
    }
    try {
      const probeResult = await api.resolvePipelineUrl(RESOLVE_SCOPE_ID, url)
      setResolveProbe(probeResult)
    } catch (err) {
      setResolveProbeError(errorMessage(err) || 'resolve-url request failed.')
    }
  }, [helperParams, resolveExec])

  const runHelper = useCallback(
    async (helperId: typeof HELPER_IDS[number], exec: ReturnType<typeof useToolExecute>) => {
      if (helperId === RESOLVE_ID) {
        await runResolve()
        return
      }
      await exec.run(helperParams[helperId] ?? {})
    },
    [helperParams, runResolve],
  )

  const urlValue = String(params.url ?? '')
  const canProbe = /^https?:\/\//i.test(urlValue.trim())

  // The URL is a required parameter the backend rejects when empty, so the
  // console says so itself instead of only describing what the backend will
  // say. It reports on blur and clears as soon as there is something to send.
  const [urlTouched, setUrlTouched] = useState(false)
  const urlMissing = urlValue.trim() === ''
  const urlInvalid = urlTouched && urlMissing
  const urlErrorId = 'downloader-url-required'

  // ---- render --------------------------------------------------------------
  return (
    // The console's accent, handed to the shared forms it hosts so the yt-dlp
    // controls are the console's rather than the cream shell's.
    <div
      className="h-full overflow-y-auto bg-[#080c11] font-mono text-slate-200"
      style={{ '--tool-accent': '#34d399' } as CSSProperties}
    >
      <div className="mx-auto w-full max-w-[1800px] space-y-4 px-3 py-4 sm:px-6">
        {/* console header ------------------------------------------------- */}
        <header className="flex flex-col gap-2 border border-emerald-500/30 bg-[#0d131b] px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex size-8 items-center justify-center border border-emerald-500/50 bg-emerald-500/10 text-emerald-300">
              <Terminal className="size-4" />
            </span>
            <div>
              <h1 className="text-base font-bold uppercase tracking-[0.2em] text-emerald-300">transfer console</h1>
              <p className="text-[12px] text-slate-500">{manifest.name}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[12px] uppercase tracking-widest text-slate-500">
            <span className="border border-slate-800 px-2 py-1">{DOWNLOADER_ID}</span>
            <span className="border border-slate-800 px-2 py-1">{manifest.category || 'General'}</span>
            {hasActive && (
              <span className="inline-flex items-center gap-1.5 border border-emerald-500/50 px-2 py-1 text-emerald-300">
                <Radio className="size-3 animate-pulse" /> queue live
              </span>
            )}
          </div>
        </header>

        <div className="grid gap-4 xl:grid-cols-[minmax(360px,440px)_1fr]">
          {/* LEFT RAIL ---------------------------------------------------- */}
          <div className="space-y-4">
            <ConsoleFrame title="intake" icon={<Link2 className="size-3.5" />}>
              <div className="space-y-3">
                <label className="block">
                  <span className="text-[12px] uppercase tracking-[0.18em] text-slate-500">
                    media url <span className="text-rose-400">*</span>
                  </span>
                  <input
                    type="url"
                    value={urlValue}
                    onChange={(event) => setParams((prev) => ({ ...prev, url: event.target.value }))}
                    onBlur={() => setUrlTouched(true)}
                    required
                    aria-required="true"
                    aria-invalid={urlInvalid || undefined}
                    aria-describedby={urlInvalid ? urlErrorId : undefined}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="mt-1 w-full border border-slate-700 bg-[#05090e] px-2.5 py-2 text-[12px] text-slate-100 outline-none placeholder:text-slate-700 focus:border-emerald-500/60"
                  />
                </label>

                <div
                  onDragOver={(event) => {
                    event.preventDefault()
                    setDragOver(true)
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(event) => {
                    event.preventDefault()
                    setDragOver(false)
                    const file = event.dataTransfer?.files?.[0]
                    if (file) void readDroppedFile(file)
                  }}
                  className={`border border-dashed px-3 py-4 text-center text-[12px] ${
                    dragOver ? 'border-emerald-400 bg-emerald-500/10 text-emerald-200' : 'border-slate-700 text-slate-500'
                  }`}
                >
                  <FileUp className="mx-auto mb-1 size-4" />
                  drop a <code className="text-slate-300">.url</code> or <code className="text-slate-300">.txt</code> file
                  <br />
                  <span className="text-slate-600">the file is read in the browser; nothing is uploaded</span>
                </div>
                {dropNote && <p className="text-[12px] text-slate-400">{dropNote}</p>}

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void runProbe()}
                    disabled={!canProbe || probe.state === 'probing'}
                    className="inline-flex items-center gap-1.5 border border-slate-600 px-3 py-1.5 text-[12px] font-bold uppercase tracking-wider text-slate-200 hover:border-emerald-500/60 hover:text-emerald-300 disabled:opacity-40"
                  >
                    {probe.state === 'probing' ? <Loader2 className="size-3 animate-spin" /> : <Search className="size-3" />}
                    probe
                  </button>
                  <button
                    type="button"
                    onClick={() => void enqueue()}
                    disabled={!urlValue.trim() || queueBusy}
                    className="inline-flex items-center gap-1.5 border border-emerald-500/60 bg-emerald-500/10 px-3 py-1.5 text-[12px] font-bold uppercase tracking-wider text-emerald-300 disabled:opacity-40"
                  >
                    <Play className="size-3 fill-current" /> enqueue download
                  </button>
                  <span className="text-[12px] text-slate-600">POST /api/downloads</span>
                </div>
                {urlInvalid && (
                  <RequiredFieldError
                    id={urlErrorId}
                    message="a url is required before the backend will accept the task"
                    className="text-rose-300"
                  />
                )}
                {enqueueNote && <p className="text-[12px] text-emerald-300">{enqueueNote}</p>}

                {/* Probe result: only the fields the endpoint actually sent. */}
                <div className="border border-slate-800 bg-[#05090e] p-2.5">
                  {probe.state === 'idle' && (
                    <p className="text-[12px] text-slate-600">
                      no probe yet — GET /api/tools/downloader/info returns only what the backend can resolve
                    </p>
                  )}
                  {probe.state === 'probing' && <p className="text-[12px] text-slate-400">probing…</p>}
                  {probe.state === 'error' && (
                    <p role="alert" className="text-[12px] text-rose-300">
                      {probe.error}
                    </p>
                  )}
                  {probe.state === 'ready' && (
                    <div className="flex gap-3">
                      {probe.thumbnail ? (
                        <img src={probe.thumbnail} alt={probe.title ?? 'probe thumbnail'} className="h-16 w-28 shrink-0 border border-slate-800 object-cover" />
                      ) : (
                        <div className="flex h-16 w-28 shrink-0 items-center justify-center border border-slate-800 text-slate-700">
                          <Video className="size-5" />
                        </div>
                      )}
                      <dl className="min-w-0 flex-1 space-y-0.5 text-[12px]">
                        <div className="flex gap-2">
                          <dt className="w-16 shrink-0 text-slate-600">title</dt>
                          <dd className="min-w-0 truncate text-slate-100">{probe.title ?? <span className="text-slate-600">null</span>}</dd>
                        </div>
                        <div className="flex gap-2">
                          <dt className="w-16 shrink-0 text-slate-600">author</dt>
                          <dd className="truncate text-slate-300">{probe.author ?? <span className="text-slate-600">null</span>}</dd>
                        </div>
                        <div className="flex gap-2">
                          <dt className="w-16 shrink-0 text-slate-600">duration</dt>
                          <dd className="tabular-nums text-slate-300">
                            {probe.duration == null ? <span className="text-slate-600">null</span> : `${formatDuration(probe.duration)} (${probe.duration}s)`}
                          </dd>
                        </div>
                        <div className="flex gap-2">
                          <dt className="w-16 shrink-0 text-slate-600">provider</dt>
                          <dd className="truncate text-slate-300">{probe.provider ?? <span className="text-slate-600">null</span>}</dd>
                        </div>
                      </dl>
                    </div>
                  )}
                  {probe.keys.length > 0 && (
                    <p className="mt-2 border-t border-slate-800 pt-1.5 text-[12px] text-slate-600">
                      response keys: {probe.keys.join(', ')}
                      {!probe.title && ' — title was null, so this url could not be resolved'}
                    </p>
                  )}
                </div>
              </div>
            </ConsoleFrame>

            <ConsoleFrame title="yt-dlp controls" icon={<Gauge className="size-3.5" />}>
              <DownloaderForm value={params} onChange={setParams} />
              <p className="mt-3 border-t border-slate-800 pt-2 text-[12px] text-slate-600">
                DownloaderForm writes these {DOWNLOADER_FORM_KEYS.size} keys: {[...DOWNLOADER_FORM_KEYS].join(', ')}
              </p>
            </ConsoleFrame>

            <ConsoleFrame title={`remaining manifest parameters (${complementKeys.length})`} icon={<FileUp className="size-3.5" />}>
              {complementKeys.length === 0 ? (
                <p className="text-[12px] text-slate-500">every manifest key is already bound above</p>
              ) : (
                <>
                  <p className="mb-2 text-[12px] text-slate-600">
                    schema-driven fields for the keys DownloaderForm has no control for: {complementKeys.join(', ')}
                  </p>
                  <div className="border border-slate-800 bg-[#05090e] p-3">
                    <DynamicForm schema={complementSchema} value={params} onChange={setParams} />
                  </div>
                </>
              )}
            </ConsoleFrame>

            <ConsoleFrame title="queue concurrency" icon={<Gauge className="size-3.5" />}>
              <div className="flex flex-wrap items-end gap-2">
                <label className="block">
                  <span className="text-[12px] uppercase tracking-[0.18em] text-slate-500">max_concurrent</span>
                  <input
                    type="number"
                    min={1}
                    value={settingsDraft}
                    onChange={(event) => setSettingsDraft(event.target.value)}
                    className="mt-1 w-24 border border-slate-700 bg-[#05090e] px-2 py-1.5 text-[12px] text-slate-100 outline-none focus:border-emerald-500/60"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void saveSettings()}
                  className="border border-slate-600 px-3 py-1.5 text-[12px] font-bold uppercase tracking-wider text-slate-200 hover:border-emerald-500/60 hover:text-emerald-300"
                >
                  save
                </button>
                {settings && (
                  <span className="text-[12px] text-slate-600">
                    backend reports max_concurrent {settings.max_concurrent} (persisted {settings.persisted})
                  </span>
                )}
              </div>
              {settingsError && (
                <p role="alert" className="mt-2 text-[12px] text-rose-300">
                  {settingsError}
                </p>
              )}
              {settingsNote && <p className="mt-2 text-[12px] text-emerald-300">{settingsNote}</p>}
            </ConsoleFrame>

            <ConsoleFrame title="standalone execute" icon={<Play className="size-3.5" />}>
              <div className="space-y-2">
                <p className="text-[12px] text-slate-600">
                  bypasses the queue and calls POST /api/tools/{DOWNLOADER_ID}/execute with the same {allKeys.length} params
                </p>

                <button
                  type="button"
                  onClick={() => void runStandalone()}
                  disabled={standalone.busy || !deps.ready}
                  className="inline-flex w-full items-center justify-center gap-1.5 border border-slate-600 px-3 py-2 text-[12px] font-bold uppercase tracking-wider text-slate-200 hover:border-emerald-500/60 hover:text-emerald-300 disabled:opacity-40"
                >
                  {standalone.busy ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3 fill-current" />}
                  {standalone.busy ? `running ${standalone.state.elapsedSeconds.toFixed(1)}s measured` : 'run standalone'}
                </button>
                {standalone.state.phase !== 'idle' && (
                  <div className="border border-slate-800 bg-[#05090e] p-2">
                    <ToolResultPanel
                      state={standalone.state}
                      toolId={DOWNLOADER_ID}
                      toolName={manifest.name}
                      onRerun={standalone.reset}
                      onSendToTool={onSendToTool}
                      onOpenAudioPlayer={onOpenAudioPlayer}
                    />
                  </div>
                )}
              </div>
            </ConsoleFrame>
          </div>

          {/* RIGHT: live task table ---------------------------------------- */}
          <div className="space-y-4">
            <ConsoleFrame
              title={`live task table (${tasks.length})`}
              icon={<Radio className="size-3.5" />}
              action={
                <button
                  type="button"
                  onClick={() => {
                    setQueueBusy(true)
                    void refreshQueue().finally(() => setQueueBusy(false))
                  }}
                  className="border border-slate-700 px-2 py-1 text-[12px] uppercase tracking-widest text-slate-400 hover:border-emerald-500/60 hover:text-emerald-300"
                >
                  refresh
                </button>
              }
            >
              {queueError && (
                <p role="alert" className="mb-2 border border-rose-800 bg-rose-950/40 p-2 text-[12px] text-rose-300">
                  {queueError}
                </p>
              )}
              {tasks.length === 0 ? (
                <p className="text-[12px] text-slate-600">GET /api/downloads returned an empty queue</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] border-collapse text-left text-[12px]">
                    <thead>
                      <tr className="border-b border-slate-800 text-[12px] uppercase tracking-widest text-slate-600">
                        <th className="py-1.5 pr-3 font-normal">task</th>
                        <th className="py-1.5 pr-3 font-normal">status</th>
                        <th className="py-1.5 pr-3 font-normal">progress (as sent by the backend)</th>
                        <th className="py-1.5 pr-3 font-normal">elapsed</th>
                        <th className="py-1.5 font-normal">actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tasks.map((task) => {
                        const live = liveProgress[task.id] ?? task.progress ?? {}
                        const beginMs =
                          (task.started_at ? task.started_at * 1000 : null) ??
                          (task.created_at ? task.created_at * 1000 : null)
                        const endMs = task.completed_at ? task.completed_at * 1000 : null
                        const referenceMs = endMs ?? (ACTIVE_STATUSES.has(task.status) ? now : null)
                        const elapsedSeconds =
                          beginMs == null || referenceMs == null
                            ? null
                            : Math.max(0, (referenceMs - beginMs) / 1000)
                        return (
                          <tr key={task.id} className="border-b border-slate-900 align-top">
                            <td className="py-2 pr-3">
                              <div className="text-slate-200">{task.id}</div>
                              <div className="max-w-[260px] truncate text-slate-600" title={task.params?.url}>
                                {task.params?.url || 'no url'}
                              </div>
                              <div className="text-slate-700">
                                mode {task.params?.download_mode ?? '—'} / {task.params?.format_preset ?? '—'}
                              </div>
                            </td>
                            <td className="py-2 pr-3">
                              <span
                                className={`inline-flex items-center gap-1 border px-1.5 py-0.5 uppercase tracking-widest ${
                                  task.status === 'completed'
                                    ? 'border-emerald-500/50 text-emerald-300'
                                    : task.status === 'failed'
                                      ? 'border-rose-500/50 text-rose-300'
                                      : ACTIVE_STATUSES.has(task.status)
                                        ? 'border-sky-500/50 text-sky-300'
                                        : 'border-slate-700 text-slate-400'
                                }`}
                              >
                                {task.status}
                              </span>
                              {task.error && (
                                <pre className="mt-1 max-w-[260px] whitespace-pre-wrap break-words text-[12px] text-rose-300">{task.error}</pre>
                              )}
                              {task.result?.artifacts?.length ? (
                                <ul className="mt-1 space-y-0.5">
                                  {task.result.artifacts.map((artifact) => (
                                    <li key={artifact.path} className="max-w-[260px] truncate text-[12px] text-slate-500" title={artifact.path}>
                                      {artifact.name}
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                            </td>
                            <td className="py-2 pr-3">
                              <ProgressReadout live={live} status={task.status} />
                            </td>
                            <td className="py-2 pr-3 tabular-nums text-slate-400">
                              {elapsedSeconds == null ? <span className="text-slate-700">—</span> : `${elapsedSeconds.toFixed(1)}s`}
                            </td>
                            <td className="py-2">
                              <div className="flex gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => void cancelTask(task.id)}
                                  disabled={!ACTIVE_STATUSES.has(task.status)}
                                  title="POST /api/downloads/{id}/cancel"
                                  className="inline-flex items-center gap-1 border border-slate-700 px-2 py-1 text-[12px] uppercase tracking-widest text-slate-300 hover:border-rose-400 hover:text-rose-300 disabled:opacity-30"
                                >
                                  <Square className="size-2.5" /> cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void removeTask(task.id)}
                                  title="DELETE /api/downloads/{id}"
                                  className="inline-flex items-center gap-1 border border-slate-700 px-2 py-1 text-[12px] uppercase tracking-widest text-slate-300 hover:border-rose-400 hover:text-rose-300"
                                >
                                  <Trash2 className="size-2.5" /> remove
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </ConsoleFrame>

            <ConsoleFrame title={`console log (${log.length})`} icon={<Terminal className="size-3.5" />}>
              <div className="max-h-56 overflow-y-auto border border-slate-800 bg-[#05090e] p-2 text-[12px] leading-relaxed">
                {log.length === 0 ? (
                  <p className="text-slate-700">no requests issued yet</p>
                ) : (
                  log.map((line) => (
                    <div key={line.id} className="flex gap-2">
                      <span className="shrink-0 text-slate-700">{line.at}</span>
                      <span
                        className={
                          line.tone === 'error'
                            ? 'text-rose-300'
                            : line.tone === 'ok'
                              ? 'text-emerald-300'
                              : 'text-slate-400'
                        }
                      >
                        {line.text}
                      </span>
                    </div>
                  ))
                )}
              </div>
              <p className="mt-2 text-[12px] text-slate-600">
                every line is a real request or SSE frame from this session — nothing here is generated
              </p>
            </ConsoleFrame>

            <p className="px-1 text-[12px] uppercase tracking-[0.18em] text-slate-600">atomic media helpers</p>

            <HelperSection
              helperId={RESOLVE_ID}
              helperManifest={helperManifests[RESOLVE_ID] ?? null}
              helperError={helperErrors[RESOLVE_ID] ?? null}
              helperParams={helperParams[RESOLVE_ID] ?? {}}
              onHelperParams={(next) => setHelperParam(RESOLVE_ID, next)}
              open={Boolean(openHelpers[RESOLVE_ID])}
              onToggle={() => setOpenHelpers((prev) => ({ ...prev, [RESOLVE_ID]: !prev[RESOLVE_ID] }))}
              executeState={resolveExec.state}
              busy={resolveExec.busy}
              onRun={() => void runHelper(RESOLVE_ID, resolveExec)}
              renderResult={() => (
                <div className="space-y-2">
                  <div className="border border-slate-800 bg-[#05090e] p-2 text-[12px]">
                    <p className="mb-1 text-[12px] uppercase tracking-widest text-slate-600">
                      resolve-url response (POST /api/workspaces/{RESOLVE_SCOPE_ID}/pipeline/resolve-url)
                    </p>
                    {resolveProbeError && <p className="text-rose-300">{resolveProbeError}</p>}
                    {resolveProbe && !resolveProbe.ok && (
                      <p className="text-rose-300">
                        {errorMessage(resolveProbe.error) || 'the resolver reported a failure'}
                      </p>
                    )}
                    {resolveProbe?.ok && (
                      <dl className="grid grid-cols-[90px_1fr] gap-x-3 gap-y-0.5">
                        <dt className="text-slate-600">ok</dt>
                        <dd className="text-emerald-300">{String(resolveProbe.ok)}</dd>
                        <dt className="text-slate-600">title</dt>
                        <dd className="truncate text-slate-100">{resolveProbe.title ?? 'null'}</dd>
                        <dt className="text-slate-600">duration_seconds</dt>
                        <dd className="tabular-nums text-slate-300">
                          {resolveProbe.duration_seconds == null ? 'null' : resolveProbe.duration_seconds}
                        </dd>
                        <dt className="text-slate-600">uploader</dt>
                        <dd className="truncate text-slate-300">{resolveProbe.uploader ?? 'null'}</dd>
                        <dt className="text-slate-600">extractor</dt>
                        <dd className="truncate text-slate-300">{resolveProbe.extractor ?? 'null'}</dd>
                        <dt className="text-slate-600">is_live</dt>
                        <dd className="text-slate-300">{String(resolveProbe.is_live)}</dd>
                        {resolveProbe.thumbnail ? (
                          <>
                            <dt className="text-slate-600">thumbnail</dt>
                            <dd className="truncate text-slate-400">
                              <a className="underline" href={resolveProbe.thumbnail} target="_blank" rel="noreferrer">
                                {resolveProbe.thumbnail}
                              </a>
                            </dd>
                          </>
                        ) : null}
                      </dl>
                    )}
                    {!resolveProbe && !resolveProbeError && (
                      <p className="text-slate-600">run the helper to call the resolver</p>
                    )}
                  </div>
                  <ToolResultPanel
                    state={resolveExec.state}
                    toolId={RESOLVE_ID}
                    toolName={helperManifests[RESOLVE_ID]?.name ?? RESOLVE_ID}
                    onRerun={resolveExec.reset}
                  />
                </div>
              )}
            />

            <HelperSection
              helperId={FORMAT_ID}
              helperManifest={helperManifests[FORMAT_ID] ?? null}
              helperError={helperErrors[FORMAT_ID] ?? null}
              helperParams={helperParams[FORMAT_ID] ?? {}}
              onHelperParams={(next) => setHelperParam(FORMAT_ID, next)}
              open={Boolean(openHelpers[FORMAT_ID])}
              onToggle={() => setOpenHelpers((prev) => ({ ...prev, [FORMAT_ID]: !prev[FORMAT_ID] }))}
              executeState={formatExec.state}
              busy={formatExec.busy}
              onRun={() => void runHelper(FORMAT_ID, formatExec)}
              renderResult={() => (
                <div className="space-y-2">
                  <div className="border border-slate-800 bg-[#05090e] p-2">
                    <p className="mb-1 text-[12px] uppercase tracking-widest text-slate-600">format lines returned by the backend</p>
                    <pre className="whitespace-pre-wrap break-all text-[12px] text-slate-200">
                      {formatExec.state.result?.outputText ?? 'no output_text in this response'}
                    </pre>
                  </div>
                  <ToolResultPanel
                    state={formatExec.state}
                    toolId={FORMAT_ID}
                    toolName={helperManifests[FORMAT_ID]?.name ?? FORMAT_ID}
                    onRerun={formatExec.reset}
                  />
                </div>
              )}
            />

            <HelperSection
              helperId={SUBTITLE_ID}
              helperManifest={helperManifests[SUBTITLE_ID] ?? null}
              helperError={helperErrors[SUBTITLE_ID] ?? null}
              helperParams={helperParams[SUBTITLE_ID] ?? {}}
              onHelperParams={(next) => setHelperParam(SUBTITLE_ID, next)}
              open={Boolean(openHelpers[SUBTITLE_ID])}
              onToggle={() => setOpenHelpers((prev) => ({ ...prev, [SUBTITLE_ID]: !prev[SUBTITLE_ID] }))}
              executeState={subtitleExec.state}
              busy={subtitleExec.busy}
              onRun={() => void runHelper(SUBTITLE_ID, subtitleExec)}
              renderResult={() => (
                <div className="space-y-2">
                  <div className="border border-slate-800 bg-[#05090e] p-2 text-[12px]">
                    <p className="mb-1 text-[12px] uppercase tracking-widest text-slate-600">fetched artifact</p>
                    {subtitleExec.state.result?.artifacts?.length ? (
                      <ul className="space-y-0.5">
                        {subtitleExec.state.result.artifacts.map((artifact) => (
                          <li key={artifact.path} className="break-all text-slate-200">
                            {artifact.name} <span className="text-slate-600">({artifact.kind ?? 'unknown'}) {artifact.path}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-slate-600">this response carried no artifacts</p>
                    )}
                    <p className="mt-1.5 break-all text-slate-400">
                      output_text: {subtitleExec.state.result?.outputText ?? 'null'}
                    </p>
                    <p className="mt-1.5 border-t border-slate-800 pt-1.5 text-[12px] text-amber-300/80">
                      this build&apos;s media.subtitle.fetch returns no language list, so none is shown here
                    </p>
                  </div>
                  <ToolResultPanel
                    state={subtitleExec.state}
                    toolId={SUBTITLE_ID}
                    toolName={helperManifests[SUBTITLE_ID]?.name ?? SUBTITLE_ID}
                    onRerun={subtitleExec.reset}
                  />
                </div>
              )}
            />

            <HelperSection
              helperId={THUMBNAIL_ID}
              helperManifest={helperManifests[THUMBNAIL_ID] ?? null}
              helperError={helperErrors[THUMBNAIL_ID] ?? null}
              helperParams={helperParams[THUMBNAIL_ID] ?? {}}
              onHelperParams={(next) => setHelperParam(THUMBNAIL_ID, next)}
              open={Boolean(openHelpers[THUMBNAIL_ID])}
              onToggle={() => {
                setThumbnailBroken(false)
                setOpenHelpers((prev) => ({ ...prev, [THUMBNAIL_ID]: !prev[THUMBNAIL_ID] }))
              }}
              executeState={thumbnailExec.state}
              busy={thumbnailExec.busy}
              onRun={() => {
                setThumbnailBroken(false)
                void runHelper(THUMBNAIL_ID, thumbnailExec)
              }}
              renderResult={() => {
                const artifact = thumbnailExec.state.result?.artifacts?.[0]
                const previewUrl = artifact ? resolveUrl(`/api/artifacts/content?path=${encodeURIComponent(artifact.path)}`) : null
                return (
                  <div className="space-y-2">
                    <div className="border border-slate-800 bg-[#05090e] p-2 text-[12px]">
                      <p className="mb-1 text-[12px] uppercase tracking-widest text-slate-600">thumbnail preview</p>
                      {!artifact && <p className="text-slate-600">no artifact path to preview yet</p>}
                      {artifact && (
                        <>
                          {previewUrl && !thumbnailBroken ? (
                            <img
                              src={previewUrl}
                              alt={artifact.name}
                              onError={() => setThumbnailBroken(true)}
                              className="max-h-64 border border-slate-800 object-contain"
                            />
                          ) : (
                            <p className="border border-amber-700 bg-amber-950/30 p-2 text-amber-200">
                              the artifact content endpoint did not return an image for this path — the path below is exactly what
                              the backend returned
                            </p>
                          )}
                          <p className="mt-1.5 break-all text-slate-500">artifact path: {artifact.path}</p>
                          <p className="break-all text-slate-600">preview url: {previewUrl}</p>
                        </>
                      )}
                    </div>
                    <ToolResultPanel
                      state={thumbnailExec.state}
                      toolId={THUMBNAIL_ID}
                      toolName={helperManifests[THUMBNAIL_ID]?.name ?? THUMBNAIL_ID}
                      onRerun={thumbnailExec.reset}
                    />
                  </div>
                )
              }}
            />

            <footer className="flex flex-wrap items-center gap-2 px-1 pb-6 text-[12px] uppercase tracking-[0.18em] text-slate-700">
              <span>input {manifest.input_kinds.join(', ') || 'any'}</span>
              <ChevronRight className="size-3" />
              <span>output {manifest.output_kinds.join(', ') || 'any'}</span>
              {manifest.tags?.map((tag) => (
                <span key={tag} className="border border-slate-800 px-1.5 py-0.5">
                  {tag}
                </span>
              ))}
            </footer>
          </div>
        </div>

        {/* The gate owns the primary action on every tool page, so it is pinned
            to the viewport here too rather than buried in a column far down the
            console. Its surfaces stay on this page's palette. */}
        <div
          data-tool-gate-region={DOWNLOADER_ID}
          className="sticky bottom-0 z-drawer -mx-3 border-t border-slate-800 bg-[#080c11]/95 px-3 py-3 backdrop-blur sm:-mx-6 sm:px-6"
        >
          <DependencyGate toolId={DOWNLOADER_ID} state={deps} />
        </div>
      </div>
    </div>
  )
}
