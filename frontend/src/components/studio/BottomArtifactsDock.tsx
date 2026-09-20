import { useState, useEffect } from 'react'
import {
  Package,
  FileTerminal,
  Video,
  Captions,
  Music,
  FileText,
  Download,
  Trash2,
  Play,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from 'lucide-react'
import {
  api,
  type WorkspaceMediaResponse,
  type Run,
} from '../../lib/api'

export default function BottomArtifactsDock({
  workspaceId,
  onPreviewArtifact,
  dockExpanded,
  onToggleExpand,
}: {
  workspaceId: string
  onPreviewArtifact: (name: string, size: number, previewUrl: string, downloadUrl: string) => void
  dockExpanded: boolean
  onToggleExpand: () => void
}) {
  const [mediaData, setMediaData] = useState<WorkspaceMediaResponse | null>(null)
  const [runs, setRuns] = useState<Run[]>([])
  const [tab, setTab] = useState<'packages' | 'files' | 'runs'>('packages')
  const [loading, setLoading] = useState(false)

  const refresh = () => {
    setLoading(true)
    Promise.all([
      api.listWorkspaceMedia(workspaceId),
      api.listRuns(workspaceId),
    ])
      .then(([mRes, rRes]) => {
        setMediaData(mRes)
        setRuns(rRes.runs || [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    refresh()
  }, [workspaceId])

  const handleDeleteMedia = async (filename: string) => {
    if (confirm(`Delete media item "${filename}"?`)) {
      await api.deleteWorkspaceMedia(workspaceId, filename)
      refresh()
    }
  }

  const handleDeleteRun = async (runId: string) => {
    if (confirm(`Delete run ${runId} and all artifacts?`)) {
      await api.deleteRun(workspaceId, runId)
      refresh()
    }
  }

  return (
    <div className="border-t border-[#B0BA99] bg-[#EDE5CD]/80 flex flex-col shrink-0 transition-all">
      {/* Dock Bar Header */}
      <div className="px-4 py-2 flex items-center justify-between border-b border-[#B0BA99]/40 bg-[#EDE5CD]">
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleExpand}
            className="flex items-center gap-1.5 text-xs font-bold text-[#4E220F] hover:text-[#9D6638] transition-colors"
          >
            <Package className="size-4 text-[#9D6638]" />
            <span className="uppercase tracking-wider font-mono text-[11px]">
              Workspace Artifacts Dock
            </span>
            {dockExpanded ? (
              <ChevronDown className="size-3.5 text-[#7C5339]" />
            ) : (
              <ChevronUp className="size-3.5 text-[#7C5339]" />
            )}
          </button>

          {/* Tab buttons */}
          {dockExpanded && (
            <div className="inline-flex rounded-xl border border-[#B0BA99]/60 bg-[#FFFFFF] p-0.5 gap-0.5 text-[11px] font-bold">
              <button
                onClick={() => setTab('packages')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  tab === 'packages'
                    ? 'bg-[#9D6638] text-[#FDFBF7] shadow-2xs'
                    : 'text-[#4E220F] hover:bg-[#EDE5CD]'
                }`}
              >
                Packages ({mediaData?.packages?.length || 0})
              </button>
              <button
                onClick={() => setTab('files')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  tab === 'files'
                    ? 'bg-[#9D6638] text-[#FDFBF7] shadow-2xs'
                    : 'text-[#4E220F] hover:bg-[#EDE5CD]'
                }`}
              >
                All Files ({mediaData?.all_files?.length || 0})
              </button>
              <button
                onClick={() => setTab('runs')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  tab === 'runs'
                    ? 'bg-[#9D6638] text-[#FDFBF7] shadow-2xs'
                    : 'text-[#4E220F] hover:bg-[#EDE5CD]'
                }`}
              >
                Execution Runs ({runs.length})
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            disabled={loading}
            className="p-1 rounded-lg border border-[#B0BA99]/60 bg-[#FFFFFF] text-[#4E220F] hover:bg-[#EDE5CD] shadow-2xs transition-all active:scale-95 disabled:opacity-40"
            title="Refresh artifacts"
          >
            <RefreshCw className={`size-3 text-[#9D6638] ${loading ? 'animate-spin' : ''}`} />
          </button>
          <span className="font-mono text-[10px] text-[#7C5339]">
            {mediaData?.total_files || 0} items stored
          </span>
        </div>
      </div>

      {/* Expanded Dock Body */}
      {dockExpanded && (
        <div className="h-52 overflow-y-auto p-3 bg-[#F7F1DE]/40">
          {tab === 'packages' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {!mediaData?.packages || mediaData.packages.length === 0 ? (
                <div className="col-span-full py-8 text-center text-xs text-[#7C5339]">
                  No media packages found. Run a pipeline to produce video + subtitle pairs.
                </div>
              ) : (
                mediaData.packages.map((pkg) => (
                  <div
                    key={pkg.title}
                    className="rounded-xl border border-[#B0BA99] bg-[#FFFFFF] p-2.5 shadow-2xs space-y-2"
                  >
                    <div className="flex items-center justify-between gap-1 border-b border-[#B0BA99]/30 pb-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Video className="size-3.5 text-[#9D6638] shrink-0" />
                        <span className="font-mono text-xs font-bold text-[#4E220F] truncate" title={pkg.title}>
                          {pkg.title}
                        </span>
                      </div>
                      <span className="font-mono text-[10px] text-[#7C5339] shrink-0">
                        {pkg.all_files.length} files
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1">
                      {pkg.video && (
                        <button
                          onClick={() =>
                            onPreviewArtifact(
                              pkg.video!.name,
                              pkg.video!.size,
                              pkg.video!.preview_url,
                              pkg.video!.download_url,
                            )
                          }
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#9D6638] text-[#FDFBF7] text-[10px] font-bold hover:bg-[#86542C]"
                        >
                          <Play className="size-2.5 fill-current" /> Preview Video
                        </button>
                      )}
                      {pkg.subtitles?.map((s) => (
                        <button
                          key={s.name}
                          onClick={() =>
                            onPreviewArtifact(s.name, s.size, s.preview_url, s.download_url)
                          }
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg border border-[#B0BA99] bg-[#EDE5CD] text-[10px] font-mono text-[#4E220F] hover:bg-[#B0BA99]/40"
                        >
                          <Captions className="size-2.5 text-[#9D6638]" /> SRT
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'files' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {!mediaData?.all_files || mediaData.all_files.length === 0 ? (
                <div className="col-span-full py-8 text-center text-xs text-[#7C5339]">
                  No individual media files found.
                </div>
              ) : (
                mediaData.all_files.map((file) => (
                  <div
                    key={file.name}
                    className="flex items-center justify-between p-2 rounded-xl border border-[#B0BA99] bg-[#FFFFFF] text-xs shadow-2xs gap-1.5"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      {file.category === 'video' && <Video className="size-3.5 text-[#9D6638] shrink-0" />}
                      {file.category === 'audio' && <Music className="size-3.5 text-[#9D6638] shrink-0" />}
                      {file.category === 'subtitle' && <Captions className="size-3.5 text-[#9D6638] shrink-0" />}
                      {file.category === 'document' && <FileText className="size-3.5 text-[#9D6638] shrink-0" />}
                      <span className="font-mono text-xs text-[#4E220F] truncate" title={file.name}>
                        {file.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() =>
                          onPreviewArtifact(file.name, file.size, file.preview_url, file.download_url)
                        }
                        className="p-1 rounded-lg border border-[#B0BA99]/60 hover:bg-[#EDE5CD] text-[#4E220F]"
                        title="Preview"
                      >
                        <Play className="size-2.5 fill-current" />
                      </button>
                      <a
                        href={file.download_url}
                        className="p-1 rounded-lg border border-[#B0BA99]/60 hover:bg-[#EDE5CD] text-[#4E220F]"
                        title="Download"
                      >
                        <Download className="size-2.5" />
                      </a>
                      <button
                        onClick={() => handleDeleteMedia(file.name)}
                        className="p-1 rounded-lg border border-[#B0BA99]/60 hover:bg-[#A83232]/10 text-[#7C5339] hover:text-[#A83232]"
                        title="Delete"
                      >
                        <Trash2 className="size-2.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'runs' && (
            <div className="space-y-1.5">
              {runs.length === 0 ? (
                <div className="py-8 text-center text-xs text-[#7C5339]">
                  No execution runs recorded in this workspace.
                </div>
              ) : (
                runs.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between p-2 rounded-xl border border-[#B0BA99] bg-[#FFFFFF] text-xs shadow-2xs"
                  >
                    <div className="flex items-center gap-2">
                      <FileTerminal className="size-3.5 text-[#9D6638]" />
                      <span className="font-mono text-xs font-bold text-[#4E220F]">{r.id}</span>
                      <span className="font-mono text-[10px] text-[#7C5339]">
                        Tool: {r.tool_id} • Status: {r.status}
                      </span>
                    </div>
                    <button
                      onClick={() => handleDeleteRun(r.id)}
                      className="p-1 rounded-lg border border-[#B0BA99]/60 hover:bg-[#A83232]/10 text-[#7C5339] hover:text-[#A83232]"
                      title="Delete run"
                    >
                      <Trash2 className="size-2.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
