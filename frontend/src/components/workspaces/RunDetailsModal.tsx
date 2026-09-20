import { useEffect, useState } from 'react'
import { X, Copy, Check, FileTerminal, Layers, GitBranch } from 'lucide-react'
import { api } from '../../lib/api'

export default function RunDetailsModal({
  workspaceId,
  runId,
  onBranch,
  onClose,
}: {
  workspaceId: string
  runId: string
  onBranch?: () => void
  onClose: () => void
}) {
  const [manifest, setManifest] = useState<Record<string, unknown> | null>(null)
  const [logs, setLogs] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api.getRunManifest(workspaceId, runId).catch(() => ({ manifest: {} })),
      api.getRunLogs(workspaceId, runId).catch(() => ({ logs: 'Failed to fetch logs.' })),
    ])
      .then(([mRes, lRes]) => {
        setManifest(mRes.manifest || null)
        setLogs(lRes.logs || '')
      })
      .finally(() => setLoading(false))
  }, [workspaceId, runId])

  const copyLogs = () => {
    if (logs) {
      navigator.clipboard.writeText(logs)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#4E220F]/30 backdrop-blur-[3px]">
      <div className="relative flex flex-col w-full max-w-3xl max-h-[85vh] rounded-2xl border-2 border-[#B0BA99] bg-[#F7F1DE] shadow-2xl overflow-hidden text-[#4E220F]">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#B0BA99]/60 px-5 py-3.5 bg-[#EDE5CD]/80">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-xl bg-[#9D6638] text-[#FDFBF7] shadow-xs">
              <FileTerminal className="size-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-[#4E220F] font-mono flex items-center gap-2">
                Run Details: {runId}
                {manifest?.status ? (
                  <span
                    className={`text-[9px] px-2 py-0.5 rounded-full font-mono font-bold ${
                      manifest.status === 'completed'
                        ? 'bg-[#B0BA99]/40 text-[#4E220F] border border-[#B0BA99]'
                        : 'bg-[#A83232]/15 text-[#A83232] border border-[#A83232]/30'
                    }`}
                  >
                    {String(manifest.status).toUpperCase()}
                  </span>
                ) : null}
              </h3>
              {manifest?.tool_id ? (
                <p className="text-[10px] text-[#7C5339] font-mono font-medium">
                  Tool: {String(manifest.tool_id)}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onBranch && (
              <button
                onClick={onBranch}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#9D6638] px-3 py-1.5 text-xs font-bold text-[#FDFBF7] shadow-xs hover:bg-[#86542C] transition-all"
                title="Branch pipeline from this run checkpoint"
              >
                <GitBranch className="size-3.5" /> Branch to Pipeline
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-[#7C5339] hover:bg-[#B0BA99]/30 hover:text-[#4E220F] transition-colors"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-auto p-5 space-y-4 bg-[#F7F1DE] text-xs">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-[#7C5339] font-mono animate-pulse">
              Loading run metadata and execution logs...
            </div>
          ) : (
            <>
              {/* Parameters & Metadata */}
              {manifest?.params && Object.keys(manifest.params as Record<string, unknown>).length > 0 && (
                <div className="rounded-xl border border-[#B0BA99] bg-[#FFFFFF] p-3.5 space-y-2 shadow-xs">
                  <span className="font-mono text-[10px] uppercase font-bold text-[#7C5339] flex items-center gap-1">
                    <Layers className="size-3 text-[#9D6638]" /> Execution Parameters
                  </span>
                  <pre className="p-3 rounded-lg bg-[#EDE5CD]/50 font-mono text-[11px] text-[#4E220F] overflow-x-auto border border-[#B0BA99]/50 font-medium">
                    {JSON.stringify(manifest.params, null, 2)}
                  </pre>
                </div>
              )}

              {/* Execution Logs */}
              <div className="rounded-xl border border-[#B0BA99] bg-[#FFFFFF] p-3.5 space-y-2.5 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase font-bold text-[#7C5339] flex items-center gap-1">
                    <FileTerminal className="size-3 text-[#9D6638]" /> Execution Output Logs
                  </span>
                  <button
                    onClick={copyLogs}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#B0BA99] bg-[#EDE5CD] px-2.5 py-1 font-mono text-[10px] text-[#4E220F] font-bold hover:bg-[#B0BA99]/40 transition-colors"
                  >
                    {copied ? <Check className="size-3 text-[#9D6638]" /> : <Copy className="size-3" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>

                <pre className="p-3 rounded-lg bg-[#EDE5CD]/50 font-mono text-[11px] text-[#4E220F] overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-[40vh] border border-[#B0BA99]/50 font-medium">
                  {logs}
                </pre>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
