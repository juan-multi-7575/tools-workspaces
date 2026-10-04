import { useCallback, useEffect, useRef, useState } from 'react'
import { api, errorMessage, type ToolManifest } from '../lib/api'
import type { ToolExecuteResult, ToolExecutionState, UseToolExecute } from '../lib/toolPageTypes'

const IDLE: ToolExecutionState = {
  phase: 'idle', result: null, error: null, startedAt: null, elapsedSeconds: 0,
}

export function initialParamsFromManifest(
  manifest: ToolManifest,
  overrides?: Record<string, unknown>,
): Record<string, unknown> {
  const seeded: Record<string, unknown> = {}
  for (const [key, spec] of Object.entries(manifest.parameters_schema ?? {})) {
    if (spec && typeof spec === 'object' && 'default' in spec && (spec as { default?: unknown }).default !== undefined) {
      seeded[key] = (spec as { default: unknown }).default
    }
  }
  return { ...seeded, ...(overrides ?? {}) }
}

export function useToolExecute(toolId: string): UseToolExecute {
  const [state, setState] = useState<ToolExecutionState>(IDLE)
  const mounted = useRef(true)
  const startedAt = useRef<number | null>(null)
  const cancelled = useRef(false)
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null)
  const inFlight = useRef(false)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (ticker.current) clearInterval(ticker.current)
    }
  }, [])

  const stopTicker = useCallback(() => {
    if (ticker.current) clearInterval(ticker.current)
    ticker.current = null
  }, [])

  const reset = useCallback(() => {
    stopTicker()
    cancelled.current = false
    inFlight.current = false
    startedAt.current = null
    setState(IDLE)
  }, [stopTicker])

  const cancel = useCallback(() => {
    cancelled.current = true
    stopTicker()
  }, [stopTicker])

  const run = useCallback(async (params: Record<string, unknown>) => {
    if (inFlight.current) return null
    inFlight.current = true
    cancelled.current = false
    const began = Date.now()
    startedAt.current = began
    setState({ phase: 'executing', result: null, error: null, startedAt: began, elapsedSeconds: 0 })

    // Measured wall-clock only: this reports real elapsed time and never invents a percentage.
    ticker.current = setInterval(() => {
      if (!mounted.current) return
      const elapsed = (Date.now() - began) / 1000
      setState((prev) => (prev.phase === 'executing' ? { ...prev, elapsedSeconds: elapsed } : prev))
    }, 250)

    try {
      const res = await api.executeTool(toolId, { kind: 'standalone', destination: '', params })
      const elapsed = (Date.now() - began) / 1000
      const result: ToolExecuteResult = {
        status: res.status === 'completed' ? 'completed' : res.status === 'cancelled' ? 'cancelled' : 'failed',
        artifacts: (res.artifacts as ToolExecuteResult['artifacts']) ?? [],
        error: res.status === 'completed'
          ? null
          : errorMessage(res.error) || `Tool exited with status "${res.status}".`,
        durationSeconds: res.duration_seconds ?? elapsed,
        data: res.data ?? null,
        outputText: res.output_text ?? null,
      }
      if (mounted.current) {
        setState({
          phase: cancelled.current ? 'cancelled' : result.status,
          result,
          error: result.error,
          startedAt: began,
          elapsedSeconds: elapsed,
        })
      }
      return result
    } catch (err) {
      const elapsed = (Date.now() - began) / 1000
      const message = err instanceof Error ? err.message : 'Execution request failed before a response was received.'
      const result: ToolExecuteResult = {
        status: 'failed', artifacts: [], error: message,
        durationSeconds: elapsed, data: null, outputText: null,
      }
      if (mounted.current) {
        setState({ phase: 'failed', result, error: message, startedAt: began, elapsedSeconds: elapsed })
      }
      return result
    } finally {
      stopTicker()
      inFlight.current = false
    }
  }, [stopTicker, toolId])

  return { state, busy: state.phase === 'executing', run, reset, cancel }
}