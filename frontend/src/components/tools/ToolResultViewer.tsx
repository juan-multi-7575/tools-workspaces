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
  return 'bg-[#EDE5CD] text-[#4E220F] border-[#B0BA99]'
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
    <div className="space-y-4 font-sans text-xs text-[#4E220F] w-full min-w-0 overflow-x-hidden">
      {/* 1. STATUS & DURATION BANNER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-2xl border border-[#B0BA99] bg-[#EDE5CD]/50 p-3.5 shadow-2xs">
        <div className="flex items-center gap-2.5">
          <span
            className={`flex size-7 items-center justify-center rounded-xl shadow-2xs ${
              status === 'completed'
                ? 'bg-[#9D6638] text-[#FDFBF7]'
                : 'bg-[#B0BA99] text-[#4E220F]'
            }`}
          >
            {status === 'completed' ? <CheckCircle2 className="size-4" /> : <AlertCircle className="size-4" />}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-sm text-[#4E220F]">{toolName}</h4>
              <span className="font-mono text-[9px] font-bold px-2 py-0.5 rounded-full bg-[#9D6638]/15 border border-[#9D6638]/30 text-[#4E220F] uppercase">
                {status}
              </span>
            </div>
            <p className="text-[11px] text-[#7C5339] flex items-center gap-2 mt-0.5">
              {elapsedSeconds !== undefined && (
                <span className="flex items-center gap-1 font-mono">
                  <Clock className="size-3 text-[#9D6638]" />
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
              className="inline-flex items-center gap-1 rounded-xl border border-[#B0BA99] bg-[#FFFFFF] px-2.5 py-1.5 font-bold text-[#4E220F] hover:bg-[#EDE5CD] active:scale-95 transition-all shadow-2xs"
            >
              {copied ? <Check className="size-3 text-[#9D6638]" /> : <Copy className="size-3 text-[#7C5339]" />}
              <span>{copied ? 'Copied' : 'Copy Output'}</span>
            </button>
          )}

          {onRerun && (
            <button
              type="button"
              onClick={onRerun}
              className="inline-flex items-center gap-1 rounded-xl border border-[#B0BA99] bg-[#FFFFFF] px-2.5 py-1.5 font-bold text-[#4E220F] hover:bg-[#EDE5CD] active:scale-95 transition-all shadow-2xs"
              title="Edit parameters & run again"
            >
              <RotateCcw className="size-3 text-[#9D6638]" />
              <span>Modify & Re-run</span>
            </button>
          )}
        </div>
      </div>

      {/* QUICK SAVED OUTPUTS & FILE PATH ACCESS */}
      {artifacts && artifacts.length > 0 && (
        <div className="rounded-2xl border border-[#B0BA99] bg-[#FFFFFF] p-3.5 shadow-2xs space-y-2.5">
          <div className="flex items-center justify-between font-mono text-[10px] font-bold text-[#7C5339] uppercase">
            <span className="flex items-center gap-1.5">
              <Layers className="size-3.5 text-[#9D6638]" />
              Saved Output Files ({artifacts.length})
            </span>
            <span className="text-[9px] text-[#7C5339]/80 lowercase font-normal">
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
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-[#B0BA99]/60 bg-[#F7F1DE]/40 p-2.5 shadow-2xs hover:border-[#9D6638]/70 transition-all"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className={`font-mono text-[9px] font-extrabold px-1.5 py-0.5 rounded border uppercase shrink-0 ${badge.color}`}>
                      {badge.label}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-xs font-bold text-[#4E220F] truncate" title={art.name}>
                        {formatFileName(art.name, 45)}
                      </p>
                      <p className="font-mono text-[10px] text-[#7C5339]/80 truncate select-all" title={art.path}>
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
                          : 'border-[#B0BA99] bg-[#EDE5CD] text-[#4E220F] hover:bg-[#B0BA99]/40 hover:text-[#9D6638]'
                      }`}
                      title="Copy exact absolute file path"
                    >
                      {isCopied ? <Check className="size-3 text-emerald-700" /> : <Copy className="size-3 text-[#9D6638]" />}
                      <span>{isCopied ? 'Path Copied!' : 'Copy Path'}</span>
                    </button>

                    {/* Download */}
                    <a
                      href={downloadUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-xl border border-[#B0BA99] bg-[#EDE5CD] px-2.5 py-1 text-xs font-mono font-bold text-[#4E220F] hover:bg-[#B0BA99]/40 hover:text-[#9D6638] transition-all shadow-xs"
                      title="Download or open file directly"
                    >
                      <Download className="size-3 text-[#9D6638]" />
                      <span>Get File</span>
                    </a>

                    {/* Play if audio */}
                    {isAudioFile(art.name) && onOpenAudioPlayer && (
                      <button
                        type="button"
                        onClick={() => onOpenAudioPlayer({ name: art.name, url: downloadUrl, artifactName: art.name })}
                        className="inline-flex items-center gap-1 rounded-xl bg-[#9D6638] px-2.5 py-1 text-xs font-mono font-bold text-[#FFFFFF] hover:bg-[#86542C] transition-all shadow-xs"
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
            const matchErr = String(r.error || '').toLowerCase().includes(q)
            return matchModel || matchProvider || matchErr
          }
          return true
        })

        return (
          <div className="space-y-3">
            {/* Telemetry Summary Cards */}
            {data.summary && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="rounded-xl border border-[#B0BA99] bg-[#FFFFFF] p-3 text-center shadow-2xs">
                  <span className="font-mono text-[10px] text-[#7C5339] uppercase font-bold">Health Rate</span>
                  <p className={`text-lg font-bold mt-0.5 ${
                    data.summary.health_percentage === 100
                      ? 'text-emerald-700'
                      : data.summary.health_percentage > 0
                        ? 'text-[#9D6638]'
                        : 'text-rose-700'
                  }`}>
                    {data.summary.health_percentage}%
                  </p>
                </div>
                <div className="rounded-xl border border-[#B0BA99] bg-[#FFFFFF] p-3 text-center shadow-2xs">
                  <span className="font-mono text-[10px] text-[#7C5339] uppercase font-bold">Total Probed</span>
                  <p className="text-lg font-bold text-[#4E220F] mt-0.5">
                    {data.summary.total_probed}
                  </p>
                </div>
                <div className="rounded-xl border border-[#B0BA99] bg-[#FFFFFF] p-3 text-center shadow-2xs">
                  <span className="font-mono text-[10px] text-[#7C5339] uppercase font-bold">Passed</span>
                  <p className="text-lg font-bold text-emerald-700 mt-0.5">
                    {data.summary.healthy}
                  </p>
                </div>
                <div className="rounded-xl border border-[#B0BA99] bg-[#FFFFFF] p-3 text-center shadow-2xs">
                  <span className="font-mono text-[10px] text-[#7C5339] uppercase font-bold">Failed / Unconf</span>
                  <p className={`text-lg font-bold mt-0.5 ${failedCount > 0 ? 'text-rose-700' : 'text-[#7C5339]'}`}>
                    {failedCount}
                  </p>
                </div>
              </div>
            )}

            {/* Filter & Search Bar for Table */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 bg-[#EDE5CD]/50 p-2.5 rounded-xl border border-[#B0BA99]">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setTableFilter('all')}
                  className={`font-mono text-[10px] px-2.5 py-1 rounded-lg border transition-all ${
                    tableFilter === 'all'
                      ? 'bg-[#9D6638] text-[#FDFBF7] border-[#9D6638] font-bold shadow-2xs'
                      : 'bg-[#FFFFFF] text-[#4E220F] border-[#B0BA99] hover:bg-[#EDE5CD]'
                  }`}
                >
                  All ({totalProbed})
                </button>
                <button
                  type="button"
                  onClick={() => setTableFilter('passed')}
                  className={`font-mono text-[10px] px-2.5 py-1 rounded-lg border transition-all ${
                    tableFilter === 'passed'
                      ? 'bg-emerald-700 text-[#FDFBF7] border-emerald-700 font-bold shadow-2xs'
                      : 'bg-[#FFFFFF] text-emerald-800 border-[#B0BA99] hover:bg-[#EDE5CD]'
                  }`}
                >
                  Passed ({healthyCount})
                </button>
                <button
                  type="button"
                  onClick={() => setTableFilter('failed')}
                  className={`font-mono text-[10px] px-2.5 py-1 rounded-lg border transition-all ${
                    tableFilter === 'failed'
                      ? 'bg-rose-700 text-[#FDFBF7] border-rose-700 font-bold shadow-2xs'
                      : 'bg-[#FFFFFF] text-rose-800 border-[#B0BA99] hover:bg-[#EDE5CD]'
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
                  className="w-full rounded-lg border border-[#B0BA99] bg-[#FFFFFF] px-2.5 py-1 font-mono text-[10px] text-[#4E220F] placeholder-[#7C5339]/60 focus:border-[#9D6638] focus:outline-none"
                />
                {tableSearch && (
                  <button
                    type="button"
                    onClick={() => setTableSearch('')}
                    className="absolute right-1.5 top-1 font-mono text-[9px] text-[#7C5339] hover:text-[#4E220F] px-1 rounded bg-[#EDE5CD]"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Interactive Model Health Table */}
            <div className="rounded-2xl border border-[#B0BA99] bg-[#FFFFFF] shadow-2xs overflow-hidden">
              <div className="overflow-x-auto max-h-[440px] overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-[#EDE5CD]/80 text-[#4E220F] font-bold text-[10px] font-mono uppercase tracking-wider sticky top-0 border-b border-[#B0BA99] z-10">
                    <tr>
                      <th className="py-2.5 px-3">Model Name</th>
                      <th className="py-2.5 px-3">Provider</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Tests Passed</th>
                      <th className="py-2.5 px-3">Tests Failed / Diagnostics</th>
                      <th className="py-2.5 px-3 text-right">Latency</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#B0BA99]/40 font-mono text-[11px]">
                    {filteredRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-xs text-[#7C5339] italic">
                          No model probe results match the current filter.
                        </td>
                      </tr>
                    ) : (
                      filteredRows.map((r: any, idx: number) => {
                        const isHealthy = r.status === 'HEALTHY'
                        const isUnconfigured = r.status === 'UNCONFIGURED'
                        const passedList: string[] = r.tests_passed || (isHealthy ? ['Auth Verification', 'Chat Completion', 'Payload Schema', 'Latency SLA'] : [])
                        const failedList: string[] = r.tests_failed || (isUnconfigured ? ['API Key Configured'] : (!isHealthy ? [r.error ? r.error.slice(0, 30) : 'Probe Failed'] : []))

                        return (
                          <tr
                            key={idx}
                            className={`hover:bg-[#EDE5CD]/30 transition-colors ${
                              isHealthy ? 'bg-[#FDFBF7]' : 'bg-[#FFF9F5]'
                            }`}
                          >
                            {/* 1. MODEL NAME (Focal Point with distinct color badge) */}
                            <td className="py-2.5 px-3 align-top whitespace-nowrap">
                              <span className={`inline-block font-bold text-xs px-2.5 py-1 rounded-lg border shadow-2xs ${getModelColorStyle(r.model)}`}>
                                {r.model}
                              </span>
                            </td>

                            {/* 2. PROVIDER */}
                            <td className="py-2.5 px-3 align-top whitespace-nowrap text-[#4E220F] font-sans font-bold text-xs">
                              {r.provider_name || r.provider}
                            </td>

                            {/* 3. STATUS (Tick mark / Cross) */}
                            <td className="py-2.5 px-3 align-top whitespace-nowrap">
                              {isHealthy ? (
                                <span className="inline-flex items-center gap-1 font-bold text-[10px] px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">
                                  <CheckCircle2 className="size-3 text-emerald-600" />
                                  <span>PASSED</span>
                                </span>
                              ) : isUnconfigured ? (
                                <span className="inline-flex items-center gap-1 font-bold text-[10px] px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-300 shadow-2xs">
                                  <AlertCircle className="size-3 text-amber-600" />
                                  <span>UNCONFIG</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 font-bold text-[10px] px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 border border-rose-300 shadow-2xs">
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
                                      className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap"
                                    >
                                      <Check className="size-2 text-emerald-600" />
                                      {t}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-[#7C5339]/50 text-[10px] italic">—</span>
                              )}
                            </td>

                            {/* 5. TESTS FAILED & DIAGNOSTICS */}
                            <td className="py-2.5 px-3 align-top">
                              {isHealthy ? (
                                <div className="space-y-0.5">
                                  <span className="text-emerald-700 font-bold text-[10px] flex items-center gap-1">
                                    <Check className="size-2.5" /> All checks operational
                                  </span>
                                  {r.response_snippet && (
                                    <span className="text-[#7C5339] text-[10px] block truncate max-w-[280px]" title={r.response_snippet}>
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
                                          className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 whitespace-nowrap"
                                        >
                                          ✕ {f}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                  {r.error && (
                                    <div
                                      className="font-mono text-[10px] text-rose-800 bg-rose-50/80 border border-rose-200/80 px-2 py-1 rounded-md max-w-md break-words"
                                      title={r.error}
                                    >
                                      {r.error}
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>

                            {/* 6. LATENCY */}
                            <td className="py-2.5 px-3 align-top text-right whitespace-nowrap">
                              {r.latency_ms !== null && r.latency_ms !== undefined && r.latency_ms > 0 ? (
                                <span className={`font-bold text-[10px] px-2 py-0.5 rounded-md border ${
                                  r.latency_ms < 150
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                    : r.latency_ms < 500
                                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                                      : 'bg-rose-50 text-rose-800 border-rose-200'
                                }`}>
                                  {r.latency_ms}ms
                                </span>
                              ) : (
                                <span className="text-[#7C5339]/50">—</span>
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
        <div className="rounded-2xl border border-[#B0BA99] bg-[#FFFFFF] p-4 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-[#B0BA99]/60 pb-2.5">
            <h5 className="font-bold text-xs text-[#4E220F] flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-[#9D6638]" />
              Executive Summary & Key Takeaways
            </h5>
            <span className="font-mono text-[10px] font-bold text-[#9D6638] bg-[#EDE5CD] px-2 py-0.5 rounded-lg">
              {data.bullet_count || data.takeaways?.length || 0} Key Points
            </span>
          </div>

          <div className="space-y-2">
            {(data.takeaways || []).map((point: string, idx: number) => (
              <div key={idx} className="flex items-start gap-2.5 rounded-xl bg-[#F7F1DE]/60 p-3 border border-[#B0BA99]/40">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#9D6638] text-[10px] font-bold text-[#FDFBF7]">
                  {idx + 1}
                </span>
                <p className="text-xs leading-relaxed text-[#4E220F] font-medium">{point}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* C. CODEC TRANSFORMER RESULTS */}
      {toolId === 'codec_tool' && data && (
        <div className="rounded-2xl border border-[#B0BA99] bg-[#FFFFFF] p-4 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-[#B0BA99]/60 pb-2.5">
            <h5 className="font-bold text-xs text-[#4E220F] flex items-center gap-1.5">
              <Layers className="size-3.5 text-[#9D6638]" />
              Codec Transformation Result
            </h5>
            <span className="font-mono text-[10px] font-bold text-[#4E220F] bg-[#EDE5CD] px-2 py-0.5 rounded-lg uppercase">
              {data.codec} • {data.length} chars
            </span>
          </div>

          <div className="relative">
            <textarea
              readOnly
              value={data.output || ''}
              rows={6}
              className="w-full rounded-xl border border-[#B0BA99] bg-[#F7F1DE]/80 p-3 font-mono text-xs text-[#4E220F] shadow-inner focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* D. SCRIPT RUNNER LIVE TERMINAL LOGS */}
      {toolId === 'script_runner' && (
        <div className="rounded-2xl border border-[#B0BA99] bg-[#2E2824] p-4 text-[#FDFBF7] shadow-md space-y-2">
          <div className="flex items-center justify-between border-b border-[#EDE5CD]/20 pb-2">
            <div className="flex items-center gap-2">
              <Terminal className="size-3.5 text-[#EDE5CD]" />
              <span className="font-mono text-xs font-bold text-[#FDFBF7]">Process Output Console</span>
            </div>
            {data?.exit_code !== undefined && (
              <span
                className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded-md ${
                  data.exit_code === 0 ? 'bg-[#9D6638] text-[#FDFBF7]' : 'bg-[#7C5339] text-[#FDFBF7]'
                }`}
              >
                Exit Code: {data.exit_code}
              </span>
            )}
          </div>

          <pre className="max-h-64 overflow-y-auto font-mono text-[11px] leading-relaxed text-[#EDE5CD] whitespace-pre-wrap">
            {outputText || data?.stdout || 'No process output returned.'}
          </pre>
        </div>
      )}

      {/* E. MEDIAINFO INSPECTOR */}
      {toolId === 'mediainfo' && data && (
        <div className="rounded-2xl border border-[#B0BA99] bg-[#FFFFFF] p-4 shadow-2xs space-y-3">
          <h5 className="font-bold text-xs text-[#4E220F] flex items-center gap-1.5">
            <Volume2 className="size-3.5 text-[#9D6638]" />
            Media Stream Properties
          </h5>

          {data.format && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="rounded-xl bg-[#F7F1DE]/70 p-2.5 border border-[#B0BA99]/60 text-center">
                <span className="text-[10px] text-[#7C5339] font-bold block">Format</span>
                <span className="font-mono text-xs font-bold text-[#4E220F]">{data.format.format_name || 'N/A'}</span>
              </div>
              <div className="rounded-xl bg-[#F7F1DE]/70 p-2.5 border border-[#B0BA99]/60 text-center">
                <span className="text-[10px] text-[#7C5339] font-bold block">Duration</span>
                <span className="font-mono text-xs font-bold text-[#4E220F]">
                  {data.format.duration ? `${parseFloat(data.format.duration).toFixed(1)}s` : 'N/A'}
                </span>
              </div>
              <div className="rounded-xl bg-[#F7F1DE]/70 p-2.5 border border-[#B0BA99]/60 text-center">
                <span className="text-[10px] text-[#7C5339] font-bold block">Bitrate</span>
                <span className="font-mono text-xs font-bold text-[#4E220F]">
                  {data.format.bit_rate ? `${Math.round(data.format.bit_rate / 1000)} kb/s` : 'N/A'}
                </span>
              </div>
              <div className="rounded-xl bg-[#F7F1DE]/70 p-2.5 border border-[#B0BA99]/60 text-center">
                <span className="text-[10px] text-[#7C5339] font-bold block">Streams</span>
                <span className="font-mono text-xs font-bold text-[#4E220F]">{data.streams?.length || 1}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* F. INLINE AUDIO / MEDIA PLAYER */}
      {primaryArtifact && isAudioFile(primaryArtifact.name) && (
        <div className="rounded-2xl border border-[#B0BA99] bg-[#EDE5CD]/50 p-4 shadow-2xs space-y-2.5">
          <div className="flex items-center justify-between">
            <h5 className="font-bold text-xs text-[#4E220F] flex items-center gap-1.5">
              <Volume2 className="size-3.5 text-[#9D6638]" />
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
                className="inline-flex items-center gap-1 text-[11px] font-bold text-[#9D6638] hover:underline"
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
        <div className="rounded-2xl border border-[#B0BA99] bg-[#FFFFFF] p-4 shadow-2xs space-y-2.5 text-center">
          <h5 className="font-bold text-xs text-[#4E220F] flex items-center gap-1.5 justify-center mb-2">
            Image Output Preview
          </h5>
          <img
            src={downloadUrl}
            alt={primaryArtifact.name}
            className="max-h-72 mx-auto rounded-xl object-contain border border-[#B0BA99]/60 shadow-xs"
          />
        </div>
      )}

      {/* H. RAW TEXT / DOCUMENT FALLBACK (When tool produces text and no custom viewer matches) */}
      {!['ai_model_health_check', 'summarizer', 'codec_tool', 'script_runner'].includes(toolId) && outputText && (
        <div className="rounded-2xl border border-[#B0BA99] bg-[#FFFFFF] p-4 shadow-2xs space-y-2">
          <h5 className="font-bold text-xs text-[#4E220F]">Generated Content</h5>
          <pre className="max-h-64 overflow-y-auto font-mono text-[11px] leading-relaxed text-[#4E220F] bg-[#F7F1DE]/80 p-3 rounded-xl border border-[#B0BA99]/60 whitespace-pre-wrap">
            {outputText}
          </pre>
        </div>
      )}

      {/* 3. ARTIFACTS ACTION BAR */}
      {artifacts && artifacts.length > 0 && toolId !== 'ai_model_health_check' && (
        <div className="rounded-2xl border border-[#B0BA99]/70 bg-[#FFFFFF] p-3.5 shadow-2xs space-y-2">
          <h5 className="font-bold text-xs text-[#4E220F] flex items-center gap-1.5">
            <FileText className="size-3.5 text-[#9D6638]" />
            Output Artifacts
          </h5>

          <div className="space-y-1.5">
            {artifacts.map((art, idx) => {
              const url = resolveUrl(`/api/artifacts/content?path=${encodeURIComponent(art.path)}`)
              return (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded-xl bg-[#F7F1DE]/60 px-3 py-2 border border-[#B0BA99]/40"
                >
                  <span className="font-mono text-xs font-medium text-[#4E220F] truncate">{art.name}</span>
                  <a
                    href={url}
                    download={art.name}
                    className="inline-flex items-center gap-1 rounded-lg bg-[#9D6638] px-2.5 py-1 text-[10px] font-bold text-[#FDFBF7] hover:bg-[#86542C] transition-all"
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
