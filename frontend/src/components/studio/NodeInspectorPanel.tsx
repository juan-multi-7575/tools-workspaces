import { useState, useCallback } from 'react'
import {
  Settings2,
  Sliders,
  Play,
  CheckCircle2,
  Copy,
  X,
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
  onClearSelection,
  nodeCount,
  edgeCount,
  lastRun,
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
  onClearSelection?: () => void
  nodeCount?: number
  edgeCount?: number
  lastRun?: { name: string; status: string } | null
}) {
  const [runningStep, setRunningStep] = useState(false)
  const [stepStatus, setStepStatus] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState(false)
  const [testInputMode, setTestInputMode] = useState<'auto' | 'latest' | 'fixture'>('auto')

  const copyNodeId = useCallback(() => {
    if (!selectedNode?.id) return
    navigator.clipboard.writeText(selectedNode.id).then(() => {
      setCopiedId(true)
      setTimeout(() => setCopiedId(false), 1500)
    }).catch(() => {})
  }, [selectedNode?.id])

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
        <div className="flex items-center gap-1">
          <button
            onClick={copyNodeId}
            className="p-1 rounded-lg border border-[#B0BA99]/60 hover:bg-[#EDE5CD] text-[#7C5339] hover:text-[#4E220F] transition-colors"
            title={copiedId ? 'Copied!' : 'Copy node id'}
          >
            {copiedId ? <CheckCircle2 className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
          </button>
          {onClearSelection && (
            <button
              onClick={onClearSelection}
              className="p-1 rounded-lg border border-[#A83232]/40 hover:bg-[#A83232] text-[#7C5339] hover:text-[#FFFFFF] transition-colors"
              title="Clear selection"
            >
              <X className="size-3.5" />
            </button>
          )}
          <button
            onClick={onToggleCollapse}
            className="p-1 rounded-lg border border-[#B0BA99]/60 hover:bg-[#EDE5CD] text-[#7C5339] hover:text-[#4E220F] transition-colors"
            title="Collapse Inspector"
          >
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      </div>

      {!selectedNode ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-[#7C5339] space-y-3">
          <Settings2 className="size-8 text-[#9D6638] opacity-60" />
          <div className="space-y-1">
            <p className="text-xs font-bold text-[#4E220F]">No Node Selected</p>
            <p className="text-[11px] leading-relaxed">
              Click any node on the canvas to inspect parameters, input bindings, and execution results.
            </p>
          </div>
          {(nodeCount !== undefined || lastRun !== undefined) && (
            <div className="w-full rounded-xl border border-[#B0BA99]/60 bg-[#FFFFFF] p-3 text-left space-y-1.5">
              <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#7C5339]">
                Pipeline overview
              </p>
              {nodeCount !== undefined && (
                <p className="font-mono text-[11px] text-[#4E220F]">
                  {nodeCount} node{nodeCount === 1 ? '' : 's'}
                  {edgeCount !== undefined && ` · ${edgeCount} edge${edgeCount === 1 ? '' : 's'}`}
                </p>
              )}
              {lastRun ? (
                <p className="text-[11px] text-[#4E220F]">
                  <span className="font-bold">Last run:</span>{' '}
                  <span className="font-mono truncate inline-block max-w-[140px] align-bottom" title={lastRun.name}>
                    {lastRun.name}
                  </span>{' '}
                  <span
                    className={`font-mono text-[10px] font-bold uppercase ${
                      lastRun.status === 'failed' ? 'text-[#A83232]' : 'text-[#2E6B47]'
                    }`}
                  >
                    • {lastRun.status}
                  </span>
                </p>
              ) : (
                lastRun !== undefined && (
                  <p className="text-[11px] text-[#7C5339] italic">No runs yet — press Run Pipeline to start.</p>
                )
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3 pb-20 space-y-3.5">
          {/* Node Summary Card */}
          <div className="rounded-2xl border border-[#B0BA99] bg-[#FFFFFF] p-3 shadow-2xs space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] uppercase font-bold text-[#7C5339]">
                Selected Node
              </span>
              <div className="flex items-center gap-1.5">
                {toolManifest?.category && (
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded-md bg-[#9D6638]/10 border border-[#9D6638]/30 text-[#9D6638] font-bold uppercase">
                    {toolManifest.category}
                  </span>
                )}
                <span className="font-mono text-[10px] px-2 py-0.5 rounded-md bg-[#EDE5CD] border border-[#B0BA99]/60 text-[#4E220F] font-bold">
                  {selectedNode.id}
                </span>
              </div>
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
            <div className="flex items-center justify-between border-b border-[#B0BA99]/50 pb-1.5">
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#4E220F]">
                Tool Parameters
              </span>
              <span className="font-mono text-[9px] text-[#7C5339]">
                Edits apply to the next run
              </span>
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
            <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-[#B0BA99]/60 bg-[#F7F1DE]/40 p-1.5 text-[10px] font-bold text-[#4E220F]">
              <span className="text-[#7C5339] font-normal mr-1">Test input:</span>
              {[
                { key: 'auto', label: 'Auto' },
                { key: 'latest', label: 'Latest upstream' },
                { key: 'fixture', label: 'Pick fixture' },
              ].map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setTestInputMode(opt.key as typeof testInputMode)}
                  className={`px-2 py-0.5 rounded-lg transition-all ${
                    testInputMode === opt.key
                      ? 'bg-[#9D6638] text-[#FDFBF7]'
                      : 'bg-[#FFFFFF] border border-[#B0BA99] hover:bg-[#EDE5CD]'
                  }`}
                  title={
                    opt.key === 'auto'
                      ? 'Use the latest available upstream output automatically'
                      : opt.key === 'latest'
                        ? 'Pull the most recent upstream artifact into this step'
                        : 'Choose an existing artifact to feed this step'
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-[#7C5339] leading-relaxed">
              Runs this tool in isolation using your current parameters.
              {testInputMode === 'latest' && ' Uses the most recent upstream output.'}
              {testInputMode === 'fixture' && ' Prompts you to pick an existing artifact.'}
            </p>
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
