import { useSyncExternalStore } from 'react'
import { api, API_BASE } from '../lib/api'

export interface HealthSnapshot {
  state: 'connecting' | 'online' | 'offline'
  version: string | null
  host: string
}

export function healthHost(base: string, origin: string): string {
  try { return new URL(base || origin, origin).host } catch { return 'Backend' }
}

/** One poller shared by all status displays. Last subscriber tears it down. */
export class HealthMonitor {
  private snapshot: HealthSnapshot
  private listeners = new Set<() => void>()
  private timer: ReturnType<typeof setTimeout> | undefined
  private generation = 0
  private controller: AbortController | undefined

  private read: (signal: AbortSignal) => Promise<{ status: string; version: string }>
  private interval: number
  private timeout: number

  constructor(read: (signal: AbortSignal) => Promise<{ status: string; version: string }>, host: string, interval = 15000, timeout = 5000) {
    this.read = read
    this.interval = interval
    this.timeout = timeout
    this.snapshot = { state: 'connecting', version: null, host }
  }

  getSnapshot = (): HealthSnapshot => this.snapshot

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    if (this.listeners.size === 1) {
      this.publish({ ...this.snapshot, state: 'connecting' })
      void this.poll(++this.generation)
    }
    return () => {
      this.listeners.delete(listener)
      if (!this.listeners.size) {
        ++this.generation
        clearTimeout(this.timer)
        this.controller?.abort()
      }
    }
  }

  private publish(snapshot: HealthSnapshot) {
    this.snapshot = snapshot
    this.listeners.forEach((listener) => listener())
  }

  private async poll(generation: number) {
    const controller = new AbortController()
    this.controller = controller
    const signal = controller.signal
    let expiry: ReturnType<typeof setTimeout> | undefined
    try {
      const response = await Promise.race([
        this.read(signal),
        new Promise<never>((_, reject) => {
          signal.addEventListener('abort', () => reject(new Error('Health cancelled')), { once: true })
          expiry = setTimeout(() => { controller.abort(); reject(new Error('Health timeout')) }, this.timeout)
        }),
      ])
      if (generation !== this.generation) return
      this.publish({ ...this.snapshot, state: response.status === 'ok' || response.status === 'healthy' ? 'online' : 'offline', version: response.version || null })
    } catch {
      if (generation !== this.generation) return
      this.publish({ ...this.snapshot, state: 'offline' })
    } finally {
      clearTimeout(expiry)
      if (generation === this.generation && this.listeners.size) {
        this.timer = setTimeout(() => { void this.poll(generation) }, this.interval)
      }
    }
  }
}

const health = new HealthMonitor((signal) => api.health(signal), healthHost(API_BASE, typeof window === 'undefined' ? 'http://localhost' : window.location.origin))
export function useHealth(): HealthSnapshot {
  return useSyncExternalStore(health.subscribe, health.getSnapshot, health.getSnapshot)
}
