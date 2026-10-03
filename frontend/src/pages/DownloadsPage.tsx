import { useEffect, useRef, useState } from 'react'
import {
  ArrowDownToLine,
  Plus,
  Play,
  Ban,
  Clock,
  Loader2,
  Link2,
  Clipboard,
  FileAudio,
  FileText,
  Search,
  Scissors,
  RefreshCw,
  FolderOpen,
  LayoutGrid,
  List,
} from 'lucide-react'
import { api, type DownloadTask } from '../lib/api'
import { cleanOptions } from '../lib/utils'
import DownloadOptionsForm, { type DownloadOptions } from '../components/downloads/DownloadOptions'
import AudioPlayerModal, { type AudioPlayerMedia } from '../components/audio/AudioPlayerModal'

function progressPercent(t: DownloadTask): number {
  const p = t.progress as { percent?: number; _percent_str?: string }
  if (typeof p.percent === 'number') return Math.round(p.percent)
  if (typeof p._percent_str === 'string') {
    const m = p._percent_str.match(/(\d+(?:\.\d+)?)/)
    if (m) return Math.min(100, Math.round(Number(m[1])))
  }
  return t.status === 'completed' ? 100 : 0
}

export default function DownloadsPage({
  onSendToTool,
}: {
  onSendToTool?: (toolId: string, inputPath: string) => void
}) {
  const [tasks, setTasks] = useState<DownloadTask[]>([])
  const [url, setUrl] = useState('')
  const [options, setOptions] = useState<DownloadOptions>({})
  const [adding, setAdding] = useState(false)
  const [activeMedia, setActiveMedia] = useState<AudioPlayerMedia | null>(null)
  const [search, setSearch] = useState('')
  const [viewFormat, setViewFormat] = useState<'grid' | 'table'>('grid')
  const sources = useRef<Record<string, EventSource>>({})

  const refresh = () => {
    api.listDownloads().then(({ downloads }) => setTasks(downloads)).catch(() => {})
  }

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 4000)
    return () => clearInterval(interval)
  }, [])

  // Stabilized SSE listeners
  useEffect(() => {
    const current = sources.current
    const activeTasks = tasks.filter((t) => t.status === 'queued' || t.status === 'running')

    for (const t of activeTasks) {
      if (current[t.id]) continue
      try {
        const es = new EventSource(api.downloadStreamUrl(t.id))
        current[t.id] = es
        es.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data) as DownloadTask
            setTasks((prev) =>
              prev.map((p) =>
                p.id === t.id
                  ? { ...p, status: msg.status, progress: msg.progress, error: msg.error }
                  : p
              )
            )
            if (['completed', 'failed', 'cancelled'].includes(msg.status)) {
              es.close()
              delete current[t.id]
            }
          } catch {
            /* ignore */
          }
        }
        es.onerror = () => {
          es.close()
          delete current[t.id]
        }
      } catch {
        /* ignore */
      }
    }

    return () => {
      Object.keys(current).forEach((id) => {
        const task = tasks.find((t) => t.id === id)
        if (!task || ['completed', 'failed', 'cancelled'].includes(task.status)) {
          current[id].close()
          delete current[id]
        }
      })
    }
  }, [tasks])

  const add = async () => {
    if (!url.trim()) return
    setAdding(true)
    try {
      await api.enqueueDownload({ url: url.trim(), ...cleanOptions(options) })
      setUrl('')
      setOptions({})
      refresh()
    } finally {
      setAdding(false)
    }
  }

  const cancel = async (id: string) => {
    await api.cancelDownload(id)
    refresh()
  }

  const activeTasks = tasks.filter((t) => t.status === 'queued' || t.status === 'running')
  const completedTasks = tasks.filter((t) => t.status === 'completed')

  const filteredCompleted = completedTasks.filter((t) => {
    if (!search.trim()) return true
    return t.id.toLowerCase().includes(search.toLowerCase())
  })

  return (
    <div className="mx-auto max-w-6xl space-y-6 text-brand-espresso">
      {/* Header Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-brand-sage pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-brand-espresso">
              Downloads & Media Library
            </h1>
            <span className="font-mono text-xs px-2.5 py-0.5 rounded-full bg-brand-sage/40 border border-brand-sage text-brand-espresso font-semibold">
              {tasks.length} total
            </span>
          </div>
          <p className="mt-1 text-xs text-brand-caramel-text">
            Universal yt-dlp media downloader. Download videos, extract pristine audio tracks, and launch the audio player.
          </p>
        </div>

        <button
          onClick={refresh}
          className="inline-flex items-center gap-1.5 rounded-lg border border-brand-sage bg-brand-cream-dark/70 px-3 py-1.5 text-xs font-semibold text-brand-espresso hover:bg-brand-sage/30 transition-all shadow-xs"
        >
          <RefreshCw className="size-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      {/* Main Download Input Card */}
      <section className="rounded-2xl border-2 border-brand-sage bg-surface-white p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-brand-sage/50 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-brand-caramel text-brand-cream-light">
              <ArrowDownToLine className="size-4" />
            </div>
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-brand-espresso">
                Enqueue Media Download
              </h2>
              <p className="font-mono text-xs text-brand-caramel-text">YT-DLP UNIVERSAL PROCESSOR</p>
            </div>
          </div>
        </div>

        {/* Highlighted Hero URL Bar */}
        <div className="rounded-xl border-2 border-brand-caramel/50 bg-brand-cream/90 p-3.5 shadow-inner focus-within:border-brand-caramel focus-within:ring-2 focus-within:ring-brand-caramel/25 transition-all">
          <div className="flex items-center justify-between mb-1.5">
            <label className="flex items-center gap-1.5 font-mono text-xs font-bold uppercase tracking-wider text-brand-espresso">
              <Link2 className="size-3.5 text-brand-caramel" />
              <span>Target URL</span>
              <span className="text-xs text-brand-espresso bg-brand-sage/40 border border-brand-sage px-1.5 py-0.2 rounded font-semibold">
                REQUIRED
              </span>
            </label>
            {url && (
              <button
                onClick={() => setUrl('')}
                className="text-xs font-mono text-brand-caramel-text hover:text-accent-contrast"
              >
                clear
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && add()}
              placeholder="https://www.youtube.com/watch?v=... or Soundcloud / Vimeo link"
              className="flex-1 rounded-lg border border-brand-sage bg-surface-white px-3.5 py-2 font-mono text-xs text-brand-espresso placeholder-brand-caramel-text/60 focus:border-brand-caramel focus:outline-none shadow-xs"
            />
            <button
              type="button"
              onClick={async () => {
                try {
                  const text = await navigator.clipboard.readText()
                  if (text) setUrl(text.trim())
                } catch {
                  /* ignore */
                }
              }}
              className="inline-flex items-center gap-1 rounded-lg bg-brand-cream-dark px-3 py-2 text-xs font-semibold text-brand-espresso hover:bg-brand-sage/40 border border-brand-sage transition-all"
              title="Paste from Clipboard"
            >
              <Clipboard className="size-3.5 text-brand-caramel" />
              <span>Paste</span>
            </button>
            <button
              onClick={add}
              disabled={!url.trim() || adding}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-caramel px-4 py-2 text-xs font-semibold text-brand-cream-light shadow-md transition-all hover:bg-brand-caramel-hover active:scale-95 disabled:opacity-40"
            >
              <Plus className="size-4" />
              {adding ? 'Queuing…' : 'Start Download'}
            </button>
          </div>
        </div>

        {/* Detailed Options Form */}
        <DownloadOptionsForm value={options} onChange={setOptions} />
      </section>

      {/* Active Tasks Queue */}
      {activeTasks.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-bold uppercase tracking-wider text-brand-espresso flex items-center gap-1.5">
              <span className="flex size-2 rounded-full bg-brand-caramel animate-pulse" />
              Active Transfers ({activeTasks.length})
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {activeTasks.map((t) => {
              const pct = progressPercent(t)
              const progress = t.progress as { speed?: string; eta?: string }
              return (
                <div
                  key={t.id}
                  className="rounded-xl border border-brand-sage bg-surface-white p-4 shadow-sm space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-brand-espresso">
                      Task: {t.id}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-full bg-brand-caramel/20 text-brand-caramel border border-brand-caramel/30 flex items-center gap-1">
                        <Loader2 className="size-2.5 animate-spin" />
                        {t.status.toUpperCase()}
                      </span>
                      <button
                        onClick={() => cancel(t.id)}
                        className="rounded p-1 text-brand-caramel-text hover:bg-accent-contrast/15 hover:text-accent-contrast transition-colors"
                        title="Cancel Download"
                      >
                        <Ban className="size-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-mono text-brand-caramel-text">
                      <span className="font-bold text-brand-espresso">{pct}% Complete</span>
                      <span>
                        {progress.speed || 'Downloading…'}{' '}
                        {progress.eta ? `• ETA ${progress.eta}` : ''}
                      </span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-brand-cream-dark">
                      <div
                        className="h-full bg-gradient-to-r from-brand-sage to-brand-caramel transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Completed Downloads Library */}
      <section className="rounded-2xl border border-brand-sage bg-surface-white p-5 shadow-sm space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-brand-sage/50 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-brand-sage/40 text-brand-espresso">
              <FolderOpen className="size-4" />
            </div>
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-brand-espresso">
                Completed Media Files
              </h2>
              <p className="font-mono text-xs text-brand-caramel-text">
                STORED IN DOWNLOADS/DOWNLOADER/
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="inline-flex rounded-xl border border-brand-sage bg-brand-cream-dark/80 p-1 shadow-2xs">
              <button
                onClick={() => setViewFormat('grid')}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                  viewFormat === 'grid'
                    ? 'bg-brand-caramel text-brand-cream-light shadow-xs'
                    : 'text-brand-espresso hover:bg-brand-cream-dark'
                }`}
                title="Grid View Format"
              >
                <LayoutGrid className="size-3.5" />
                <span className="hidden sm:inline">Grid</span>
              </button>
              <button
                onClick={() => setViewFormat('table')}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                  viewFormat === 'table'
                    ? 'bg-brand-caramel text-brand-cream-light shadow-xs'
                    : 'text-brand-espresso hover:bg-brand-cream-dark'
                }`}
                title="Table View Format"
              >
                <List className="size-3.5" />
                <span className="hidden sm:inline">Table</span>
              </button>
            </div>

            <div className="relative w-full sm:w-56">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-brand-caramel-text" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search downloaded tasks..."
                className="w-full rounded-lg border border-brand-sage bg-brand-cream/60 pl-8 pr-3 py-1.5 text-xs text-brand-espresso placeholder-brand-caramel-text/60 font-mono focus:border-brand-caramel focus:bg-surface-white focus:outline-none"
              />
            </div>
          </div>
        </div>

        {filteredCompleted.length === 0 ? (
          <div className="rounded-xl border border-dashed border-brand-sage bg-brand-cream-dark/30 p-8 text-center text-brand-caramel-text text-xs font-mono">
            <Clock className="mx-auto size-6 text-brand-caramel mb-1.5 opacity-60" />
            No completed downloads found.
          </div>
        ) : viewFormat === 'grid' ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredCompleted.map((t) => (
              <div
                key={t.id}
                className="flex flex-col justify-between rounded-xl border border-brand-sage bg-brand-cream/60 p-4 shadow-xs transition-all hover:border-brand-caramel hover:bg-surface-white"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <div className="flex size-7 items-center justify-center rounded-lg bg-brand-cream-dark text-brand-caramel">
                        <FileAudio className="size-4" />
                      </div>
                      <span className="font-mono text-xs font-bold text-brand-espresso truncate max-w-[140px]">
                        Task-{t.id}
                      </span>
                    </div>
                    <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded bg-brand-sage/40 border border-brand-sage text-brand-espresso">
                      READY
                    </span>
                  </div>

                  <p className="font-mono text-xs text-brand-caramel-text truncate">
                    downloads/downloader/
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-brand-sage/50 flex items-center justify-between">
                  <button
                    onClick={() =>
                      setActiveMedia({
                        name: `Task-${t.id}.mp4`,
                        path: `downloads/downloader/`,
                        kind: 'audio',
                      })
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg bg-brand-caramel px-3 py-1.5 text-xs font-semibold text-brand-cream-light hover:bg-brand-caramel-hover transition-all shadow-xs"
                  >
                    <Play className="size-3 fill-current" />
                    <span>Open Player</span>
                  </button>

                  <div className="flex items-center gap-1">
                    {onSendToTool && (
                      <button
                        onClick={() => onSendToTool('trimmer', `downloads/downloader/`)}
                        className="rounded-md p-1.5 text-brand-caramel-text hover:bg-brand-cream-dark hover:text-brand-espresso transition-colors"
                        title="Send to Trimmer"
                      >
                        <Scissors className="size-3.5" />
                      </button>
                    )}
                    {onSendToTool && (
                      <button
                        onClick={() => onSendToTool('transcriber', `downloads/downloader/`)}
                        className="rounded-md p-1.5 text-brand-caramel-text hover:bg-brand-cream-dark hover:text-brand-espresso transition-colors"
                        title="Send to Transcriber"
                      >
                        <FileText className="size-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* FORMAT 2: TABLE VIEW FOR DOWNLOADS */
          <div className="overflow-hidden rounded-xl border border-brand-sage bg-surface-white shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-brand-espresso">
                <thead className="border-b border-brand-sage bg-brand-cream-dark/70 font-mono text-xs uppercase text-brand-caramel-text">
                  <tr>
                    <th className="px-4 py-3 font-bold">Transfer Identifier</th>
                    <th className="px-4 py-3 font-bold">Storage Path</th>
                    <th className="px-4 py-3 font-bold">Status</th>
                    <th className="px-4 py-3 font-bold text-right">Quick Pipeline Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-sage/40 font-medium">
                  {filteredCompleted.map((t) => (
                    <tr key={t.id} className="hover:bg-brand-cream-dark/40 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs font-bold text-brand-espresso">
                        Task-{t.id}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-brand-caramel-text">
                        downloads/downloader/
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        <span className="rounded bg-brand-sage/40 px-2 py-0.5 font-bold border border-brand-sage">
                          COMPLETED
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() =>
                              setActiveMedia({
                                name: `Task-${t.id}.mp4`,
                                path: `downloads/downloader/`,
                                kind: 'audio',
                              })
                            }
                            className="inline-flex items-center gap-1 rounded-lg bg-brand-caramel px-2.5 py-1 text-xs font-bold text-brand-cream-light hover:bg-brand-caramel-hover transition-all"
                          >
                            <Play className="size-3 fill-current" />
                            <span>Play</span>
                          </button>
                          {onSendToTool && (
                            <button
                              onClick={() => onSendToTool('trimmer', `downloads/downloader/`)}
                              className="rounded-md border border-brand-sage bg-brand-cream-dark px-2 py-1 text-xs font-bold text-brand-espresso hover:bg-brand-sage/40 transition-colors"
                            >
                              Trim
                            </button>
                          )}
                          {onSendToTool && (
                            <button
                              onClick={() => onSendToTool('transcriber', `downloads/downloader/`)}
                              className="rounded-md border border-brand-sage bg-brand-cream-dark px-2 py-1 text-xs font-bold text-brand-espresso hover:bg-brand-sage/40 transition-colors"
                            >
                              Transcribe
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Standalone Audio Player Modal */}
      <AudioPlayerModal
        media={activeMedia}
        onClose={() => setActiveMedia(null)}
        onSendToTool={onSendToTool}
      />
    </div>
  )
}
