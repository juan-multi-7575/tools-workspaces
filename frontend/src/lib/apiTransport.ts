export interface StructuredError { code: string; message: string }

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export function errorMessage(error: unknown): string {
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message
  return 'An unexpected error occurred.'
}

export async function responseError(response: Response): Promise<ApiError> {
  const fallback = `Request failed (${response.status}).`
  try {
    const body = await response.json()
    const detail = body.error ?? body.detail ?? body
    return new ApiError(response.status, typeof detail?.code === 'string' ? detail.code : 'HTTP_ERROR',
      typeof detail === 'string' ? detail : typeof detail?.message === 'string' ? detail.message : fallback)
  } catch { return new ApiError(response.status, 'HTTP_ERROR', fallback) }
}

export interface StreamOptions { signal?: AbortSignal; idleTimeoutMs?: number }
export interface PipelineStreamEvent {
  type: string
  node_id?: string
  tool_id?: string
  tool_name?: string
  status?: string
  duration?: number
  error?: string | StructuredError
  reason?: string
  results?: unknown[]
  [key: string]: unknown
}

export async function consumePipelineStream(url: string, payload: unknown, onEvent: (event: PipelineStreamEvent) => void, options: StreamOptions = {}): Promise<void> {
  const controller = new AbortController()
  const abort = () => controller.abort(options.signal?.reason)
  options.signal?.addEventListener('abort', abort, { once: true })
  if (options.signal?.aborted) abort()
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  const timeoutMs = options.idleTimeoutMs ?? 45_000
  try {
    let response: Response
    try { response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal }) }
    catch (error) {
      if (controller.signal.aborted) throw controller.signal.reason ?? error
      throw new ApiError(0, 'STREAM_INTERRUPTED', 'Could not connect to the pipeline. Reconnect to check its status.')
    }
    if (!response.ok) throw await responseError(response)
    reader = response.body?.getReader()
    if (!reader) throw new ApiError(0, 'STREAM_INTERRUPTED', 'The pipeline stream is unavailable.')
    const decoder = new TextDecoder()
    let buffer = ''
    let terminal = false
    function dispatch(frame: string) {
      const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
      if (!data) return // SSE comments are heartbeats, not node events.
      let event: PipelineStreamEvent
      try { event = JSON.parse(data) } catch { return }
      onEvent(event) // Consumer exceptions must propagate.
      if (event.type === 'pipeline_finished' || event.type === 'pipeline_error') terminal = true
    }
    while (!terminal) {
      let timer: ReturnType<typeof setTimeout> | undefined
      let onAbort: (() => void) | undefined
      const interruption = new Promise<never>((_, reject) => {
        onAbort = () => reject(controller.signal.reason ?? new DOMException('The operation was aborted.', 'AbortError'))
        controller.signal.addEventListener('abort', onAbort, { once: true })
        if (controller.signal.aborted) onAbort()
        if (timeoutMs > 0) timer = setTimeout(() => {
          const error = new ApiError(0, 'STREAM_STALLED', 'The pipeline connection stopped responding. Reconnect to check its status.')
          reject(error)
          controller.abort(error)
        }, timeoutMs)
      })
      let chunk: ReadableStreamReadResult<Uint8Array>
      try { chunk = await Promise.race([reader.read(), interruption]) }
      catch (error) {
        if (error instanceof ApiError || controller.signal.aborted) throw error
        throw new ApiError(0, 'STREAM_INTERRUPTED', 'The pipeline connection was lost. Reconnect to check its status.')
      }
      finally {
        if (timer) clearTimeout(timer)
        if (onAbort) controller.signal.removeEventListener('abort', onAbort)
      }
      buffer += decoder.decode(chunk.value, { stream: !chunk.done })
      const frames = buffer.split(/\r?\n\r?\n/)
      buffer = frames.pop() ?? ''
      for (const frame of frames) { dispatch(frame); if (terminal) break }
      if (chunk.done) {
        if (buffer.trim()) dispatch(buffer)
        if (!terminal) throw new ApiError(0, 'STREAM_INTERRUPTED', 'The pipeline connection ended before completion. Reconnect to check its status.')
        break
      }
    }
  } finally {
    options.signal?.removeEventListener('abort', abort)
    if (reader) {
      try { await reader.cancel() } catch { /* The connection may already be closed. */ }
      reader.releaseLock()
    }
    controller.abort()
  }
}
