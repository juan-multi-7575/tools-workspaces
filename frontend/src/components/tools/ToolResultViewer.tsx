import { useState } from 'react'
import {
  CheckCircle2,
  AlertCircle,
  Clock,
  Copy,
  Check,
  RotateCcw,
  Download,
  FileText,
  Play,
  Volume2,
  Terminal,
  Layers,
  Sparkles,
} from 'lucide-react'
import { resolveUrl } from '../../lib/api'
import { errorMessage } from '../../lib/apiTransport'
import { formatFileName, getArtifactBadge } from '../../lib/utils'

export interface ToolResultViewerProps {
  toolId: string
  toolName: string
  status: string
  artifacts: { name: string; path: string; kind?: string }[]
  data?: Record<string, any> | null
  outputText?: string | null
  elapsedSeconds?: number
  onRerun?: () => void
  onOpenAudioPlayer?: (media: { name: string; url: string; runId?: string; artifactName?: string; mimeType?: string }) => void
}

function getModelColorStyle(modelName: string) {
  const lower = String(modelName || '').toLowerCase()
  if (lower.includes('nemotron') || lower.includes('nvidia')) {
    return 'bg-emerald-100 text-emerald-950 border-emerald-300'
  }
  if (lower.includes('llama') || lower.includes('meta')) {
    return 'bg-blue-100 text-blue-950 border-blue-300'
  }
  if (lower.includes('mistral') || lower.includes('mixtral') || lower.includes('codestral')) {
    return 'bg-amber-100 text-amber-950 border-amber-300'
  }
  if (lower.includes('gemma') || lower.includes('google')) {
    return 'bg-indigo-100 text-indigo-950 border-indigo-300'
  }
  if (lower.includes('deepseek')) {
    return 'bg-cyan-100 text-cyan-950 border-cyan-300'
  }
  if (lower.includes('gpt') || lower.includes('openai')) {
    return 'bg-teal-100 text-teal-950 border-teal-300'
  }
  if (lower.includes('claude') || lower.includes('anthropic')) {
    return 'bg-orange-100 text-orange-950 border-orange-300'
  }
  return 'bg-brand-cream-dark text-brand-espresso border-brand-sage'
}

export default function ToolResultViewer({
  toolId,
  toolName,
  status,
  artifacts = [],
  data,
  outputText,
  elapsedSeconds,
  onRerun,
  onOpenAudioPlayer,
}: ToolResultViewerProps) {
  const [copied, setCopied] = useState(false)
  const [copiedPath, setCopiedPath] = useState<string | null>(null)
  const [tableFilter, setTableFilter] = useState<'all' | 'passed' | 'failed'>('all')
  const [tableSearch, setTableSearch] = useState('')

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isAudioFile = (name: string) => /\.(mp3|wav|ogg|flac|m4a|aac)$/i.test(name)
  const isImageFile = (name: string) => /\.(png|jpg|jpeg|webp|gif|svg)$/i.test(name)

  const primaryArtifact = artifacts[0]
  const downloadUrl = primaryArtifact ? resolveUrl(`/api/artifacts/content?path=${encodeURIComponent(primaryArtifact.path)}`) : ''

  return (
    <div className="space-y-4 font-sans text-xs text-brand-espresso w-full min-w-0 overflow-x-hidden">
      {/* 1. STATUS & DURATION BANNER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-2xl border border-brand-sage bg-brand-cream-dark/50 p-3.5 shadow-2xs">
        <div className="flex items-center gap-2.5">
          <span
            className={`flex size-7 items-center justify-center rounded-xl shadow-2xs ${
              status === 'completed'
                ? 'bg-brand-caramel text-brand-cream-light'
                : 'bg-brand-sage text-brand-espresso'
            }`}
          >
            {status === 'completed' ? <CheckCircle2 className="size-4" /> : <AlertCircle className="size-4" />}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-sm text-brand-espresso">{toolName}</h4>
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-full bg-brand-caramel/15 border border-brand-caramel/30 text-brand-espresso uppercase">
                {status}
              </span>
            </div>
            <p className="text-xs text-brand-caramel-text flex items-center gap-2 mt-0.5">
              {elapsedSeconds !== undefined && (
                <span className="flex items-center gap-1 font-mono">
                  <Clock className="size-3 text-brand-caramel" />
                  {elapsedSeconds.toFixed(2)}s elapsed
                </span>
              )}
              <span>•</span>
              <span>{artifacts.length} output artifact{artifacts.length === 1 ? '' : 's'}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          {outputText && (
            <button
              type="button"
              onClick={() => copyToClipboard(outputText)}
              className="inline-flex items-center gap-1 rounded-xl border border-brand-sage bg-surface-white px-2.5 py-1.5 font-bold text-brand-espresso hover:bg-brand-cream-dark active:scale-95 transition-all shadow-2xs"
            >
              {copied ? <Check className="size-3 text-brand-caramel" /> : <Copy className="size-3 text-brand-caramel-text" />}
              <span>{copied ? 'Copied' : 'Copy Output'}</span>
            </button>
          )}

          {onRerun && (
            <button
              type="button"
              onClick={onRerun}
              className="inline-flex items-center gap-1 rounded-xl border border-brand-sage bg-surface-white px-2.5 py-1.5 font-bold text-brand-espresso hover:bg-brand-cream-dark active:scale-95 transition-all shadow-2xs"
              title="Edit parameters & run again"
            >
              <RotateCcw className="size-3 text-brand-caramel" />
              <span>Modify & Re-run</span>
            </button>
          )}
        </div>
      </div>

      {/* QUICK SAVED OUTPUTS & FILE PATH ACCESS */}
      {artifacts && artifacts.length > 0 && (
        <div className="rounded-2xl border border-brand-sage bg-surface-white p-3.5 shadow-2xs space-y-2.5">
          <div className="flex items-center justify-between font-mono text-xs font-bold text-brand-caramel-text uppercase">
            <span className="flex items-center gap-1.5">
              <Layers className="size-3.5 text-brand-caramel" />
              Saved Output Files ({artifacts.length})
            </span>
            <span className="text-xs text-brand-caramel-text/80 lowercase font-normal">
              1-click copy path or download
            </span>
          </div>

          <div className="space-y-2">
            {artifacts.map((art) => {
              const badge = getArtifactBadge(art.name)
              const downloadUrl = resolveUrl(`/api/artifacts/content?path=${encodeURIComponent(art.path)}`)
              const isCopied = copiedPath === art.path
              return (
                <div
                  key={art.name}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-brand-sage/60 bg-brand-cream/40 p-2.5 shadow-2xs hover:border-brand-caramel/70 transition-all"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className={`font-mono text-xs font-extrabold px-1.5 py-0.5 rounded border uppercase shrink-0 ${badge.color}`}>
                      {badge.label}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-xs font-bold text-brand-espresso truncate" title={art.name}>
                        {formatFileName(art.name, 45)}
                      </p>
                      <p className="font-mono text-xs text-brand-caramel-text/80 truncate select-all" title={art.path}>
                        {art.path}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                    {/* Copy Path */}
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(art.path)
                        setCopiedPath(art.path)
                        setTimeout(() => setCopiedPath(null), 2000)
                      }}
                      className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-1 text-xs font-mono font-bold transition-all shadow-xs ${
                        isCopied
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                          : 'border-brand-sage bg-brand-cream-dark text-brand-espresso hover:bg-brand-sage/40 hover:text-brand-caramel'
                      }`}
                      title="Copy exact absolute file path"
                    >
                      {isCopied ? <Check className="size-3 text-emerald-700" /> : <Copy className="size-3 text-brand-caramel" />}
                      <span>{isCopied ? 'Path Copied!' : 'Copy Path'}</span>
                    </button>

                    {/* Download */}
                    <a
                      href={downloadUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-xl border border-brand-sage bg-brand-cream-dark px-2.5 py-1 text-xs font-mono font-bold text-brand-espresso hover:bg-brand-sage/40 hover:text-brand-caramel transition-all shadow-xs"
                      title="Download or open file directly"
                    >
                      <Download className="size-3 text-brand-caramel" />
                      <span>Get File</span>
                    </a>

                    {/* Play if audio */}
                    {isAudioFile(art.name) && onOpenAudioPlayer && (
                      <button
                        type="button"
                        onClick={() => onOpenAudioPlayer({ name: art.name, url: downloadUrl, artifactName: art.name })}
                        className="inline-flex items-center gap-1 rounded-xl bg-brand-caramel px-2.5 py-1 text-xs font-mono font-bold text-surface-white hover:bg-brand-caramel-hover transition-all shadow-xs"
                      >
                        <Play className="size-3 fill-current" />
                        <span>Play</span>
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 2. SPECIFIC INTERACTIVE LIVE RESULT VIEWERS */}

      {/* A. AI MODEL HEALTH CHECK & PROBE RESULTS */}
      {toolId === 'ai_model_health_check' && data && (() => {
        const rawResults = data.results || []
        const totalProbed = data.summary?.total_probed ?? rawResults.length
        const healthyCount = data.summary?.healthy ?? rawResults.filter((r: any) => r.status === 'HEALTHY').length
        const failedCount = (data.summary?.failed || 0) + (data.summary?.unconfigured || 0)

        const filteredRows = rawResults.filter((r: any) => {
          const isHealthy = r.status === 'HEALTHY'
          if (tableFilter === 'passed' && !isHealthy) return false
          if (tableFilter === 'failed' && isHealthy) return false
          if (tableSearch.trim()) {
            const q = tableSearch.toLowerCase()
            const matchModel = String(r.model || '').toLowerCase().includes(q)
            const matchProvider = String(r.provider_name || r.provider || '').toLowerCase().includes(q)
            const matchErr = errorMessage(r.error || '').toLowerCase().includes(q)
            return matchModel || matchProvider || matchErr
          }
          return true
        })

        return (
          <div className="space-y-3">
            {/* Telemetry Summary Cards */}
            {data.summary && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="rounded-xl border border-brand-sage bg-surface-white p-3 text-center shadow-2xs">
                  <span className="font-mono text-xs text-brand-caramel-text uppercase font-bold">Health Rate</span>
                  <p className={`text-lg font-bold mt-0.5 ${
                    data.summary.health_percentage === 100
                      ? 'text-emerald-700'
                      : data.summary.health_percentage > 0
                        ? 'text-brand-caramel'
                        : 'text-rose-700'
                  }`}>
                    {data.summary.health_percentage}%
                  </p>
                </div>
                <div className="rounded-xl border border-brand-sage bg-surface-white p-3 text-center shadow-2xs">
                  <span className="font-mono text-xs text-brand-caramel-text uppercase font-bold">Total Probed</span>
                  <p className="text-lg font-bold text-brand-espresso mt-0.5">
                    {data.summary.total_probed}
                  </p>
                </div>
                <div className="rounded-xl border border-brand-sage bg-surface-white p-3 text-center shadow-2xs">
                  <span className="font-mono text-xs text-brand-caramel-text uppercase font-bold">Passed</span>
                  <p className="text-lg font-bold text-emerald-700 mt-0.5">
                    {data.summary.healthy}
                  </p>
                </div>
                <div className="rounded-xl border border-brand-sage bg-surface-white p-3 text-center shadow-2xs">
                  <span className="font-mono text-xs text-brand-caramel-text uppercase font-bold">Failed / Unconf</span>
                  <p className={`text-lg font-bold mt-0.5 ${failedCount > 0 ? 'text-rose-700' : 'text-brand-caramel-text'}`}>
                    {failedCount}
                  </p>
                </div>
              </div>
            )}

            {/* Filter & Search Bar for Table */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 bg-brand-cream-dark/50 p-2.5 rounded-xl border border-brand-sage">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setTableFilter('all')}
                  className={`font-mono text-xs px-2.5 py-1 rounded-lg border transition-all ${
                    tableFilter === 'all'
                      ? 'bg-brand-caramel text-brand-cream-light border-brand-caramel font-bold shadow-2xs'
                      : 'bg-surface-white text-brand-espresso border-brand-sage hover:bg-brand-cream-dark'
                  }`}
                >
                  All ({totalProbed})
                </button>
                <button
                  type="button"
                  onClick={() => setTableFilter('passed')}
                  className={`font-mono text-xs px-2.5 py-1 rounded-lg border transition-all ${
                    tableFilter === 'passed'
                      ? 'bg-emerald-700 text-brand-cream-light border-emerald-700 font-bold shadow-2xs'
                      : 'bg-surface-white text-emerald-800 border-brand-sage hover:bg-brand-cream-dark'
                  }`}
                >
                  Passed ({healthyCount})
                </button>
                <button
                  type="button"
                  onClick={() => setTableFilter('failed')}
                  className={`font-mono text-xs px-2.5 py-1 rounded-lg border transition-all ${
                    tableFilter === 'failed'
                      ? 'bg-rose-700 text-brand-cream-light border-rose-700 font-bold shadow-2xs'
                      : 'bg-surface-white text-rose-800 border-brand-sage hover:bg-brand-cream-dark'
                  }`}
                >
                  Failed ({failedCount})
                </button>
              </div>

              <div className="relative flex-1 sm:max-w-xs">
                <input
                  type="text"
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  placeholder="Filter model name or diagnostic..."
                  className="w-full rounded-lg border border-brand-sage bg-surface-white px-2.5 py-1 font-mono text-xs text-brand-espresso placeholder-brand-caramel-text/60 focus:border-brand-caramel focus:outline-none"
                />
                {tableSearch && (
                  <button
                    type="button"
                    onClick={() => setTableSearch('')}
                    className="absolute right-1.5 top-1 font-mono text-xs text-brand-caramel-text hover:text-brand-espresso px-1 rounded bg-brand-cream-dark"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Interactive Model Health Table */}
            <div className="rounded-2xl border border-brand-sage bg-surface-white shadow-2xs overflow-hidden">
              <div className="overflow-x-auto max-h-[440px] overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-brand-cream-dark/80 text-brand-espresso font-bold text-xs font-mono uppercase tracking-wider sticky top-0 border-b border-brand-sage z-panel">
                    <tr>
                      <th className="py-2.5 px-3">Model Name</th>
                      <th className="py-2.5 px-3">Provider</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Tests Passed</th>
                      <th className="py-2.5 px-3">Tests Failed / Diagnostics</th>
                      <th className="py-2.5 px-3 text-right">Latency</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-sage/40 font-mono text-xs">
                    {filteredRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-xs text-brand-caramel-text italic">
                          No model probe results match the current filter.
                        </td>
                      </tr>
                    ) : (
                      filteredRows.map((r: any, idx: number) => {
                        const isHealthy = r.status === 'HEALTHY'
                        const isUnconfigured = r.status === 'UNCONFIGURED'
                        const passedList: string[] = r.tests_passed || (isHealthy ? ['Auth Verification', 'Chat Completion', 'Payload Schema', 'Latency SLA'] : [])
                        const failedList: string[] = r.tests_failed || (isUnconfigured ? ['API Key Configured'] : (!isHealthy ? [r.error ? errorMessage(r.error).slice(0, 30) : 'Probe Failed'] : []))

                        return (
                          <tr
                            key={idx}
                            className={`hover:bg-brand-cream-dark/30 transition-colors ${
                              isHealthy ? 'bg-brand-cream-light' : 'bg-surface-warm-white'
                            }`}
                          >
                            {/* 1. MODEL NAME (Focal Point with distinct color badge) */}
                            <td className="py-2.5 px-3 align-top whitespace-nowrap">
                              <span className={`inline-block font-bold text-xs px-2.5 py-1 rounded-lg border shadow-2xs ${getModelColorStyle(r.model)}`}>
                                {r.model}
                              </span>
                            </td>

                            {/* 2. PROVIDER */}
                            <td className="py-2.5 px-3 align-top whitespace-nowrap text-brand-espresso font-sans font-bold text-xs">
                              {r.provider_name || r.provider}
                            </td>

                            {/* 3. STATUS (Tick mark / Cross) */}
                            <td className="py-2.5 px-3 align-top whitespace-nowrap">
                              {isHealthy ? (
                                <span className="inline-flex items-center gap-1 font-bold text-xs px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">
                                  <CheckCircle2 className="size-3 text-emerald-600" />
                                  <span>PASSED</span>
                                </span>
                              ) : isUnconfigured ? (
                                <span className="inline-flex items-center gap-1 font-bold text-xs px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-300 shadow-2xs">
                                  <AlertCircle className="size-3 text-amber-600" />
                                  <span>UNCONFIG</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 font-bold text-xs px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 border border-rose-300 shadow-2xs">
                                  <AlertCircle className="size-3 text-rose-600" />
                                  <span>FAILED</span>
                                </span>
                              )}
                            </td>

                            {/* 4. TESTS PASSED */}
                            <td className="py-2.5 px-3 align-top">
                              {passedList.length > 0 ? (
                                <div className="flex flex-wrap gap-1 max-w-xs">
                                  {passedList.map((t: string, tidx: number) => (
                                    <span
                                      key={tidx}
                                      className="inline-flex items-center gap-1 text-xs font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap"
                                    >
                                      <Check className="size-2 text-emerald-600" />
                                      {t}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-brand-caramel-text/50 text-xs italic">—</span>
                              )}
                            </td>

                            {/* 5. TESTS FAILED & DIAGNOSTICS */}
                            <td className="py-2.5 px-3 align-top">
                              {isHealthy ? (
                                <div className="space-y-0.5">
                                  <span className="text-emerald-700 font-bold text-xs flex items-center gap-1">
                                    <Check className="size-2.5" /> All checks operational
                                  </span>
                                  {r.response_snippet && (
                                    <span className="text-brand-caramel-text text-xs block truncate max-w-[280px]" title={r.response_snippet}>
                                      "{r.response_snippet}"
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <div className="space-y-1">
                                  {failedList.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                      {failedList.map((f: string, fidx: number) => (
                                        <span
                                          key={fidx}
                                          className="inline-flex items-center gap-1 text-xs font-bold px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 whitespace-nowrap"
                                        >
                                          ✕ {f}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                  {r.error && (
                                    <div
                                      className="font-mono text-xs text-rose-800 bg-rose-50/80 border border-rose-200/80 px-2 py-1 rounded-md max-w-md break-words"
                                      title={errorMessage(r.error)}
                                    >
                                      {errorMessage(r.error)}
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>

                            {/* 6. LATENCY */}
                            <td className="py-2.5 px-3 align-top text-right whitespace-nowrap">
                              {r.latency_ms !== null && r.latency_ms !== undefined && r.latency_ms > 0 ? (
                                <span className={`font-bold text-xs px-2 py-0.5 rounded-md border ${
                                  r.latency_ms < 150
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                    : r.latency_ms < 500
                                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                                      : 'bg-rose-50 text-rose-800 border-rose-200'
                                }`}>
                                  {r.latency_ms}ms
                                </span>
                              ) : (
                                <span className="text-brand-caramel-text/50">—</span>
                              )}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      })()}

      {/* B. SUMMARIZER LIVE RESULTS */}
      {toolId === 'summarizer' && data && (
        <div className="rounded-2xl border border-brand-sage bg-surface-white p-4 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-brand-sage/60 pb-2.5">
            <h5 className="font-bold text-xs text-brand-espresso flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-brand-caramel" />
              Executive Summary & Key Takeaways
            </h5>
            <span className="font-mono text-xs font-bold text-brand-caramel bg-brand-cream-dark px-2 py-0.5 rounded-lg">
              {data.bullet_count || data.takeaways?.length || 0} Key Points
            </span>
          </div>

          <div className="space-y-2">
            {(data.takeaways || []).map((point: string, idx: number) => (
              <div key={idx} className="flex items-start gap-2.5 rounded-xl bg-brand-cream/60 p-3 border border-brand-sage/40">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-caramel text-xs font-bold text-brand-cream-light">
                  {idx + 1}
                </span>
                <p className="text-xs leading-relaxed text-brand-espresso font-medium">{point}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* C. CODEC TRANSFORMER RESULTS */}
      {toolId === 'codec_tool' && data && (
        <div className="rounded-2xl border border-brand-sage bg-surface-white p-4 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-brand-sage/60 pb-2.5">
            <h5 className="font-bold text-xs text-brand-espresso flex items-center gap-1.5">
              <Layers className="size-3.5 text-brand-caramel" />
              Codec Transformation Result
            </h5>
            <span className="font-mono text-xs font-bold text-brand-espresso bg-brand-cream-dark px-2 py-0.5 rounded-lg uppercase">
              {data.codec} • {data.length} chars
            </span>
          </div>

          <div className="relative">
            <textarea
              readOnly
              value={data.output || ''}
              rows={6}
              className="w-full rounded-xl border border-brand-sage bg-brand-cream/80 p-3 font-mono text-xs text-brand-espresso shadow-inner focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* D. SCRIPT RUNNER LIVE TERMINAL LOGS */}
      {toolId === 'script_runner' && (
        <div className="rounded-2xl border border-brand-sage bg-surface-dark p-4 text-brand-cream-light shadow-md space-y-2">
          <div className="flex items-center justify-between border-b border-brand-cream-dark/20 pb-2">
            <div className="flex items-center gap-2">
              <Terminal className="size-3.5 text-brand-cream-dark" />
              <span className="font-mono text-xs font-bold text-brand-cream-light">Process Output Console</span>
            </div>
            {data?.exit_code !== undefined && (
              <span
                className={`font-mono text-xs font-bold px-2 py-0.5 rounded-md ${
                  data.exit_code === 0 ? 'bg-brand-caramel text-brand-cream-light' : 'bg-brand-caramel-text text-brand-cream-light'
                }`}
              >
                Exit Code: {data.exit_code}
              </span>
            )}
          </div>

          <pre className="max-h-64 overflow-y-auto font-mono text-xs leading-relaxed text-brand-cream-dark whitespace-pre-wrap">
            {outputText || data?.stdout || 'No process output returned.'}
          </pre>
        </div>
      )}

      {/* E. MEDIAINFO INSPECTOR */}
      {toolId === 'mediainfo' && data && (
        <div className="rounded-2xl border border-brand-sage bg-surface-white p-4 shadow-2xs space-y-3">
          <h5 className="font-bold text-xs text-brand-espresso flex items-center gap-1.5">
            <Volume2 className="size-3.5 text-brand-caramel" />
            Media Stream Properties
          </h5>

          {data.format && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="rounded-xl bg-brand-cream/70 p-2.5 border border-brand-sage/60 text-center">
                <span className="text-xs text-brand-caramel-text font-bold block">Format</span>
                <span className="font-mono text-xs font-bold text-brand-espresso">{data.format.format_name || 'N/A'}</span>
              </div>
              <div className="rounded-xl bg-brand-cream/70 p-2.5 border border-brand-sage/60 text-center">
                <span className="text-xs text-brand-caramel-text font-bold block">Duration</span>
                <span className="font-mono text-xs font-bold text-brand-espresso">
                  {data.format.duration ? `${parseFloat(data.format.duration).toFixed(1)}s` : 'N/A'}
                </span>
              </div>
              <div className="rounded-xl bg-brand-cream/70 p-2.5 border border-brand-sage/60 text-center">
                <span className="text-xs text-brand-caramel-text font-bold block">Bitrate</span>
                <span className="font-mono text-xs font-bold text-brand-espresso">
                  {data.format.bit_rate ? `${Math.round(data.format.bit_rate / 1000)} kb/s` : 'N/A'}
                </span>
              </div>
              <div className="rounded-xl bg-brand-cream/70 p-2.5 border border-brand-sage/60 text-center">
                <span className="text-xs text-brand-caramel-text font-bold block">Streams</span>
                <span className="font-mono text-xs font-bold text-brand-espresso">{data.streams?.length || 1}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* F. INLINE AUDIO / MEDIA PLAYER */}
      {primaryArtifact && isAudioFile(primaryArtifact.name) && (
        <div className="rounded-2xl border border-brand-sage bg-brand-cream-dark/50 p-4 shadow-2xs space-y-2.5">
          <div className="flex items-center justify-between">
            <h5 className="font-bold text-xs text-brand-espresso flex items-center gap-1.5">
              <Volume2 className="size-3.5 text-brand-caramel" />
              Generated Audio Stream
            </h5>
            {onOpenAudioPlayer && (
              <button
                type="button"
                onClick={() =>
                  onOpenAudioPlayer({
                    name: primaryArtifact.name,
                    url: downloadUrl,
                  })
                }
                className="inline-flex items-center gap-1 text-xs font-bold text-brand-caramel hover:underline"
              >
                <Play className="size-3 fill-current" />
                Open in Waveform Player
              </button>
            )}
          </div>

          <audio controls className="w-full rounded-xl" src={downloadUrl}>
            Your browser does not support audio playback.
          </audio>
        </div>
      )}

      {/* G. INLINE IMAGE PREVIEW */}
      {primaryArtifact && isImageFile(primaryArtifact.name) && (
        <div className="rounded-2xl border border-brand-sage bg-surface-white p-4 shadow-2xs space-y-2.5 text-center">
          <h5 className="font-bold text-xs text-brand-espresso flex items-center gap-1.5 justify-center mb-2">
            Image Output Preview
          </h5>
          <img
            src={downloadUrl}
            alt={primaryArtifact.name}
            className="max-h-72 mx-auto rounded-xl object-contain border border-brand-sage/60 shadow-xs"
          />
        </div>
      )}

      {/* H. RAW TEXT / DOCUMENT FALLBACK (When tool produces text and no custom viewer matches) */}
      {!['ai_model_health_check', 'summarizer', 'codec_tool', 'script_runner'].includes(toolId) && outputText && (
        <div className="rounded-2xl border border-brand-sage bg-surface-white p-4 shadow-2xs space-y-2">
          <h5 className="font-bold text-xs text-brand-espresso">Generated Content</h5>
          <pre className="max-h-64 overflow-y-auto font-mono text-xs leading-relaxed text-brand-espresso bg-brand-cream/80 p-3 rounded-xl border border-brand-sage/60 whitespace-pre-wrap">
            {outputText}
          </pre>
        </div>
      )}

      {/* 3. ARTIFACTS ACTION BAR */}
      {artifacts && artifacts.length > 0 && toolId !== 'ai_model_health_check' && (
        <div className="rounded-2xl border border-brand-sage/70 bg-surface-white p-3.5 shadow-2xs space-y-2">
          <h5 className="font-bold text-xs text-brand-espresso flex items-center gap-1.5">
            <FileText className="size-3.5 text-brand-caramel" />
            Output Artifacts
          </h5>

          <div className="space-y-1.5">
            {artifacts.map((art, idx) => {
              const url = resolveUrl(`/api/artifacts/content?path=${encodeURIComponent(art.path)}`)
              return (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded-xl bg-brand-cream/60 px-3 py-2 border border-brand-sage/40"
                >
                  <span className="font-mono text-xs font-medium text-brand-espresso truncate">{art.name}</span>
                  <a
                    href={url}
                    download={art.name}
                    className="inline-flex items-center gap-1 rounded-lg bg-brand-caramel px-2.5 py-1 text-xs font-bold text-brand-cream-light hover:bg-brand-caramel-hover transition-all"
                  >
                    <Download className="size-3" />
                    Download
                  </a>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
