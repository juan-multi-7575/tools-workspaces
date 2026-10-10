import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  depsApi,
  depDisplayBytes,
  errorMessage,
  type DepEvent,
  type DepFinishedEvent,
  type DepJobStatus,
  type DepStage,
  type ToolDepsResponse,
} from '../lib/depsApi'

export type DepStatus = 'checking' | 'ready' | 'missing' | 'installing' | 'error'

export interface UseToolDeps {
  status: DepStatus
  /** True only when the backend reported `ready: true` for a settled check. */
  ready: boolean
  data: ToolDepsResponse | null
  /** Catalog-estimated bytes for everything still missing. */
  missingBytes: number
  /** Raw SSE frames for the current job, oldest first. */
  events: DepEvent[]
  /** Verbatim backend message for the current failure, or null. */
  error: string | null
  install: () => void
  cancel: () => void
  reload: () => void
}

/**
 * The reduced view of an install job. Pure data: no React, no fetch, no clock,
 * so it can be unit-tested directly and re-derived from `events` on any render.
 */
export interface DepProgress {
  jobId: string | null
  /** dep ids in the order the backend accepted them. */
  order: string[]
  /** Latest stage the backend reported per dep. Absent = not started. */
  stageByDep: Record<string, DepStage>
  /** Latest backend message per dep, verbatim. Never rewritten or summarised. */
  messageByDep: Record<string, string>
  done: string[]
  failedDepId: string | null
  cancelledDepId: string | null
  /** Set only by a `failed` progress frame or a `finished` frame with status `failed`. */
  error: string | null
  /** Terminal job status. `completed` is the *only* value that means success. */
  status: DepJobStatus | null
  finished: DepFinishedEvent | null
}

export const EMPTY_PROGRESS: DepProgress = {
  jobId: null,
  order: [],
  stageByDep: {},
  messageByDep: {},
  done: [],
  failedDepId: null,
  cancelledDepId: null,
  error: null,
  status: null,
  finished: null,
}

const PROGRESS_STAGES: ReadonlySet<string> = new Set<DepStage>([
  'resolving',
  'downloading',
  'extracting',
  'installing',
  'verifying',
  'done',
  'failed',
  'cancelled',
])

function withMessage(state: DepProgress, depId: string, message: unknown): DepProgress {
  if (typeof message !== 'string' || message === '') return state
  return { ...state, messageByDep: { ...state.messageByDep, [depId]: message } }
}

/**
 * Fold one SSE frame into the progress view.
 *
 * Rules that matter:
 *  - A per-dep `done` frame is *not* success. Only a `finished` frame carrying
 *    `status: "completed"` sets `status`, so nothing downstream can report the
 *    tool as ready off a partial install.
 *  - Failure text is passed through exactly as the backend wrote it.
 *  - Unknown frame types are ignored rather than guessed at.
 */
export function depEventReducer(state: DepProgress, event: DepEvent): DepProgress {
  if (event.type === 'started') {
    const order = Array.isArray(event.dep_ids) ? event.dep_ids.filter((id): id is string => typeof id === 'string') : []
    return {
      ...EMPTY_PROGRESS,
      jobId: typeof event.job_id === 'string' ? event.job_id : null,
      order,
    }
  }

  if (event.type === 'finished') {
    const status: DepJobStatus | null =
      event.status === 'completed' || event.status === 'failed' || event.status === 'cancelled' ? event.status : null
    const result = event.result ?? null
    // The install result carries the authoritative error; prefer it over the
    // last progress line, which may be an unrelated subprocess line.
    const failure = result?.failures?.find((entry) => typeof entry?.error === 'string' && entry.error !== '')
    const resultError = typeof result?.error === 'string' && result.error !== '' ? result.error : null
    const derivedError = status === 'failed' ? (failure?.error ?? resultError ?? state.error ?? 'The install failed without a message from the backend.') : state.error
    return {
      ...state,
      status,
      jobId: typeof event.job_id === 'string' ? event.job_id : state.jobId,
      finished: { type: 'finished', status: status ?? 'failed', job_id: typeof event.job_id === 'string' ? event.job_id : '', result },
      error: status === 'failed' ? derivedError : status === 'cancelled' ? null : state.error,
    }
  }

  if (typeof event.dep_id !== 'string' || event.dep_id === '') return state
  const depId = event.dep_id
  if (!PROGRESS_STAGES.has(event.type)) return state

  const stageByDep = { ...state.stageByDep, [depId]: event.type as DepStage }
  const next = withMessage({ ...state, stageByDep }, depId, event.message)

  if (event.type === 'done') {
    return next.done.includes(depId) ? next : { ...next, done: [...next.done, depId] }
  }
  if (event.type === 'failed') {
    return {
      ...next,
      failedDepId: depId,
      error: typeof event.message === 'string' && event.message !== '' ? event.message : next.error,
    }
  }
  if (event.type === 'cancelled') {
    return { ...next, cancelledDepId: depId }
  }
  return next
}

export function deriveDepProgress(events: DepEvent[]): DepProgress {
  return events.reduce(depEventReducer, EMPTY_PROGRESS)
}

export interface DepByteProgress {
  /** Real catalog bytes for deps the backend has confirmed `done`. */
  completedBytes: number
  /** Real catalog bytes for every dep in the job. */
  totalBytes: number
  /** completedBytes / totalBytes, or null when totalBytes is 0. */
  ratio: number | null
  /** The dep currently reporting a non-terminal stage. */
  activeDepId: string | null
}

const NO_PROGRESS: DepByteProgress = { completedBytes: 0, totalBytes: 0, ratio: null, activeDepId: null }

/**
 * Weight progress by the byte counts the backend itself published. A dep only
 * counts once it reports `done`, so this measures installed bytes and never
 * pretends to know how far a single download has travelled.
 */
export function deriveDepByteProgress(
  progress: DepProgress,
  entries: ToolDepsResponse['deps'] | null | undefined,
): DepByteProgress {
  if (progress.order.length === 0 || !entries) return NO_PROGRESS
  const byId = new Map(entries.map((entry) => [entry.dep_id, entry]))
  let totalBytes = 0
  let completedBytes = 0
  const done = new Set(progress.done)
  for (const depId of progress.order) {
    const entry = byId.get(depId)
    if (!entry) continue
    const { bytes } = depDisplayBytes(entry)
    if (bytes === null) continue
    totalBytes += bytes
    if (done.has(depId)) completedBytes += bytes
  }
  const activeDepId =
    progress.order.find(
      (depId) =>
        !done.has(depId) &&
        progress.stageByDep[depId] !== 'failed' &&
        progress.stageByDep[depId] !== 'cancelled',
    ) ?? null
  return {
    completedBytes,
    totalBytes,
    ratio: totalBytes > 0 ? completedBytes / totalBytes : null,
    activeDepId,
  }
}

const MAX_EVENTS = 500

export function useToolDeps(toolId: string): UseToolDeps {
  const [data, setData] = useState<ToolDepsResponse | null>(null)
  const [checkError, setCheckError] = useState<string | null>(null)
  const [checking, setChecking] = useState(true)
  const [events, setEvents] = useState<DepEvent[]>([])
  const [installing, setInstalling] = useState(false)
  const mounted = useRef(true)
  const streamAbort = useRef<AbortController | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      streamAbort.current?.abort()
    }
  }, [])

  // One check per tool id (and per explicit reload). Aborted on unmount so a
  // slow check cannot write into a dead component.
  useEffect(() => {
    const controller = new AbortController()
    setChecking(true)
    setCheckError(null)
    depsApi
      .getToolDeps(toolId, controller.signal)
      .then((response) => {
        if (!mounted.current || controller.signal.aborted) return
        setData(response)
        setChecking(false)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || !mounted.current) return
        setCheckError(errorMessage(error))
        setChecking(false)
      })
    return () => controller.abort()
  }, [toolId, reloadToken])

  const reload = useCallback(() => setReloadToken((token) => token + 1), [])

  const missingBytes = useMemo(() => {
    if (!data) return 0
    const missing = new Set(data.missing)
    return data.deps
      .filter((entry) => missing.has(entry.dep_id))
      .reduce((sum, entry) => sum + (depDisplayBytes(entry).bytes ?? 0), 0)
  }, [data])

  const install = useCallback(() => {
    if (streamAbort.current || !mounted.current) return
    if (data === null || data.missing.length === 0) return
    const requested = [...data.missing]
    const controller = new AbortController()
    streamAbort.current = controller
    setEvents([])
    setCheckError(null)
    setInstalling(true)

    depsApi
      .install(requested, (event) => {
        if (!mounted.current) return
        setEvents((previous) => {
          const next = previous.length >= MAX_EVENTS ? previous.slice(previous.length - MAX_EVENTS + 1) : previous
          return [...next, event]
        })
      }, { signal: controller.signal })
      .then(() => {
        // Any terminal frame re-checks the truth with the backend. Until that
        // resolves the gate stays in `installing`, so nothing claims success
        // on the strength of a stream alone.
        if (!mounted.current) return
        setInstalling(false)
        streamAbort.current = null
        setReloadToken((token) => token + 1)
      })
      .catch((error: unknown) => {
        if (!mounted.current) return
        setInstalling(false)
        streamAbort.current = null
        if (controller.signal.aborted) return // unmount or an intentional teardown
        setEvents((previous) => [
          ...previous,
          { type: 'finished', status: 'failed', job_id: '', result: { ok: false, error: errorMessage(error) } },
        ])
        setReloadToken((token) => token + 1)
      })
  }, [data])

  const cancel = useCallback(() => {
    const jobId = deriveDepProgress(events).jobId
    if (!jobId) return
    // The stream stays open on purpose: the backend answers the cancel with a
    // real `cancelled` progress frame and then a `finished` frame.
    depsApi.cancelInstall(jobId).catch(() => {
      /* The stream's own `finished` frame is the authority on the outcome. */
    })
  }, [events])

  const status: DepStatus = installing
    ? 'installing'
    : checkError
      ? 'error'
      : checking || data === null
        ? 'checking'
        : data.ready
          ? 'ready'
          : 'missing'

  return {
    status,
    ready: status === 'ready' && data?.ready === true,
    data,
    missingBytes,
    events,
    error: checkError ?? deriveDepProgress(events).error,
    install,
    cancel,
    reload,
  }
}
