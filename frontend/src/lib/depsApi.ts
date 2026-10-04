import { ApiError, errorMessage, responseError } from './apiTransport'
import { resolveUrl } from './api'

/**
 * Typed client for the app-owned dependency manager (backend `app/depmgr`).
 *
 * Every field below is transcribed from the backend contract. Nothing is
 * synthesised, defaulted or guessed: a value the backend does not send is
 * `null`/`undefined` here and the UI renders "unknown" rather than inventing one.
 */

export type DepKind = 'conda' | 'pip'
export type DepEntryStatus = 'installed' | 'missing' | 'stale'

export interface DepEntry {
  dep_id: string
  kind: DepKind
  status: DepEntryStatus
  version: string | null
  /** Honest install-size estimate from the frozen catalog. Null when unknown. */
  approx_bytes: number | null
  /** Apparent on-disk bytes, only ever non-null once a prefix exists. */
  measured_bytes: number | null
  provides: string[]
  paths: Record<string, string>
  missing_commands: string[]
  prefix: string | null
  /** ISO-8601 timestamp recorded at install time, or null. */
  installed_at: string | null
  heavy: boolean
  notes: string | null
  reason: string | null
  packages: string[]
  /** Registered tool ids that stop working if this dep is removed. */
  dependents: string[]
}

export interface DepTotals {
  total: number
  installed: number
  missing: number
  stale: number
  heavy_pending: number
  approx_bytes_installed: number
  measured_bytes: number
}

export interface DepsInventory {
  deps_root: string
  micromamba: { installed: boolean; version: string | null; url: string | null }
  totals: DepTotals
  deps: DepEntry[]
}

export interface ToolDepsResponse {
  tool_id: string
  ready: boolean
  /** dep ids that are not `installed`. Includes `stale`. */
  missing: string[]
  deps: DepEntry[]
  environ: Record<string, string>
}

/** SSE stage names, exactly as the installer emits them. */
export type DepStage =
  | 'resolving'
  | 'downloading'
  | 'extracting'
  | 'installing'
  | 'verifying'
  | 'done'
  | 'failed'
  | 'cancelled'

export type DepJobStatus = 'completed' | 'failed' | 'cancelled'

export interface DepEvent {
  type: string
  job_id?: string
  dep_ids?: string[]
  dep_id?: string
  message?: string
  /** Emitted with the `installing` stage: the catalog estimate for this dep. */
  approx_bytes?: number
  heavy?: boolean
  /** Emitted by the streamed subprocess: a byte total hint, not a progress count. */
  total?: number | null
  url?: string
  path?: string
  status?: DepJobStatus
  result?: InstallJobResult | null
  [key: string]: unknown
}

export interface InstallFailure {
  dep_id: string
  error: string
  code?: string
}

export interface InstallJobResult {
  ok?: boolean
  cancelled?: boolean
  installed?: Partial<DepEntry>[]
  failures?: InstallFailure[]
  requested?: string[]
  error?: string
}

export interface DepStartedEvent {
  type: 'started'
  job_id: string
  dep_ids: string[]
}

export interface DepProgressEvent {
  type: DepStage
  dep_id: string
  message?: string
  approx_bytes?: number
  heavy?: boolean
  total?: number | null
}

export interface DepFinishedEvent {
  type: 'finished'
  status: DepJobStatus
  job_id: string
  result: InstallJobResult | null
}

export interface DepStreamEvent {
  started?: DepStartedEvent
  progress?: DepProgressEvent
  finished?: DepFinishedEvent
}

export interface RemoveResult {
  ok: boolean
  dep_id: string
  removed_prefix: string | null
  prefix_existed: boolean
  freed_bytes: number
  /** Tool ids that stop working once this dep is gone. */
  breaks_tools: string[]
}

export interface NukeResult {
  ok: boolean
  deps_root: string
  existed: boolean
  freed_bytes: number
  errors: string[]
}

export interface DepStreamOptions {
  signal?: AbortSignal
  /** Defaults to 5 minutes: a 2.5 GB pip download legitimately stalls between lines. */
  idleTimeoutMs?: number
}

const DEFAULT_IDLE_TIMEOUT_MS = 300_000

/**
 * Consume `POST /api/deps/install` as Server-Sent Events.
 *
 * Mirrors `consumePipelineStream` frame-for-frame: `data:`-prefixed lines joined
 * per frame, `:` heartbeat frames ignored, an idle-timeout guard, and abort
 * propagated to the underlying fetch. The only differences are the payload shape
 * and that the terminal frame is `type: "finished"` rather than a pipeline type.
 *
 * The caller owns the AbortSignal; cancelling the stream is *not* the same as
 * cancelling the install (that is `cancelInstall` with the job id).
 */
export async function consumeDepStream(
  depIds: string[],
  onEvent: (event: DepEvent) => void,
  options: DepStreamOptions = {},
): Promise<void> {
  const controller = new AbortController()
  const abort = () => controller.abort(options.signal?.reason)
  options.signal?.addEventListener('abort', abort, { once: true })
  if (options.signal?.aborted) abort()
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  const timeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS

  try {
    let response: Response
    try {
      response = await fetch(resolveUrl('/api/deps/install'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dep_ids: depIds }),
        signal: controller.signal,
      })
    } catch (error) {
      if (controller.signal.aborted) throw controller.signal.reason ?? error
      throw new ApiError(0, 'STREAM_INTERRUPTED', 'Could not reach the dependency installer. Check the backend is running.')
    }
    if (!response.ok) throw await responseError(response)
    reader = response.body?.getReader()
    if (!reader) throw new ApiError(0, 'STREAM_INTERRUPTED', 'The install progress stream is unavailable.')
    const decoder = new TextDecoder()
    let buffer = ''
    let terminal = false

    function dispatch(frame: string) {
      const data = frame
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n')
      if (!data) return // ": heartbeat" frames keep the socket warm; they are not events.
      let event: DepEvent
      try {
        event = JSON.parse(data) as DepEvent
      } catch {
        return // A truncated frame is dropped rather than crashing the install view.
      }
      onEvent(event) // Consumer exceptions must propagate.
      if (event.type === 'finished') terminal = true
    }

    while (!terminal) {
      let timer: ReturnType<typeof setTimeout> | undefined
      let onAbort: (() => void) | undefined
      const interruption = new Promise<never>((_, reject) => {
        onAbort = () => reject(controller.signal.reason ?? new DOMException('The operation was aborted.', 'AbortError'))
        controller.signal.addEventListener('abort', onAbort, { once: true })
        if (controller.signal.aborted) onAbort()
        if (timeoutMs > 0)
          timer = setTimeout(() => {
            const error = new ApiError(
              0,
              'STREAM_STALLED',
              'The installer stopped reporting progress. The download may still be running on the server.',
            )
            reject(error)
            controller.abort(error)
          }, timeoutMs)
      })

      let chunk: ReadableStreamReadResult<Uint8Array>
      try {
        chunk = await Promise.race([reader.read(), interruption])
      } catch (error) {
        if (error instanceof ApiError || controller.signal.aborted) throw error
        throw new ApiError(0, 'STREAM_INTERRUPTED', 'The install progress connection was lost. Reload to see the real state.')
      } finally {
        if (timer) clearTimeout(timer)
        if (onAbort) controller.signal.removeEventListener('abort', onAbort)
      }

      buffer += decoder.decode(chunk.value, { stream: !chunk.done })
      const frames = buffer.split(/\r?\n\r?\n/)
      buffer = frames.pop() ?? ''
      for (const frame of frames) {
        dispatch(frame)
        if (terminal) break
      }
      if (chunk.done) {
        if (buffer.trim()) dispatch(buffer)
        if (!terminal)
          throw new ApiError(
            0,
            'STREAM_INTERRUPTED',
            'The install progress connection ended before the job finished. Reload to see the real state.',
          )
        break
      }
    }
  } finally {
    options.signal?.removeEventListener('abort', abort)
    if (reader) {
      try {
        await reader.cancel()
      } catch {
        /* The connection may already be closed. */
      }
      reader.releaseLock()
    }
    controller.abort()
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(resolveUrl(path), init)
  if (!res.ok) throw await responseError(res)
  return (await res.json()) as T
}

export const depsApi = {
  listDeps: (signal?: AbortSignal) => request<DepsInventory>('/api/deps', { signal }),
  getToolDeps: (toolId: string, signal?: AbortSignal) =>
    request<ToolDepsResponse>(`/api/tools/${encodeURIComponent(toolId)}/deps`, { signal }),
  install: (depIds: string[], onEvent: (event: DepEvent) => void, options?: DepStreamOptions) =>
    consumeDepStream(depIds, onEvent, options),
  cancelInstall: (jobId: string) =>
    request<{ cancelled: boolean; job_id: string }>('/api/deps/install/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: jobId }),
    }),
  remove: (depId: string) =>
    request<RemoveResult>('/api/deps/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dep_id: depId }),
    }),
  nuke: () =>
    request<NukeResult>('/api/deps/nuke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }),
}

export { errorMessage }

/**
 * One dep's size, preferring measured bytes and falling back to the catalog
 * estimate. Returns null when the backend sent neither, so callers can say
 * "size unknown" instead of rendering `0 B`.
 */
export function depDisplayBytes(entry: Pick<DepEntry, 'approx_bytes' | 'measured_bytes'>): {
  bytes: number | null
  measured: boolean
} {
  if (typeof entry.measured_bytes === 'number' && entry.measured_bytes > 0) {
    return { bytes: entry.measured_bytes, measured: true }
  }
  if (typeof entry.approx_bytes === 'number' && entry.approx_bytes > 0) {
    return { bytes: entry.approx_bytes, measured: false }
  }
  return { bytes: null, measured: false }
}

const UNITS = ['B', 'kB', 'MB', 'GB', 'TB']

/**
 * Decimal (SI) units to match the catalog's own `660_000_000` ≈ "660 MB"
 * language. Measured sizes come from a 1024-based `du`, so both are reported
 * through this one formatter and labelled measured vs estimated by the caller.
 */
export function formatBytes(bytes: number | null | undefined): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return 'unknown'
  if (bytes < 1000) return `${Math.round(bytes)} B`
  let value = bytes
  let unit = 0
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000
    unit += 1
  }
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2
  return `${value.toFixed(digits)} ${UNITS[unit]}`
}
