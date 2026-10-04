import type { ComponentType } from 'react'
import type { ToolManifest } from './api'

export interface ToolArtifact { name: string; path: string; kind?: string }

export type ToolRunPhase = 'idle' | 'executing' | 'completed' | 'failed' | 'cancelled'

export interface ToolExecuteResult {
  status: 'completed' | 'failed' | 'cancelled'
  artifacts: ToolArtifact[]
  error: string | null
  durationSeconds: number | null
  data: Record<string, any> | null
  outputText: string | null
}

export interface ToolExecutionState {
  phase: ToolRunPhase
  result: ToolExecuteResult | null
  error: string | null
  startedAt: number | null
  elapsedSeconds: number
}

export interface UseToolExecute {
  state: ToolExecutionState
  busy: boolean
  run: (params: Record<string, unknown>) => Promise<ToolExecuteResult | null>
  reset: () => void
  cancel: () => void
}

export interface ToolPageProps {
  manifest: ToolManifest
  initialParams: Record<string, unknown>
  initialInputPath?: string
  onComplete?: (result: ToolExecuteResult, params: Record<string, unknown>) => void
  onSendToTool?: (toolId: string, inputPath: string) => void
  onOpenAudioPlayer?: (media: { name: string; path: string }) => void
}

export type ToolPageComponent = ComponentType<ToolPageProps>