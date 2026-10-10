import { AlertCircle, CheckCircle2, Clock, Loader2 } from 'lucide-react'
import ToolResultViewer from './ToolResultViewer'
import type { ToolExecutionState } from '../../lib/toolPageTypes'

export interface ToolResultPanelProps {
  state: ToolExecutionState
  toolId: string
  toolName: string
  onRerun?: () => void
  onSendToTool?: (toolId: string, inputPath: string) => void
  onOpenAudioPlayer?: (media: { name: string; path: string }) => void
}

const PHASE_COPY: Record<string, string> = {
  executing: 'Waiting for the backend to finish',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

export default function ToolResultPanel({
  state,
  toolId,
  toolName,
  onRerun,
  onSendToTool,
  onOpenAudioPlayer,
}: ToolResultPanelProps) {
  const firstArtifact = state.result?.artifacts[0]

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-sage bg-brand-cream-dark/50 px-3.5 py-2.5">
        <span className="inline-flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-brand-caramel-text">
          {state.phase === 'executing' ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : state.phase === 'completed' ? (
            <CheckCircle2 className="size-3.5 text-success" />
          ) : (
            <AlertCircle className="size-3.5 text-accent-contrast" />
          )}
          {PHASE_COPY[state.phase] ?? state.phase}
        </span>
        <span className="inline-flex items-center gap-1 font-mono text-xs text-brand-caramel-text">
          <Clock className="size-3" />
          {state.elapsedSeconds.toFixed(1)}s measured
        </span>
      </div>

      {state.error && (
        <div role="alert" className="rounded-xl border border-accent-contrast/50 bg-accent-contrast/10 p-3.5">
          <p className="mb-1 text-xs font-bold text-accent-contrast">The backend reported:</p>
          <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-brand-espresso">
            {state.error}
          </pre>
        </div>
      )}

      {state.result && (
        <ToolResultViewer
          toolId={toolId}
          toolName={toolName}
          status={state.result.status}
          artifacts={state.result.artifacts}
          data={state.result.data}
          outputText={state.result.outputText}
          elapsedSeconds={state.result.durationSeconds ?? state.elapsedSeconds}
          onRerun={onRerun}
          onOpenAudioPlayer={
            onOpenAudioPlayer
              ? (media) => onOpenAudioPlayer({ name: media.name, path: media.url })
              : undefined
          }
        />
      )}

      {onSendToTool && firstArtifact && (
        <button
          type="button"
          onClick={() => onSendToTool(toolId, firstArtifact.path)}
          className="rounded-xl border border-brand-sage bg-surface-white px-3 py-2 text-xs font-bold text-brand-espresso hover:bg-brand-cream-dark"
        >
          Use this output as input elsewhere
        </button>
      )}
    </section>
  )
}