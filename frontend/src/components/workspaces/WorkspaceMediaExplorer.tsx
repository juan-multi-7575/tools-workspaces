import { useEffect, useState } from 'react'
import {
  Search,
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
  Layers,
  FileCode,
  Trash2,
} from 'lucide-react'
import {
  api,
  type WorkspaceMediaResponse,
} from '../../lib/api'

function formatSize(bytes: number): string {
  if (!bytes) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(timestamp: number): string {
  if (!timestamp) return ''
  return new Date(timestamp * 1000).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function WorkspaceMediaExplorer({
  workspaceId,
  onPreviewArtifact,
}: {
  workspaceId: string
  onPreviewArtifact: (name: string, size: number, previewUrl: string, downloadUrl: string) => void
}) {
  const [data, setData] = useState<WorkspaceMediaResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<'packages' | 'video' | 'subtitle' | 'audio' | 'document' | 'all'>('packages')
  const [copiedPath, setCopiedPath] = useState<string | null>(null)

  const loadMedia = () => {
    setLoading(true)
    api.listWorkspaceMedia(workspaceId)
      .then((res) => {
        setData(res)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => {
    loadMedia()
  }, [workspaceId])

  const copyPath = (path: string) => {
    navigator.clipboard.writeText(path)
    setCopiedPath(path)
    setTimeout(() => setCopiedPath(null), 2000)
  }

  const handleDeleteFile = async (filename: string) => {
    if (confirm(`Permanently delete "${filename}"?`)) {
      await api.deleteWorkspaceMedia(workspaceId, filename)
      loadMedia()
    }
  }

  const packages = data?.packages || []
  const allFiles = data?.all_files || []
  const categories = data?.categories || {
    video: [],
    subtitle: [],
    audio: [],
    document: [],
    image: [],
    package: [],
    other: [],
  }

  // Filter packages based on search
  const filteredPackages = packages.filter((pkg) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      pkg.title.toLowerCase().includes(q) ||
      pkg.all_files.some((f) => f.name.toLowerCase().includes(q))
    )
  })

  // Filter raw files based on active tab and search
  const filteredFiles = allFiles.filter((f) => {
    if (activeTab !== 'all' && f.category !== activeTab) return false
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return f.name.toLowerCase().includes(q)
  })

  return (
    <div className="space-y-4 text-[#4E220F]">
      {/* Top Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#FFFFFF] p-3.5 rounded-2xl border border-[#B0BA99] shadow-xs">
        {/* Category Tabs */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setActiveTab('packages')}
            className={
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ' +
              (activeTab === 'packages'
                ? 'bg-[#9D6638] text-[#FDFBF7] shadow-xs'
                : 'bg-[#EDE5CD]/60 text-[#4E220F] hover:bg-[#EDE5CD]')
            }
          >
            <Package className="size-3.5" />
            Media Packages
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#B0BA99]/30 font-mono">
              {packages.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('video')}
            className={
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ' +
              (activeTab === 'video'
                ? 'bg-[#9D6638] text-[#FDFBF7] shadow-xs'
                : 'bg-[#EDE5CD]/60 text-[#4E220F] hover:bg-[#EDE5CD]')
            }
          >
            <Video className="size-3.5" />
            Videos
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#B0BA99]/30 font-mono">
              {categories.video.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('subtitle')}
            className={
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ' +
              (activeTab === 'subtitle'
                ? 'bg-[#9D6638] text-[#FDFBF7] shadow-xs'
                : 'bg-[#EDE5CD]/60 text-[#4E220F] hover:bg-[#EDE5CD]')
            }
          >
            <Captions className="size-3.5" />
            Subtitles
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#B0BA99]/30 font-mono">
              {categories.subtitle.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('document')}
            className={
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ' +
              (activeTab === 'document'
                ? 'bg-[#9D6638] text-[#FDFBF7] shadow-xs'
                : 'bg-[#EDE5CD]/60 text-[#4E220F] hover:bg-[#EDE5CD]')
            }
          >
            <FileText className="size-3.5" />
            Transcripts
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#B0BA99]/30 font-mono">
              {categories.document.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('all')}
            className={
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ' +
              (activeTab === 'all'
                ? 'bg-[#9D6638] text-[#FDFBF7] shadow-xs'
                : 'bg-[#EDE5CD]/60 text-[#4E220F] hover:bg-[#EDE5CD]')
            }
          >
            <Layers className="size-3.5" />
            All Files
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#B0BA99]/30 font-mono">
              {allFiles.length}
            </span>
          </button>
        </div>

        {/* Search Input and Refresh */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-[#7C5339]" />
            <input
              type="text"
              placeholder="Search media & files..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-[#B0BA99] bg-[#F7F1DE]/40 text-xs text-[#4E220F] placeholder-[#7C5339]/60 outline-none focus:border-[#9D6638] font-mono"
            />
          </div>

          <button
            onClick={loadMedia}
            disabled={loading}
            className="p-1.5 rounded-xl border border-[#B0BA99] bg-[#EDE5CD] text-[#4E220F] hover:bg-[#B0BA99]/40 disabled:opacity-50 transition-all shadow-2xs"
            title="Refresh media files"
          >
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin text-[#9D6638]' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {activeTab === 'packages' ? (
        /* Media Packages View (Cohesive Video + Subtitles Pairs) */
        filteredPackages.length === 0 ? (
          <div className="p-12 text-center rounded-2xl border border-dashed border-[#B0BA99] bg-[#EDE5CD]/30 space-y-2">
            <Package className="size-8 text-[#9D6638] mx-auto opacity-60" />
            <p className="text-sm font-bold text-[#4E220F]">No Media Packages Found</p>
            <p className="text-xs text-[#7C5339]">
              Run a pipeline with video and subtitles to automatically generate paired media packages.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredPackages.map((pkg) => (
              <div
                key={pkg.title}
                className="rounded-2xl border border-[#B0BA99] bg-[#FFFFFF] p-4 space-y-4 shadow-xs hover:border-[#9D6638] transition-all"
              >
                {/* Package Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#B0BA99]/40 pb-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex size-9 items-center justify-center rounded-xl bg-[#9D6638] text-[#FDFBF7] shrink-0 shadow-xs">
                      <Video className="size-4.5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-mono text-xs font-bold text-[#4E220F] truncate" title={pkg.title}>
                        {pkg.title}
                      </h3>
                      <p className="font-mono text-[10px] text-[#7C5339] mt-0.5">
                        {pkg.all_files.length} related files •{' '}
                        {pkg.video ? `${formatSize(pkg.video.size)} Video` : 'Audio/Media'} •{' '}
                        {pkg.subtitles.length} Subtitle track{pkg.subtitles.length === 1 ? '' : 's'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {pkg.video && (
                      <button
                        onClick={() =>
                          onPreviewArtifact(pkg.video!.name, pkg.video!.size, pkg.video!.preview_url, pkg.video!.download_url)
                        }
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#9D6638] px-3.5 py-1.5 text-xs font-bold text-[#FDFBF7] shadow-xs hover:bg-[#86542C] transition-all active:scale-95"
                      >
                        <Play className="size-3.5 fill-current" />
                        Preview Video
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (confirm(`Permanently delete all files in package "${pkg.title}"?`)) {
                          Promise.all(pkg.all_files.map((f) => api.deleteWorkspaceMedia(workspaceId, f.name))).then(() =>
                            loadMedia(),
                          )
                        }
                      }}
                      className="p-1.5 rounded-xl border border-[#B0BA99] bg-[#EDE5CD] text-[#7C5339] hover:bg-[#A83232]/15 hover:text-[#A83232] transition-colors"
                      title="Delete package"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>

                {/* Package Files Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {pkg.all_files.map((file) => (
                    <div
                      key={file.name}
                      className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-[#B0BA99]/70 bg-[#F7F1DE]/50 hover:bg-[#EDE5CD]/50 transition-all text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="flex size-7 items-center justify-center rounded-lg bg-[#EDE5CD] text-[#9D6638] shrink-0">
                          {file.category === 'video' ? (
                            <Video className="size-3.5" />
                          ) : file.category === 'subtitle' ? (
                            <Captions className="size-3.5" />
                          ) : file.category === 'audio' ? (
                            <Music className="size-3.5" />
                          ) : (
                            <FileText className="size-3.5" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-mono text-[11px] font-bold text-[#4E220F] truncate" title={file.name}>
                            {file.name}
                          </p>
                          <p className="font-mono text-[9px] text-[#7C5339]">
                            {formatSize(file.size)} • {file.category.toUpperCase()}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => copyPath(file.path)}
                          title="Copy file path"
                          className="p-1 rounded-lg border border-[#B0BA99] bg-[#FFFFFF] text-[#7C5339] hover:bg-[#EDE5CD] hover:text-[#4E220F] transition-all"
                        >
                          {copiedPath === file.path ? (
                            <Check className="size-3 text-[#2E6B47]" />
                          ) : (
                            <Copy className="size-3" />
                          )}
                        </button>
                        <button
                          onClick={() =>
                            onPreviewArtifact(file.name, file.size, file.preview_url, file.download_url)
                          }
                          title="Preview"
                          className="p-1 rounded-lg border border-[#B0BA99] bg-[#FFFFFF] text-[#7C5339] hover:bg-[#EDE5CD] hover:text-[#4E220F] transition-all"
                        >
                          <Eye className="size-3" />
                        </button>
                        <a
                          href={file.download_url}
                          title="Download"
                          className="p-1 rounded-lg bg-[#9D6638] text-[#FDFBF7] hover:bg-[#86542C] transition-all shadow-2xs"
                        >
                          <Download className="size-3" />
                        </a>
                        <button
                          onClick={() => handleDeleteFile(file.name)}
                          title="Delete file"
                          className="p-1 rounded-lg border border-[#B0BA99] bg-[#FFFFFF] text-[#7C5339] hover:bg-[#A83232]/15 hover:text-[#A83232] transition-all"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        /* Categorized or Flat Files Table / Grid */
        filteredFiles.length === 0 ? (
          <div className="p-12 text-center rounded-2xl border border-dashed border-[#B0BA99] bg-[#EDE5CD]/30 space-y-2">
            <Layers className="size-8 text-[#9D6638] mx-auto opacity-60" />
            <p className="text-sm font-bold text-[#4E220F]">No Files Found</p>
            <p className="text-xs text-[#7C5339]">
              No artifacts match the selected category or search query.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-[#B0BA99] bg-[#FFFFFF] overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs text-[#4E220F]">
              <thead className="bg-[#EDE5CD]/70 border-b border-[#B0BA99]/60 font-mono text-[10px] uppercase text-[#7C5339]">
                <tr>
                  <th className="py-3 px-4">Filename</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Size</th>
                  <th className="py-3 px-4">Created</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#B0BA99]/30">
                {filteredFiles.map((file) => (
                  <tr key={file.name} className="hover:bg-[#F7F1DE]/60 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold max-w-sm truncate">
                      <div className="flex items-center gap-2">
                        {file.category === 'video' ? (
                          <Video className="size-4 text-[#9D6638] shrink-0" />
                        ) : file.category === 'subtitle' ? (
                          <Captions className="size-4 text-[#9D6638] shrink-0" />
                        ) : file.category === 'audio' ? (
                          <Music className="size-4 text-[#9D6638] shrink-0" />
                        ) : (
                          <FileCode className="size-4 text-[#7C5339] shrink-0" />
                        )}
                        <span className="truncate" title={file.name}>{file.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-[10px]">
                      <span className="px-2 py-0.5 rounded-md bg-[#EDE5CD] border border-[#B0BA99] font-bold uppercase">
                        {file.category}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-[#7C5339]">{formatSize(file.size)}</td>
                    <td className="py-3 px-4 font-mono text-[#7C5339]">{formatDate(file.mtime)}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          onClick={() => copyPath(file.path)}
                          title="Copy file path"
                          className="p-1 rounded-lg border border-[#B0BA99] bg-[#EDE5CD] text-[#4E220F] hover:bg-[#B0BA99]/40 transition-all"
                        >
                          {copiedPath === file.path ? (
                            <Check className="size-3 text-[#2E6B47]" />
                          ) : (
                            <Copy className="size-3" />
                          )}
                        </button>
                        <button
                          onClick={() =>
                            onPreviewArtifact(file.name, file.size, file.preview_url, file.download_url)
                          }
                          title="Preview"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-[#B0BA99] bg-[#EDE5CD] text-[11px] font-bold text-[#4E220F] hover:bg-[#B0BA99]/40 transition-all"
                        >
                          <Eye className="size-3" />
                          Preview
                        </button>
                        <a
                          href={file.download_url}
                          title="Download"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#9D6638] text-[11px] font-bold text-[#FDFBF7] hover:bg-[#86542C] transition-all shadow-2xs"
                        >
                          <Download className="size-3" />
                          Download
                        </a>
                        <button
                          onClick={() => handleDeleteFile(file.name)}
                          title="Delete file"
                          className="p-1 rounded-lg border border-[#B0BA99] bg-[#EDE5CD] text-[#7C5339] hover:bg-[#A83232]/15 hover:text-[#A83232] transition-all"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}
