import { useState } from 'react'
import {
  Settings2,
  Sliders,
  Play,
  CheckCircle2,
  AlertCircle,
  Clock,
  Terminal,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react'
import DynamicForm from '../common/DynamicForm'
import { type ToolManifest, api } from '../../lib/api'

export default function NodeInspectorPanel({
  selectedNode,
  toolManifest,
  workspaceId,
  onUpdateParams,
  collapsed,
  onToggleCollapse,
  onStepFinished,
}: {
  selectedNode: {
    id: string
    toolId: string
    label: string
    params: Record<string, unknown>
    status?: string
    durationSeconds?: number
    errorMessage?: string
    cached?: boolean
  } | null
  toolManifest?: ToolManifest
  workspaceId: string
  onUpdateParams: (params: Record<string, unknown>) => void
  collapsed: boolean
  onToggleCollapse: () => void
  onStepFinished?: () => void
}) {
  const [runningStep, setRunningStep] = useState(false)
  const [stepStatus, setStepStatus] = useState<string | null>(null)

  if (collapsed) {
    return (
      <div className="flex flex-col items-center py-3 px-1.5 border-l border-[#B0BA99] bg-[#EDE5CD]/70 shrink-0 w-12 transition-all">
        <button
          onClick={onToggleCollapse}
          className="p-1.5 rounded-xl border border-[#B0BA99] bg-[#FFFFFF] text-[#4E220F] hover:bg-[#EDE5CD] shadow-2xs transition-transform active:scale-95"
          title="Expand Node Inspector"
        >
          <ChevronLeft className="size-4 text-[#9D6638]" />
        </button>
        <span className="mt-6 font-mono text-[10px] font-bold text-[#7C5339] uppercase tracking-wider [writing-mode:vertical-rl] rotate-180">
          Inspector
        </span>
      </div>
    )
  }

  const handleTestRun = async () => {
    if (!selectedNode || !selectedNode.toolId) return
    setRunningStep(true)
    setStepStatus('Executing step in isolation...')
    try {
      const res = await api.executeTool(selectedNode.toolId, {
        workspace_id: workspaceId,
        params: selectedNode.params || {},
      })
      if (res.status === 'completed') {
        setStepStatus(`Step finished in ${res.duration_seconds?.toFixed(1) || '0.0'}s`)
        if (onStepFinished) onStepFinished()
      } else {
        setStepStatus(`Step error: ${res.error || 'Execution failed'}`)
      }
    } catch (e: any) {
      setStepStatus(`Execution error: ${e.message || String(e)}`)
    } finally {
      setRunningStep(false)
    }
  }

  return (
    <div className="flex flex-col border-l border-[#B0BA99] bg-[#EDE5CD]/50 w-80 shrink-0 transition-all overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-[#B0BA99]/50 flex items-center justify-between bg-[#EDE5CD]/80">
        <div className="flex items-center gap-1.5">
          <Sliders className="size-4 text-[#9D6638]" />
          <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#4E220F]">
            Node Inspector
          </span>
        </div>
        <button
          onClick={onToggleCollapse}
          className="p-1 rounded-lg border border-[#B0BA99]/60 hover:bg-[#EDE5CD] text-[#7C5339] hover:text-[#4E220F] transition-colors"
          title="Collapse Inspector"
        >
          <ChevronRight className="size-3.5" />
        </button>
      </div>

      {!selectedNode ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-[#7C5339] space-y-2">
          <Settings2 className="size-8 text-[#9D6638] opacity-60" />
          <p className="text-xs font-bold text-[#4E220F]">No Node Selected</p>
          <p className="text-[11px] leading-relaxed">
            Click any node on the canvas to inspect parameters, input bindings, and execution results.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3 space-y-3.5">
          {/* Node Summary Card */}
          <div className="rounded-2xl border border-[#B0BA99] bg-[#FFFFFF] p-3 shadow-2xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase font-bold text-[#7C5339]">
                Selected Node
              </span>
              <span className="font-mono text-[10px] px-2 py-0.5 rounded-md bg-[#EDE5CD] border border-[#B0BA99]/60 text-[#4E220F] font-bold">
                {selectedNode.id}
              </span>
            </div>
            <h3 className="text-sm font-bold text-[#4E220F]">{selectedNode.label}</h3>
            {toolManifest?.description && (
              <p className="text-[11px] text-[#7C5339] leading-relaxed">
                {toolManifest.description}
              </p>
            )}

            {/* Status pill if executed */}
            {selectedNode.status && selectedNode.status !== 'idle' && (
              <div className="flex items-center gap-1.5 pt-1 border-t border-[#B0BA99]/30 text-xs">
                {selectedNode.status === 'completed' && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100/70 border border-emerald-300 px-2 py-0.5 rounded-lg">
                    <CheckCircle2 className="size-3" />
                    Completed {selectedNode.durationSeconds ? `(${selectedNode.durationSeconds.toFixed(1)}s)` : ''}
                    {selectedNode.cached && ' • ⚡ Cached'}
                  </span>
                )}
                {selectedNode.status === 'failed' && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#A83232] bg-red-100/70 border border-red-300 px-2 py-0.5 rounded-lg">
                    <AlertCircle className="size-3" />
                    Failed
                  </span>
                )}
                {selectedNode.status === 'running' && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#9D6638] bg-[#EDE5CD] border border-[#B0BA99] px-2 py-0.5 rounded-lg animate-pulse">
                    <Clock className="size-3" />
                    Running...
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Node Parameter Form */}
          <div className="rounded-2xl border border-[#B0BA99] bg-[#FFFFFF] p-3 shadow-2xs space-y-2.5">
            <div className="flex items-center justify-between border-b border-[#B0BA99]/40 pb-1.5">
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#4E220F]">
                Tool Parameters
              </span>
              <span className="font-mono text-[9px] text-[#7C5339]">Auto-saved</span>
            </div>

            <DynamicForm
              schema={toolManifest?.parameters_schema || {}}
              value={selectedNode.params || {}}
              onChange={onUpdateParams}
            />
          </div>

          {/* Quick Single-Step Execution Test */}
          <div className="rounded-2xl border border-[#B0BA99] bg-[#FFFFFF] p-3 shadow-2xs space-y-2">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#7C5339] flex items-center gap-1">
              <Terminal className="size-3 text-[#9D6638]" /> Single-Step Test
            </span>
            <button
              onClick={handleTestRun}
              disabled={runningStep}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#B0BA99] bg-[#EDE5CD] px-3 py-2 text-xs font-bold text-[#4E220F] hover:bg-[#B0BA99]/40 transition-all disabled:opacity-50 active:scale-95 shadow-2xs"
            >
              <Play className="size-3 fill-current text-[#9D6638]" />
              {runningStep ? 'Executing Step...' : 'Test Run This Node'}
            </button>
            {stepStatus && (
              <p className="font-mono text-[10px] text-[#7C5339] bg-[#F7F1DE]/70 p-2 rounded-xl border border-[#B0BA99]/40 break-all">
                {stepStatus}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
