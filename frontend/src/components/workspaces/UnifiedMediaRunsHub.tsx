import { useEffect, useState, useMemo } from 'react'
import {
  Video,
  Captions,
  Music,
  FileText,
  Package,
  Eye,
  Download,
  Copy,
  Check,
  Play,
  RefreshCw,
  FileCode,
  Trash2,
  Search,
  Sparkles,
  FileTerminal,
  Clock,
  Film,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Calendar,
  X,
} from 'lucide-react'
import {
  api,
  type WorkspaceMediaResponse,
  type PipelineRunGroup,
  type Run,
  type MediaPackage,
} from '../../lib/api'

import { formatSize, describeSubtitleTrack, subtitleTrackLabel, runDisplayName } from '../../lib/mediaLabels'

function formatDate(timestamp: number): string {
  if (!timestamp) return ''
  return new Date(timestamp * 1000).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function relativeTime(timestamp: number): string {
  if (!timestamp) return ''
  const diff = Date.now() / 1000 - timestamp
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`
  if (diff < 172800) return 'yesterday'
  return `${Math.floor(diff / 86400)} days ago`
}

function dateGroupLabel(timestamp: number): string {
  const d = new Date(timestamp * 1000)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  if (isToday) return 'Today'
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })
}

export default function UnifiedMediaRunsHub({
  workspaceId,
  pipelineRuns,
  onRefresh,
  highlightRunId,
  onPreviewArtifact,
  onInspectRun,
  onRemoveRun,
  onRemoveMediaItem,
}: {
  workspaceId: string
  pipelineRuns: PipelineRunGroup[]
  runs: Run[]
  onRefresh: () => void
  highlightRunId?: string | null
  onPreviewArtifact: (name: string, size: number, previewUrl: string, downloadUrl: string) => void
  onInspectRun: (runId: string) => void
  onRemoveRun: (runId: string) => void
  onRemoveMediaItem: (filename: string) => void
}) {
  const [mediaData, setMediaData] = useState<WorkspaceMediaResponse | null>(null)
  const [loadingMedia, setLoadingMedia] = useState(false)
  const [fileSearch, setFileSearch] = useState('')
  const [fileCategoryFilter, setFileCategoryFilter] = useState<'all' | 'video' | 'subtitle' | 'audio' | 'document'>('all')
  const [copiedPath, setCopiedPath] = useState<string | null>(null)
  const [activeMediaPackage, setActiveMediaPackage] = useState<MediaPackage | null>(null)
  const [activeTab, setActiveTab] = useState<'latest' | 'timeline' | 'files'>('latest')
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set())
  const [timelineStatusFilter, setTimelineStatusFilter] = useState<'all' | 'completed' | 'failed'>('all')
  const [failureBannerDismissed, setFailureBannerDismissed] = useState(false)
  const [packageOverride, setPackageOverride] = useState<MediaPackage | null>(null)
  const [filesPage, setFilesPage] = useState(1)
  const filesPerPage = 12

  const loadMedia = () => {
    setLoadingMedia(true)
    setFailureBannerDismissed(false)
    api.listWorkspaceMedia(workspaceId)
      .then((res) => {
        setMediaData(res)
        if (res.packages && res.packages.length > 0) {
          if (highlightRunId) {
            const runBundle = pipelineRuns.find((r) => r.pipeline_run_id === highlightRunId)?.bundle_name
            const byBundle = runBundle ? res.packages.find((p) => p.title === runBundle) : null
            const matched = res.packages.find((p) => p.title && highlightRunId && p.title.toLowerCase().includes(highlightRunId.slice(0, 8).toLowerCase()))
            setActiveMediaPackage(byBundle || matched || res.packages[0])
            setActiveTab('latest')
          } else if (!activeMediaPackage) {
            setActiveMediaPackage(res.packages[0])
          } else {
            const stillExists = res.packages.find((p) => p.title === activeMediaPackage.title)
            if (!stillExists) setActiveMediaPackage(res.packages[0])
          }
        } else {
          setActiveMediaPackage(null)
        }
        setLoadingMedia(false)
      })
      .catch(() => setLoadingMedia(false))
  }

  useEffect(() => {
    loadMedia()
  }, [workspaceId])

  useEffect(() => {
    loadMedia()
    setFailureBannerDismissed(false)
    setPackageOverride(null)
  }, [pipelineRuns.length, highlightRunId])

  const copyPath = (path: string) => {
    navigator.clipboard.writeText(path)
    setCopiedPath(path)
    setTimeout(() => setCopiedPath(null), 2000)
  }

  const toggleRun = (id: string) => {
    setExpandedRuns((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const packages = mediaData?.packages || []
  const allFiles = mediaData?.all_files || []

  /** Jump from a timeline run to its package in the Latest tab. */
  const findPackageForBundle = (bundleName?: string) => {
    if (!bundleName) return undefined
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
    const want = norm(bundleName)
    if (!want) return undefined
    return packages.find((p) => {
      const got = norm(p.title)
      return got === want || got.includes(want) || want.includes(got)
    })
  }
  const viewPackageForRun = (bundleName?: string) => {
    const pkg = findPackageForBundle(bundleName)
    if (pkg) {
      setActiveMediaPackage(pkg)
      setPackageOverride(pkg)
    }
    setActiveTab('latest')
  }

  const showFailedTimeline = () => {
    setTimelineStatusFilter('failed')
    setActiveTab('timeline')
  }

  const latestRun = pipelineRuns[0] || null
  const latestIsFailed = latestRun?.status === 'failed'
  const latestFailedStep = latestRun?.steps.find((s) => s.status === 'failed')
  const latestSuccessPackage = useMemo(() => {
    if (!packages.length) return null
    if (!latestIsFailed) return activeMediaPackage || packages[0]
    // find most recent successful run's bundle
    const successRun = pipelineRuns.find((r) => r.status === 'completed' && r.bundle_name)
    if (successRun) {
      const pkg = packages.find((p) => p.title === successRun.bundle_name)
      if (pkg) return pkg
    }
    // fallback to first successful package (has video)
    return packages.find((p) => p.video) || packages[0]
  }, [packages, activeMediaPackage, pipelineRuns, latestIsFailed])

  // Failed-latest view honors an explicit timeline Package jump; otherwise latest success.
  const failedViewPackage = packageOverride || latestSuccessPackage

  const filteredFiles = allFiles.filter((f) => {
    if (f.name.includes('_scratch') || f.name.startsWith('scratch_')) return false
    if (fileCategoryFilter !== 'all' && f.category !== fileCategoryFilter) return false
    if (!fileSearch.trim()) return true
    const q = fileSearch.toLowerCase()
    return f.name.toLowerCase().includes(q) || (f.category && f.category.toLowerCase().includes(q))
  })

  const pagedFiles = filteredFiles.slice(0, filesPage * filesPerPage)
  const hasMoreFiles = filteredFiles.length > pagedFiles.length

  const groupedRuns = useMemo(() => {
    const groups: Record<string, PipelineRunGroup[]> = {}
    for (const r of pipelineRuns) {
      const label = dateGroupLabel(r.timestamp)
      if (!groups[label]) groups[label] = []
      groups[label].push(r)
    }
    return groups
  }, [pipelineRuns])

  const filteredGroupedRuns = useMemo(() => {
    if (timelineStatusFilter === 'all') return groupedRuns
    const out: Record<string, PipelineRunGroup[]> = {}
    for (const [label, runs] of Object.entries(groupedRuns)) {
      const kept = runs.filter((r) =>
        timelineStatusFilter === 'failed' ? r.status === 'failed' : r.status === 'completed',
      )
      if (kept.length) out[label] = kept
    }
    return out
  }, [groupedRuns, timelineStatusFilter])

  const successCount = pipelineRuns.filter((r) => r.status === 'completed').length
  const failedCount = pipelineRuns.filter((r) => r.status === 'failed').length

  return (
    <div className="space-y-6 text-[#4E220F]">
      {/* Top summary + sub-tabs */}
      <div className="rounded-3xl border border-[#B0BA99] bg-[#FFFFFF] p-4 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-8 items-center justify-center rounded-xl bg-[#9D6638] text-[#FDFBF7]">
              <Film className="size-4" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-[#4E220F]">Outputs • Organized by Recency</h2>
              <p className="text-[11px] text-[#7C5339]">
                {pipelineRuns.length} runs • {allFiles.length} files • {successCount} successful •{' '}
                {failedCount > 0 ? (
                  <button onClick={showFailedTimeline} className="font-bold text-[#A83232] underline underline-offset-2 hover:text-[#862727]" title="Show failed runs in timeline">
                    {failedCount} failed
                  </button>
                ) : (
                  <span>0 failed</span>
                )}{' '}
                • {packages.length} packages
                {latestRun && <span className="ml-2 font-mono">Latest: {relativeTime(latestRun.timestamp)} • {runDisplayName(latestRun)}</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-xl border border-[#B0BA99] bg-[#EDE5CD]/60 p-1 gap-1">
              <button onClick={() => setActiveTab('latest')} className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'latest' ? 'bg-[#9D6638] text-[#FDFBF7] shadow-xs' : 'text-[#4E220F] hover:bg-[#EDE5CD]'}`}>
                Latest Output
              </button>
              <button onClick={() => setActiveTab('timeline')} className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'timeline' ? 'bg-[#9D6638] text-[#FDFBF7] shadow-xs' : 'text-[#4E220F] hover:bg-[#EDE5CD]'}`}>
                Timeline <span className="font-mono text-[10px] opacity-70">({pipelineRuns.length})</span>
              </button>
              <button onClick={() => setActiveTab('files')} className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'files' ? 'bg-[#9D6638] text-[#FDFBF7] shadow-xs' : 'text-[#4E220F] hover:bg-[#EDE5CD]'}`}>
                Files <span className="font-mono text-[10px] opacity-70">({allFiles.length})</span>
              </button>
            </div>
            <button
              onClick={() => {
                loadMedia()
                onRefresh()
              }}
              disabled={loadingMedia}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#B0BA99] bg-[#EDE5CD] px-3.5 py-1.5 text-xs font-semibold text-[#4E220F] hover:bg-[#B0BA99]/40 disabled:opacity-50"
            >
              <RefreshCw className={`size-3.5 ${loadingMedia ? 'animate-spin text-[#9D6638]' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* LATEST TAB */}
      {activeTab === 'latest' && (
        <section className="rounded-3xl border border-[#B0BA99] bg-[#FFFFFF] p-6 shadow-sm space-y-5">
          {!latestRun ? (
            <div className="rounded-2xl border border-dashed border-[#B0BA99] bg-[#EDE5CD]/20 p-10 text-center space-y-2">
              <Film className="mx-auto size-8 text-[#9D6638] opacity-50" />
              <p className="text-xs font-bold text-[#4E220F]">No outputs yet</p>
              <p className="text-[11px] text-[#7C5339] max-w-md mx-auto">Run a pipeline on the Canvas to generate your first organized output package.</p>
            </div>
          ) : latestIsFailed ? (
            <div className="space-y-4">
              {!failureBannerDismissed && (
              <div className="rounded-2xl border-2 border-[#A83232]/40 bg-[#FDF2F2] p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="flex size-7 items-center justify-center rounded-lg bg-[#A83232] text-[#FDFBF7]"><AlertTriangle className="size-4" /></span>
                  <div>
                    <h3 className="text-sm font-bold text-[#A83232]">Latest run failed — no new outputs produced</h3>
                    <p className="text-xs text-[#7C5339] font-mono">{runDisplayName(latestRun)} • {latestRun.pipeline_run_id} • {formatDate(latestRun.timestamp)} • {relativeTime(latestRun.timestamp)}</p>
                  </div>
                  <span className="ml-auto text-[10px] font-bold px-2 py-1 rounded-full bg-[#A83232] text-[#FDFBF7]">FAILED</span>
                  <button onClick={() => setFailureBannerDismissed(true)} className="p-1 rounded-lg text-[#7C5339] hover:bg-[#EDE5CD] hover:text-[#4E220F]" title="Dismiss — previous outputs below">
                    <X className="size-4" />
                  </button>
                </div>
                {latestFailedStep && (
                  <div className="rounded-xl bg-[#FFFFFF] border border-[#A83232]/20 p-3 text-xs">
                    <p className="font-bold text-[#4E220F]">Halted on “{latestFailedStep.tool_id}”: </p>
                    <p className="font-mono text-[11px] text-[#A83232] break-words mt-1">{latestFailedStep.error || 'Unknown error'}</p>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => latestRun.steps[0]?.id && onInspectRun(latestRun.steps[0].id)} className="inline-flex items-center gap-1.5 rounded-xl border border-[#B0BA99] bg-[#FFFFFF] px-3.5 py-1.5 text-xs font-bold text-[#4E220F] hover:bg-[#EDE5CD]">
                    <FileTerminal className="size-3.5 text-[#9D6638]" /> View Logs
                  </button>
                  <span className="text-[11px] text-[#7C5339] self-center">Fix API keys / provider, then re-run. Previous successful outputs shown below.</span>
                </div>
              </div>
              )}
              {failedViewPackage && (
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#7C5339] mb-2 flex items-center gap-2"><CheckCircle2 className="size-3.5 text-[#2E6B47]" /> Previous successful outputs (not from failed run)</p>
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 rounded-2xl border border-[#B0BA99]/60 bg-[#F7F1DE]/30 p-5">
                    <div className="lg:col-span-7 space-y-2">
                      <div className="rounded-xl overflow-hidden bg-black aspect-video border border-[#B0BA99] shadow-inner">
                        {failedViewPackage.video ? (
                          <video controls preload="metadata" crossOrigin="anonymous" className="w-full h-full object-contain" src={failedViewPackage.video.preview_url}>
                            {failedViewPackage.subtitles.map((sub, idx) => (
                              <track key={sub.name} kind="subtitles" src={sub.preview_url} label={sub.name} default={idx === 0} />
                            ))}
                          </video>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[#FDFBF7] text-xs">No video</div>
                        )}
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-[#7C5339] font-mono px-1">
                        <span className="truncate">{failedViewPackage.video?.name}</span>
                        <span>{failedViewPackage.video ? formatSize(failedViewPackage.video.size) : ''} • {failedViewPackage.video ? relativeTime(failedViewPackage.video.mtime) : ''}</span>
                      </div>
                    </div>
                    <div className="lg:col-span-5 space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[9px] font-extrabold uppercase px-2 py-0.5 rounded bg-[#B0BA99] text-[#4E220F]">Previous Package</span>
                        <span className="font-mono text-[10px] text-[#7C5339]">{failedViewPackage.video ? formatDate(failedViewPackage.video.mtime) : ''}</span>
                      </div>
                      <h3 className="text-sm font-bold text-[#4E220F] leading-tight truncate">{failedViewPackage.title}</h3>
                      <div className="space-y-1.5">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[#7C5339]">Subtitles</span>
                        <div className="space-y-1.5">
                          {failedViewPackage.subtitles.map((sub) => (
                            <div key={sub.name} className="flex items-center justify-between p-2 rounded-xl bg-[#FFFFFF] border border-[#B0BA99]/70 text-xs">
                              <span className="font-mono truncate pr-2" title={sub.name}>{subtitleTrackLabel(sub.name, sub.size)}</span>
                              <a href={sub.download_url} download={sub.name} className="p-1 rounded-lg bg-[#9D6638] text-[#FDFBF7]"><Download className="size-3" /></a>
                            </div>
                          ))}
                          {failedViewPackage.subtitles.length === 0 && <p className="text-xs text-[#7C5339] italic">No subtitles in this package</p>}
                        </div>
                      </div>
                      {(() => {
                        const successRun = pipelineRuns.find((r) => r.bundle_name === failedViewPackage.title) || pipelineRuns.find((r) => r.status === 'completed')
                        return successRun ? (
                          <a href={api.downloadPipelineRunUrl(workspaceId, successRun.pipeline_run_id)} className="inline-flex w-full justify-center items-center gap-1.5 rounded-xl border border-[#9D6638] bg-[#EDE5CD] px-3.5 py-2 text-xs font-bold text-[#4E220F] hover:bg-[#B0BA99]/40 mt-2"><Package className="size-3.5 text-[#9D6638]" /> Download Full Output (.zip)</a>
                        ) : null
                      })()}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[9px] font-extrabold uppercase px-2 py-0.5 rounded bg-[#2E6B47] text-[#FDFBF7]">● Latest • {relativeTime(latestRun.timestamp)}</span>
                <span className="font-mono text-[10px] text-[#7C5339]">{formatDate(latestRun.timestamp)} • {latestRun.pipeline_run_id}</span>
                <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#DFF0D8] text-[#2E6B47] border">COMPLETED</span>
              </div>
              {activeMediaPackage?.video ? (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 rounded-2xl border-2 border-[#9D6638]/40 bg-[#F7F1DE]/50 p-5 shadow-xs">
                  <div className="lg:col-span-7 flex flex-col justify-center space-y-2">
                    <div className="rounded-xl overflow-hidden bg-black aspect-video border border-[#B0BA99] shadow-inner">
                      <video controls preload="metadata" crossOrigin="anonymous" className="w-full h-full object-contain" src={activeMediaPackage.video.preview_url}>
                        {activeMediaPackage.subtitles.map((sub, idx) => (
                          <track key={sub.name} kind="subtitles" src={sub.preview_url} label={sub.name.includes('.en.') ? 'English' : sub.name} default={idx === 0} />
                        ))}
                      </video>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-[#7C5339] px-1 font-mono">
                      <span className="truncate">{activeMediaPackage.video.name}</span>
                      <span className="shrink-0">{formatSize(activeMediaPackage.video.size)} • {relativeTime(activeMediaPackage.video.mtime)}</span>
                    </div>
                  </div>
                  <div className="lg:col-span-5 flex flex-col justify-between space-y-4">
                    <div className="space-y-3">
                      <h3 className="text-sm font-bold text-[#4E220F] leading-tight">{activeMediaPackage.title}</h3>
                      <div className="space-y-1.5">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[#7C5339]">Subtitle Tracks</span>
                        {activeMediaPackage.subtitles.length === 0 ? (
                          <p className="text-xs text-[#7C5339] italic">No subtitles generated.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {activeMediaPackage.subtitles.map((sub) => {
                              const { language } = describeSubtitleTrack(sub.name)
                              return (
                                <div key={sub.name} className="flex items-center justify-between p-2 rounded-xl bg-[#FFFFFF] border border-[#B0BA99]/70 text-xs">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <Captions className={`size-3.5 shrink-0 ${language ? 'text-[#9D6638]' : 'text-[#7C5339]'}`} />
                                    <span className="font-mono truncate" title={sub.name}>{language ? `🌐 ${subtitleTrackLabel(sub.name, sub.size)}` : subtitleTrackLabel(sub.name, sub.size)}</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <button onClick={() => onPreviewArtifact(sub.name, sub.size, sub.preview_url, sub.download_url)} className="p-1 rounded-lg border border-[#B0BA99] hover:bg-[#EDE5CD]"><Eye className="size-3" /></button>
                                    <a href={sub.download_url} download={sub.name} className="p-1 rounded-lg bg-[#9D6638] text-[#FDFBF7]"><Download className="size-3" /></a>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                      {(activeMediaPackage.audio.length > 0 || activeMediaPackage.transcripts.length > 0) && (
                        <div className="space-y-1.5 pt-1">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-[#7C5339]">Audio & Transcripts</span>
                          <div className="flex flex-wrap gap-1.5">
                            {activeMediaPackage.audio.map((a) => (
                              <a key={a.name} href={a.download_url} download={a.name} className="inline-flex items-center gap-1 font-mono text-[10px] font-bold px-2 py-1 rounded-lg bg-[#FFFFFF] border border-[#B0BA99]">{a.name.split('.').pop()?.toUpperCase()} ({formatSize(a.size)})</a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-[#B0BA99]/50">
                      <a href={activeMediaPackage.video.download_url} className="inline-flex items-center gap-1.5 rounded-xl bg-[#9D6638] px-3.5 py-2 text-xs font-bold text-[#FDFBF7] hover:bg-[#86542C]"><Download className="size-3.5" /> Download Video</a>
                      {latestRun && (
                        <a href={api.downloadPipelineRunUrl(workspaceId, latestRun.pipeline_run_id)} className="inline-flex items-center gap-1.5 rounded-xl border border-[#9D6638] bg-[#EDE5CD] px-3.5 py-2 text-xs font-bold text-[#4E220F] hover:bg-[#B0BA99]/40 shadow-2xs"><Package className="size-3.5 text-[#9D6638]" /> Download Full Output (ZIP)</a>
                      )}
                      <span className="text-[10px] text-[#7C5339] self-center ml-1">User-decided: only when you click, zipped via browser</span>
                      <button onClick={() => onRemoveMediaItem(activeMediaPackage.video!.name)} className="ml-auto inline-flex items-center gap-1 rounded-xl border border-[#A83232]/40 bg-[#FFFFFF] px-3 py-2 text-xs font-bold text-[#A83232] hover:bg-[#A83232] hover:text-[#FFFFFF]"><Trash2 className="size-3.5" /> Delete</button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-[#B0BA99] bg-[#EDE5CD]/20 p-8 text-center">
                  <Package className="mx-auto size-7 text-[#9D6638] opacity-50" />
                  <p className="text-xs font-bold">Latest run has no video package — check Timeline for per-run files</p>
                </div>
              )}
              {packages.length > 1 && (
                <div className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#7C5339]">Other recent packages</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {packages.slice(0, 6).map((pkg) => {
                      const isSelected = activeMediaPackage?.title === pkg.title
                      return (
                        <div key={pkg.title} onClick={() => setActiveMediaPackage(pkg)} className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${isSelected ? 'border-[#9D6638] bg-[#EDE5CD]/80 ring-2 ring-[#9D6638]/30' : 'border-[#B0BA99] bg-[#FFFFFF] hover:bg-[#F7F1DE]/70'}`}>
                          <div className="flex items-center gap-2 mb-1">
                            <Video className="size-4 text-[#9D6638]" />
                            <h4 className="text-xs font-bold truncate flex-1">{pkg.title}</h4>
                          </div>
                          <div className="flex items-center justify-between text-[10px] font-mono text-[#7C5339]">
                            <span>{pkg.subtitles.length} subs</span>
                            <span>{pkg.video ? relativeTime(pkg.video.mtime) : ''}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* TIMELINE TAB */}
      {activeTab === 'timeline' && (
        <section className="rounded-3xl border border-[#B0BA99] bg-[#FFFFFF] p-6 shadow-sm space-y-5">
          {pipelineRuns.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#B0BA99] bg-[#EDE5CD]/20 p-8 text-center space-y-1">
              <Sparkles className="mx-auto size-7 text-[#9D6638] opacity-50" />
              <p className="text-xs font-bold">No runs yet</p>
              <p className="text-[11px] text-[#7C5339]">Run a pipeline to see a dated timeline.</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="sticky top-0 z-10 -mx-1 px-1 py-1 bg-[#FFFFFF]/95 backdrop-blur flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { key: 'all', label: 'All', count: pipelineRuns.length },
                    { key: 'completed', label: 'Completed', count: successCount },
                    { key: 'failed', label: 'Failed', count: failedCount },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setTimelineStatusFilter(f.key)}
                    className={`inline-flex items-center gap-1 rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                      timelineStatusFilter === f.key
                        ? f.key === 'failed'
                          ? 'bg-[#A83232] text-[#FDFBF7] shadow-xs'
                          : 'bg-[#9D6638] text-[#FDFBF7] shadow-xs'
                        : 'text-[#4E220F] border border-[#B0BA99] hover:bg-[#EDE5CD]'
                    }`}
                  >
                    {f.label} <span className="font-mono text-[10px] opacity-80">({f.count})</span>
                  </button>
                ))}
              </div>
              {Object.keys(filteredGroupedRuns).length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#B0BA99] bg-[#EDE5CD]/20 p-8 text-center">
                  <p className="text-xs font-bold">No {timelineStatusFilter} runs</p>
                </div>
              ) : null}
              {Object.entries(filteredGroupedRuns).map(([dateLabel, runs]) => (
                <div key={dateLabel} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Calendar className="size-3.5 text-[#9D6638]" />
                    <span className="text-xs font-bold uppercase tracking-wider text-[#7C5339]">{dateLabel}</span>
                    <span className="h-px flex-1 bg-[#B0BA99]/40" />
                    <span className="font-mono text-[10px] text-[#7C5339]">{runs.length} run{runs.length > 1 ? 's' : ''}</span>
                  </div>
                  <div className="space-y-3">
                    {runs.map((group) => {
                      const isHighlighted = highlightRunId && group.pipeline_run_id === highlightRunId
                      const isExpanded = expandedRuns.has(group.pipeline_run_id)
                      const isFailed = group.status === 'failed'
                      const failedStep = group.steps.find((s) => s.status === 'failed')
                      return (
                        <div key={group.pipeline_run_id} className={`rounded-2xl border p-4 space-y-3 transition-all ${isHighlighted ? 'border-[#9D6638] bg-[#FDFBF7] ring-2 ring-[#9D6638]/30' : isFailed ? 'border-[#A83232]/30 bg-[#FDF2F2]' : 'border-[#B0BA99] bg-[#F7F1DE]/30 hover:border-[#9D6638]/40'}`}>
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              {isHighlighted && <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-[#9D6638] text-[#FDFBF7] animate-pulse">● NEW</span>}
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${isFailed ? 'bg-[#A83232] text-[#FDFBF7]' : 'bg-[#2E6B47] text-[#FDFBF7]'}`}>{isFailed ? 'FAILED' : 'COMPLETED'}</span>
                              <span className="text-xs font-bold truncate max-w-[240px]" title={group.pipeline_run_id}>{runDisplayName(group)}</span>
                              <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-[#EDE5CD] border border-[#B0BA99] font-bold">{group.pipeline_run_id.slice(0, 8)}</span>
                              <span className="font-mono text-[10px] text-[#7C5339] flex items-center gap-1"><Clock className="size-3" />{new Date(group.timestamp * 1000).toLocaleTimeString()} • {relativeTime(group.timestamp)}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button onClick={() => toggleRun(group.pipeline_run_id)} className="inline-flex items-center gap-1 rounded-xl border border-[#B0BA99] bg-[#FFFFFF] px-2.5 py-1 text-xs font-bold hover:bg-[#EDE5CD]">
                                {isExpanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />} {isExpanded ? 'Hide' : 'Files'}
                              </button>
                              {group.bundle_name && findPackageForBundle(group.bundle_name) && (
                                <button onClick={() => viewPackageForRun(group.bundle_name)} className="inline-flex items-center gap-1 rounded-xl border border-[#B0BA99] bg-[#FFFFFF] px-2.5 py-1 text-xs font-bold hover:bg-[#EDE5CD]" title={`Open package “${group.bundle_name}” in Latest Output`}>
                                  <Package className="size-3 text-[#9D6638]" /> Package
                                </button>
                              )}
                              {group.steps[0]?.id && (
                                <button onClick={() => onInspectRun(group.steps[0].id)} className="p-1.5 rounded-lg border border-[#B0BA99] bg-[#FFFFFF] hover:bg-[#EDE5CD]" title="Logs"><FileTerminal className="size-3.5" /></button>
                              )}
                              {group.steps[0]?.id && (
                                <button onClick={() => onRemoveRun(group.steps[0].id)} className="p-1.5 rounded-lg border border-[#A83232]/30 bg-[#FFFFFF] text-[#A83232] hover:bg-[#A83232] hover:text-[#FFFFFF]"><Trash2 className="size-3.5" /></button>
                              )}
                            </div>
                          </div>
                          {isFailed && failedStep?.error && (
                            <div className="rounded-xl bg-[#FFFFFF] border border-[#A83232]/20 p-2.5 text-[11px] font-mono text-[#A83232] break-words">
                              Halted on {failedStep.tool_id}: {failedStep.error.slice(0, 220)}
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-1.5">
                            {[...group.steps].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).map((st, idx) => (
                              <span key={st.id} className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-mono font-bold border ${st.status === 'completed' ? 'bg-[#FFFFFF] border-[#2E6B47]/30 text-[#2E6B47]' : st.status === 'failed' ? 'bg-[#A83232] text-[#FDFBF7] border-[#A83232]' : 'bg-[#FFFFFF] border-[#B0BA99]'}`}>
                                {idx + 1}. {st.tool_id} <span className={`size-1.5 rounded-full ${st.status === 'completed' ? 'bg-[#2E6B47]' : st.status === 'failed' ? 'bg-[#FDFBF7]' : 'bg-amber-400'}`} />
                              </span>
                            ))}
                            <a href={api.downloadPipelineRunUrl(workspaceId, group.pipeline_run_id)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#9D6638] bg-[#EDE5CD] text-[#4E220F] text-xs font-bold hover:bg-[#B0BA99]/40 ml-auto"><Package className="size-3 text-[#9D6638]" /> Download ZIP</a>
                            {group.media.video && !isFailed && (
                              <button onClick={() => onPreviewArtifact(group.media.video!.name, group.media.video!.size, group.media.video!.preview_url, group.media.video!.download_url)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#9D6638] text-[#FDFBF7] text-xs font-bold"><Play className="size-3 fill-current" /> Preview</button>
                            )}
                          </div>
                          {isExpanded && (
                            <div className="pt-2 border-t border-[#B0BA99]/30 space-y-2">
                              <p className="text-[11px] font-bold uppercase tracking-wider text-[#7C5339]">Files in this run ({group.media.all_artifacts.length})</p>
                              {group.media.all_artifacts.length === 0 ? (
                                <p className="text-xs text-[#7C5339] italic">No files saved for this run.</p>
                              ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {group.media.all_artifacts.map((f) => (
                                    <div key={f.name} className="flex items-center justify-between p-2 rounded-xl bg-[#FFFFFF] border border-[#B0BA99]/50 text-xs">
                                      <span className="font-mono truncate pr-2">{f.name}</span>
                                      <div className="flex items-center gap-1 shrink-0">
                                        <span className="font-mono text-[10px] text-[#7C5339]">{formatSize(f.size)}</span>
                                        <a href={f.download_url} download={f.name} className="p-1 rounded bg-[#9D6638] text-[#FDFBF7]"><Download className="size-3" /></a>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* FILES TAB */}
      {activeTab === 'files' && (
        <section className="rounded-3xl border border-[#B0BA99] bg-[#FFFFFF] p-6 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="inline-flex flex-wrap rounded-xl border border-[#B0BA99] bg-[#EDE5CD]/60 p-1 gap-1">
              {(
                [
                  { key: 'all', label: 'All', count: allFiles.length },
                  { key: 'video', label: 'Videos', count: allFiles.filter((f) => f.category === 'video').length },
                  { key: 'subtitle', label: 'Subtitles', count: allFiles.filter((f) => f.category === 'subtitle').length },
                  { key: 'audio', label: 'Audio', count: allFiles.filter((f) => f.category === 'audio').length },
                  { key: 'document', label: 'Docs', count: allFiles.filter((f) => f.category === 'document').length },
                ] as const
              ).map((cat) => (
                <button
                  key={cat.key}
                  onClick={() => { setFileCategoryFilter(cat.key); setFilesPage(1) }}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                    fileCategoryFilter === cat.key ? 'bg-[#9D6638] text-[#FDFBF7] shadow-xs' : 'text-[#4E220F] hover:bg-[#EDE5CD]'
                  }`}
                >
                  <span>{cat.label}</span>
                  <span className="font-mono text-[10px] opacity-80">({cat.count})</span>
                </button>
              ))}
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-2.5 size-3.5 text-[#7C5339]" />
              <input
                type="text"
                value={fileSearch}
                onChange={(e) => { setFileSearch(e.target.value); setFilesPage(1) }}
                placeholder="Search files..."
                className="w-full rounded-xl border border-[#B0BA99] bg-[#F7F1DE]/70 pl-8 pr-3 py-1.5 text-xs text-[#4E220F] placeholder-[#7C5339]/60 focus:border-[#9D6638] focus:outline-none font-medium"
              />
            </div>
          </div>

          {filteredFiles.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#B0BA99] bg-[#EDE5CD]/20 p-8 text-center space-y-1">
              <Package className="mx-auto size-7 text-[#9D6638] opacity-50" />
              <p className="text-xs font-bold">No matching files</p>
              <p className="text-[11px] text-[#7C5339]">Try adjusting filter or run a successful pipeline.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {pagedFiles.map((file) => (
                  <div key={file.name} className="flex items-center justify-between p-3 rounded-2xl border border-[#B0BA99]/70 bg-[#FFFFFF] hover:border-[#9D6638] transition-all shadow-2xs group">
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                      <div className="flex size-8 items-center justify-center rounded-lg bg-[#EDE5CD] text-[#4E220F] shrink-0">
                        {file.category === 'video' && <Video className="size-4 text-[#9D6638]" />}
                        {file.category === 'subtitle' && <Captions className="size-4 text-[#9D6638]" />}
                        {file.category === 'audio' && <Music className="size-4 text-[#9D6638]" />}
                        {file.category === 'document' && <FileText className="size-4 text-[#7C5339]" />}
                        {file.category !== 'video' && file.category !== 'subtitle' && file.category !== 'audio' && file.category !== 'document' && <FileCode className="size-4 text-[#7C5339]" />}
                      </div>
                      <div className="min-w-0">
                        <p className="font-mono text-xs font-bold truncate" title={file.name}>{file.name}</p>
                        <div className="flex items-center gap-2 text-[10px] text-[#7C5339] font-mono mt-0.5">
                          <span>{formatSize(file.size)}</span>
                          <span>•</span>
                          <span>{relativeTime(file.mtime)}</span>
                          <span className="hidden sm:inline">• {file.category}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => copyPath(file.name)} className="p-1.5 rounded-lg border border-[#B0BA99] hover:bg-[#EDE5CD]" title="Copy">
                        {copiedPath === file.name ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
                      </button>
                      <button onClick={() => onPreviewArtifact(file.name, file.size, file.preview_url, file.download_url)} className="p-1.5 rounded-lg border border-[#B0BA99] hover:bg-[#EDE5CD]" title="Preview"><Eye className="size-3" /></button>
                      <a href={file.download_url} download={file.name} className="p-1.5 rounded-lg bg-[#9D6638] text-[#FDFBF7] hover:bg-[#86542C]" title="Download"><Download className="size-3" /></a>
                      <button onClick={() => onRemoveMediaItem(file.name)} className="p-1.5 rounded-lg border border-[#A83232]/30 text-[#A83232] hover:bg-[#A83232] hover:text-[#FFFFFF]" title="Delete"><Trash2 className="size-3" /></button>
                    </div>
                  </div>
                ))}
              </div>
              {hasMoreFiles && (
                <div className="flex justify-center pt-2">
                  <button onClick={() => setFilesPage((p) => p + 1)} className="rounded-xl border border-[#B0BA99] bg-[#EDE5CD] px-4 py-1.5 text-xs font-bold hover:bg-[#B0BA99]/40">
                    Load more ({filteredFiles.length - pagedFiles.length} remaining)
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  )
}
