import React, { useState } from 'react'
import { Wrench, Clock, AlertCircle, X, ChevronDown, ChevronUp, CheckCircle2, Loader2 } from 'lucide-react'
import type { ToolExecutionRecord } from '../ActivityContext'

interface ToolRunsTabProps {
  executions: ToolExecutionRecord[]
  filterQuery: string
  onRemove: (id: string) => void
}

function formatDuration(sec?: number): string {
  if (sec === undefined || sec === null) return '--'
  if (sec < 60) return `${sec.toFixed(1)}s`
  const mins = Math.floor(sec / 60)
  const remSec = Math.round(sec % 60)
  return `${mins}m ${remSec}s`
}

function formatTimeAgo(timestamp: number): string {
  const elapsedSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (elapsedSec < 10) return 'just now'
  if (elapsedSec < 60) return `${elapsedSec}s ago`
  const elapsedMin = Math.floor(elapsedSec / 60)
  if (elapsedMin < 60) return `${elapsedMin}m ago`
  const elapsedHours = Math.floor(elapsedMin / 60)
  return `${elapsedHours}h ago`
}

export const ToolRunsTab: React.FC<ToolRunsTabProps> = ({
  executions,
  filterQuery,
  onRemove,
}) => {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const filtered = executions.filter((t) => {
    if (!filterQuery) return true
    const q = filterQuery.toLowerCase()
    return (
      t.toolName.toLowerCase().includes(q) ||
      t.toolId.toLowerCase().includes(q) ||
      (t.error && t.error.toLowerCase().includes(q))
    )
  })

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#7C5339] flex items-center gap-1">
          <Wrench className="size-3 text-[#9D6638]" />
          Tool Execution History
        </span>
        <span className="font-mono text-[10px] text-[#7C5339]">
          {filtered.length} runs recorded
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#B0BA99] bg-[#EDE5CD]/40 p-8 text-center text-[#7C5339] text-xs font-mono">
          <Clock className="mx-auto size-6 text-[#9D6638] mb-2 opacity-60" />
          {filterQuery ? 'No matching tool runs found.' : 'No tool executions recorded yet.'}
        </div>
      ) : (
        filtered.map((exec) => {
          const isExpanded = expandedIds.has(exec.id)
          return (
            <div
              key={exec.id}
              className="relative rounded-xl border border-[#B0BA99] bg-[#FFFFFF] p-3 shadow-xs space-y-2 transition-all hover:border-[#9D6638]/70 group"
            >
              <button
                onClick={() => onRemove(exec.id)}
                className="absolute right-2 top-2 p-1 text-[#7C5339]/50 hover:text-[#A83232] hover:bg-[#EDE5CD] rounded transition-colors"
                title="Dismiss record"
              >
                <X className="size-3" />
              </button>

              <div className="flex items-start justify-between gap-2 pr-6">
                <div className="flex items-center gap-2">
                  <div className="flex size-7 items-center justify-center rounded-lg bg-[#EDE5CD] text-[#9D6638] border border-[#B0BA99]/60 shrink-0">
                    <Wrench className="size-3.5" />
                  </div>
                  <div>
                    <span className="font-bold text-xs text-[#4E220F] block">
                      {exec.toolName}
                    </span>
                    <div className="flex items-center gap-1.5 font-mono text-[10px] text-[#7C5339]">
                      <span>ID: {exec.toolId}</span>
                      <span>•</span>
                      <span>{formatTimeAgo(exec.startTime)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`font-mono text-[9px] font-extrabold px-1.5 py-0.5 rounded border uppercase flex items-center gap-1 ${
                      exec.status === 'completed'
                        ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                        : exec.status === 'running'
                        ? 'bg-amber-100 text-amber-900 border-amber-300'
                        : exec.status === 'failed'
                        ? 'bg-rose-100 text-rose-900 border-rose-300'
                        : 'bg-[#EDE5CD] text-[#7C5339] border-[#B0BA99]'
                    }`}
                  >
                    {exec.status === 'completed' && <CheckCircle2 className="size-2.5 text-emerald-700" />}
                    {exec.status === 'running' && <Loader2 className="size-2.5 animate-spin text-amber-700" />}
                    {exec.status}
                  </span>
                </div>
              </div>

              {/* Execution Duration & Toggle */}
              <div className="flex items-center justify-between border-t border-[#B0BA99]/40 pt-1.5 font-mono text-[10px] text-[#7C5339]">
                <div className="flex items-center gap-2">
                  <span>Duration:</span>
                  <span className="font-bold text-[#4E220F]">
                    {formatDuration(exec.durationSeconds)}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => toggleExpand(exec.id)}
                  className="inline-flex items-center gap-1 text-[10px] text-[#9D6638] hover:underline"
                >
                  <span>{isExpanded ? 'Hide Details' : 'Details'}</span>
                  {isExpanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                </button>
              </div>

              {/* Expanded Details / Parameters / Error */}
              {isExpanded && (
                <div className="space-y-2 border-t border-[#B0BA99]/40 pt-2 text-xs">
                  {exec.error && (
                    <div className="rounded-lg border border-[#A83232]/30 bg-[#A83232]/10 p-2 font-mono text-[10px] text-[#A83232] leading-tight flex items-start gap-1.5">
                      <AlertCircle className="size-3 shrink-0 mt-0.5" />
                      <p className="break-all">{exec.error}</p>
                    </div>
                  )}

                  {exec.params && Object.keys(exec.params).length > 0 && (
                    <div className="rounded-lg bg-[#EDE5CD]/50 p-2 border border-[#B0BA99]/40 font-mono text-[10px] text-[#4E220F]">
                      <div className="font-bold text-[#7C5339] mb-1 uppercase tracking-wider text-[9px]">
                        Parameters
                      </div>
                      <div className="space-y-0.5 overflow-x-auto">
                        {Object.entries(exec.params).map(([k, v]) => (
                          <div key={k} className="flex gap-2">
                            <span className="text-[#9D6638]">{k}:</span>
                            <span className="truncate">{String(v)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
