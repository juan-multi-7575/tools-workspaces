import { useSyncExternalStore } from 'react'
import { api, type DownloadTask } from './api.ts'

export interface DownloadProgress {
  percent: number
  speed?: string
  eta?: string
  raw?: Record<string, unknown>
}

export interface StoredArtifact {
  name: string
  path: string
  kind: string
  size: number
  mtime: number
}

// 1. Ephemeral progress store (isolated from React component trees)
export class DownloadProgressStore {
  private progressMap = new Map<string, DownloadProgress>()
  private listeners = new Map<string, Set<() => void>>()
  private pendingBatch = new Map<string, DownloadProgress>()
  private rafScheduled = false

  subscribe(id: string, listener: () => void) {
    if (!this.listeners.has(id)) {
      this.listeners.set(id, new Set())
    }
    this.listeners.get(id)!.add(listener)
    return () => {
      this.listeners.get(id)?.delete(listener)
      if (this.listeners.get(id)?.size === 0) {
        this.listeners.delete(id)
      }
    }
  }

  getProgress(id: string): DownloadProgress | undefined {
    return this.progressMap.get(id)
  }

  // Coalesce high frequency 200ms ticks using requestAnimationFrame
  setProgress(id: string, progress: DownloadProgress) {
    this.pendingBatch.set(id, progress)
    if (typeof window === 'undefined') {
      this.flushBatch()
      return
    }
    if (!this.rafScheduled) {
      this.rafScheduled = true
      requestAnimationFrame(() => this.flushBatch())
    }
  }

  private flushBatch() {
    this.rafScheduled = false
    for (const [id, progress] of this.pendingBatch) {
      this.progressMap.set(id, progress)
      this.listeners.get(id)?.forEach((cb) => cb())
    }
    this.pendingBatch.clear()
  }

  clear(id?: string) {
    if (id) {
      this.progressMap.delete(id)
    } else {
      this.progressMap.clear()
    }
  }
}

export const downloadProgressStore = new DownloadProgressStore()

// React 19 hook for fine-grained row-level subscription
export function useDownloadProgress(id: string): DownloadProgress | undefined {
  return useSyncExternalStore(
    (onStoreChange) => downloadProgressStore.subscribe(id, onStoreChange),
    () => downloadProgressStore.getProgress(id),
    () => undefined
  )
}

// 2. SWR Artifacts Store (prevents refetch spinners on every tab switch)
export class ArtifactsStore {
  private cached: StoredArtifact[] = []
  private lastFetched = 0
  private staleDurationMs = 60 * 1000 // 60s stale time
  private subscribers = new Set<() => void>()
  private isFetching = false

  subscribe(listener: () => void) {
    this.subscribers.add(listener)
    return () => {
      this.subscribers.delete(listener)
    }
  }

  getCached(): StoredArtifact[] {
    return this.cached
  }

  setCached(artifacts: StoredArtifact[]) {
    this.cached = artifacts
    this.lastFetched = Date.now()
    this.notify()
  }

  isStale(): boolean {
    return Date.now() - this.lastFetched > this.staleDurationMs
  }

  invalidate() {
    this.lastFetched = 0
    this.notify()
  }

  private notify() {
    this.subscribers.forEach((cb) => cb())
  }

  async fetchArtifacts(force = false): Promise<StoredArtifact[]> {
    if (!force && !this.isStale() && this.cached.length > 0) {
      return this.cached
    }
    if (this.isFetching) return this.cached
    this.isFetching = true
    try {
      const res = await api.getRecentArtifacts()
      this.setCached(res.artifacts || [])
    } catch {
      // Keep cached on error
    } finally {
      this.isFetching = false
    }
    return this.cached
  }
}

export const artifactsStore = new ArtifactsStore()

export function useArtifacts() {
  return useSyncExternalStore(
    (listener) => artifactsStore.subscribe(listener),
    () => artifactsStore.getCached(),
    () => []
  )
}

// 3. Singleton Activity Stream Coordinator
export class ActivityStreamCoordinator {
  private sources: Record<string, EventSource> = {}
  private listeners = new Set<(tasks: DownloadTask[]) => void>()
  private tasks: DownloadTask[] = []

  subscribeTasks(cb: (tasks: DownloadTask[]) => void) {
    this.listeners.add(cb)
    cb(this.tasks)
    return () => {
      this.listeners.delete(cb)
    }
  }

  getTasks() {
    return this.tasks
  }

  setTasks(tasks: DownloadTask[]) {
    this.tasks = tasks
    this.syncStreams()
    this.notify()
  }

  async loadTasks() {
    try {
      const res = await api.listDownloads()
      this.tasks = res.downloads || []
      this.syncStreams()
      this.notify()
    } catch {
      // Ignore network hiccup
    }
  }

  private notify() {
    this.listeners.forEach((cb) => cb(this.tasks))
  }

  syncStreams() {
    const liveTasks = this.tasks.filter((t) => t.status === 'queued' || t.status === 'running')
    for (const t of liveTasks) {
      if (this.sources[t.id]) continue
      try {
        const es = new EventSource(api.downloadStreamUrl(t.id))
        this.sources[t.id] = es

        es.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data) as DownloadTask
            // Publish progress tick to ephemeral external store ONLY
            const p = msg.progress as { percent?: number; _percent_str?: string; _speed_str?: string; _eta_str?: string }
            let percent = 0
            if (typeof p?.percent === 'number') percent = Math.round(p.percent)
            else if (typeof p?._percent_str === 'string') {
              const m = p._percent_str.match(/(\d+(?:\.\d+)?)/)
              if (m) percent = Math.min(100, Math.round(Number(m[1])))
            } else if (msg.status === 'completed') {
              percent = 100
            }

            downloadProgressStore.setProgress(t.id, {
              percent,
              speed: p?._speed_str,
              eta: p?._eta_str,
              raw: msg.progress,
            })

            // Only update durable task list if status changed or finished
            if (msg.status !== t.status || msg.status === 'completed' || msg.status === 'failed') {
              this.tasks = this.tasks.map((task) =>
                task.id === t.id
                  ? {
                      ...task,
                      status: msg.status,
                      error: msg.error,
                      result: msg.result || task.result,
                      completed_at: msg.completed_at || task.completed_at,
                    }
                  : task
              )
              this.notify()

              if (['completed', 'failed', 'cancelled'].includes(msg.status)) {
                es.close()
                delete this.sources[t.id]
                // Event-driven cache invalidation: refresh artifacts when download completes
                artifactsStore.invalidate()
                artifactsStore.fetchArtifacts(true)
              }
            }
          } catch {
            /* ignore parse error */
          }
        }

        es.onerror = () => {
          es.close()
          delete this.sources[t.id]
        }
      } catch {
        /* ignore connection error */
      }
    }
  }

  destroy() {
    Object.values(this.sources).forEach((es) => es.close())
    this.sources = {}
  }
}

export const activityStreamCoordinator = new ActivityStreamCoordinator()
