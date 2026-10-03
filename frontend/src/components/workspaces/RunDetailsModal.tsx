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
    <div className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-brand-espresso/30 backdrop-blur-[3px]">
      <div className="relative flex flex-col w-full max-w-3xl max-h-[85vh] rounded-2xl border-2 border-brand-sage bg-brand-cream shadow-2xl overflow-hidden text-brand-espresso">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-brand-sage/60 px-5 py-3.5 bg-brand-cream-dark/80">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-xl bg-brand-caramel text-brand-cream-light shadow-xs">
              <FileTerminal className="size-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-brand-espresso font-mono flex items-center gap-2">
                Run Details: {runId}
                {manifest?.status ? (
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-mono font-bold ${
                      manifest.status === 'completed'
                        ? 'bg-brand-sage/40 text-brand-espresso border border-brand-sage'
                        : 'bg-accent-contrast/15 text-accent-contrast border border-accent-contrast/30'
                    }`}
                  >
                    {String(manifest.status).toUpperCase()}
                  </span>
                ) : null}
              </h3>
              {manifest?.tool_id ? (
                <p className="text-xs text-brand-caramel-text font-mono font-medium">
                  Tool: {String(manifest.tool_id)}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onBranch && (
              <button
                onClick={onBranch}
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand-caramel px-3 py-1.5 text-xs font-bold text-brand-cream-light shadow-xs hover:bg-brand-caramel-hover transition-all"
                title="Branch pipeline from this run checkpoint"
              >
                <GitBranch className="size-3.5" /> Branch to Pipeline
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-brand-caramel-text hover:bg-brand-sage/30 hover:text-brand-espresso transition-colors"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-auto p-5 space-y-4 bg-brand-cream text-xs">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-brand-caramel-text font-mono animate-pulse">
              Loading run metadata and execution logs...
            </div>
          ) : (
            <>
              {/* Parameters & Metadata */}
              {manifest?.params && Object.keys(manifest.params as Record<string, unknown>).length > 0 && (
                <div className="rounded-xl border border-brand-sage bg-surface-white p-3.5 space-y-2 shadow-xs">
                  <span className="font-mono text-xs uppercase font-bold text-brand-caramel-text flex items-center gap-1">
                    <Layers className="size-3 text-brand-caramel" /> Execution Parameters
                  </span>
                  <pre className="p-3 rounded-lg bg-brand-cream-dark/50 font-mono text-xs text-brand-espresso overflow-x-auto border border-brand-sage/50 font-medium">
                    {JSON.stringify(manifest.params, null, 2)}
                  </pre>
                </div>
              )}

              {/* Execution Logs */}
              <div className="rounded-xl border border-brand-sage bg-surface-white p-3.5 space-y-2.5 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs uppercase font-bold text-brand-caramel-text flex items-center gap-1">
                    <FileTerminal className="size-3 text-brand-caramel" /> Execution Output Logs
                  </span>
                  <button
                    onClick={copyLogs}
                    className="inline-flex items-center gap-1 rounded-lg border border-brand-sage bg-brand-cream-dark px-2.5 py-1 font-mono text-xs text-brand-espresso font-bold hover:bg-brand-sage/40 transition-colors"
                  >
                    {copied ? <Check className="size-3 text-brand-caramel" /> : <Copy className="size-3" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>

                <pre className="p-3 rounded-lg bg-brand-cream-dark/50 font-mono text-xs text-brand-espresso overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-[40vh] border border-brand-sage/50 font-medium">
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
