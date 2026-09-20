import { useEffect, useRef, useState } from 'react'
import { api, type DownloadTask } from '../../lib/api'
import { cleanOptions } from '../../lib/utils'
import { X, Plus, ArrowDownToLine, Ban, CheckCircle2, AlertCircle, Clock, Loader2, Link2, Clipboard } from 'lucide-react'
import DownloadOptionsForm, { type DownloadOptions } from './DownloadOptions'

const STATUS_LABEL: Record<string, string> = {
  queued: 'Queued',
  running: 'Downloading',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

function progressPercent(t: DownloadTask): number {
  const p = t.progress as { percent?: number; _percent_str?: string }
  if (typeof p.percent === 'number') return Math.round(p.percent)
  if (typeof p._percent_str === 'string') {
    const m = p._percent_str.match(/(\d+(?:\.\d+)?)/)
    if (m) return Math.min(100, Math.round(Number(m[1])))
  }
  return t.status === 'completed' ? 100 : 0
}

export default function DownloadManager() {
  const [open, setOpen] = useState(false)
  const [tasks, setTasks] = useState<DownloadTask[]>([])
  const [url, setUrl] = useState('')
  const [options, setOptions] = useState<DownloadOptions>({})
  const [adding, setAdding] = useState(false)
  const sources = useRef<Record<string, EventSource>>({})

  const refresh = () => api.listDownloads().then(({ downloads }) => setTasks(downloads))

  useEffect(() => {
    refresh()
  }, [])

  useEffect(() => {
    for (const t of tasks) {
      if (sources.current[t.id]) continue
      const es = new EventSource(api.downloadStreamUrl(t.id))
      sources.current[t.id] = es
      es.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data) as DownloadTask
          setTasks((prev) => prev.map((p) => (p.id === t.id ? { ...p, status: msg.status, progress: msg.progress, error: msg.error } : p)))
          if (['completed', 'failed', 'cancelled'].includes(msg.status)) {
            es.close()
            delete sources.current[t.id]
          }
        } catch {
          /* ignore malformed frame */
        }
      }
    }
  }, [tasks])

  useEffect(() => {
    const current = sources.current
    return () => {
      Object.values(current).forEach((s) => s.close())
    }
  }, [])

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

  const active = tasks.filter((t) => t.status === 'queued' || t.status === 'running').length

  return (
    <>
      {/* Floating Minimalist Status Pill */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/90 px-3.5 py-2 text-xs font-medium text-zinc-200 shadow-2xl backdrop-blur-md transition-all duration-150 hover:bg-zinc-800 hover:border-zinc-700 active:scale-[0.99] group"
        title="Open Download Manager"
      >
        <ArrowDownToLine className="size-3.5 text-[#3ef50b]" />
        <span className="tracking-tight">Downloads</span>
        {active > 0 ? (
          <span className="flex items-center gap-1.5 font-mono text-[10px] text-[#3ef50b] bg-[#3ef50b]/10 border border-[#3ef50b]/20 px-2 py-0.5 rounded-full">
            <span className="h-1.5 w-1.5 rounded-full bg-[#3ef50b] animate-pulse" />
            {active} active
          </span>
        ) : (
          <span className="font-mono text-[10px] text-zinc-500">
            {tasks.length}
          </span>
        )}
      </button>

      {/* Slide-over Drawer */}
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-[2px]">
          <div className="absolute inset-0" onClick={() => setOpen(false)} />
          <aside className="relative flex h-full w-[440px] max-w-[95vw] flex-col border-l border-zinc-800 bg-zinc-950 shadow-2xl">
            {/* Drawer Header */}
            <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3.5 bg-zinc-900/40">
              <div className="flex items-center gap-2">
                <div className="flex size-6 items-center justify-center rounded border border-zinc-800 bg-zinc-900 text-[#3ef50b]">
                  <ArrowDownToLine className="size-3.5" />
                </div>
                <div>
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-100">
                    Download Manager
                  </h2>
                  <p className="font-mono text-[10px] text-zinc-500">{active} active processes</p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-md p-1.5 text-zinc-400 transition-colors duration-150 hover:bg-zinc-800 hover:text-white"
              >
                <X className="size-4" />
              </button>
            </header>

            {/* Highlighted URL Input Bar */}
            <div className="border-b border-zinc-800 p-3.5 bg-zinc-950/90">
              <div className="rounded-xl border-2 border-[#3ef50b]/60 bg-zinc-900/90 p-2.5 shadow-md shadow-[#3ef50b]/5 ring-1 ring-[#3ef50b]/20 focus-within:ring-2 focus-within:ring-[#3ef50b]/40">
                <div className="flex items-center justify-between mb-1.5 px-0.5">
                  <label className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-300">
                    <Link2 className="size-3 text-[#3ef50b]" />
                    <span>Target URL</span>
                    <span className="text-[9px] text-[#3ef50b] bg-[#3ef50b]/10 border border-[#3ef50b]/20 px-1 rounded">
                      REQUIRED
                    </span>
                  </label>
                  {url && (
                    <button
                      onClick={() => setUrl('')}
                      className="text-[10px] font-mono text-zinc-500 hover:text-red-400"
                    >
                      clear
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && add()}
                      placeholder="Paste video / playlist URL…"
                      className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:border-[#3ef50b] focus:outline-none font-mono"
                    />
                  </div>
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
                    className="inline-flex items-center gap-1 rounded-md bg-zinc-800 px-2 py-1.5 text-[11px] font-medium text-zinc-300 hover:bg-zinc-700 hover:text-white border border-zinc-700"
                    title="Paste from Clipboard"
                  >
                    <Clipboard className="size-3 text-[#3ef50b]" />
                    <span>Paste</span>
                  </button>
                  <button
                    onClick={add}
                    disabled={!url.trim() || adding}
                    className="inline-flex items-center gap-1 rounded-md bg-[#3ef50b] px-3 py-1.5 text-xs font-semibold text-zinc-950 transition-all duration-150 hover:bg-[#35d409] active:scale-[0.99] disabled:opacity-40"
                  >
                    <Plus className="size-3.5" />
                    {adding ? 'Queuing…' : 'Enqueue'}
                  </button>
                </div>
              </div>
            </div>

            {/* Collapsible Options Form */}
            <DownloadOptionsForm value={options} onChange={setOptions} />

            {/* Task Queue List */}
            <div className="flex-1 space-y-2.5 overflow-y-auto px-4 py-3">
              {tasks.length === 0 ? (
                <div className="p-8 text-center text-zinc-500 text-xs">
                  <Clock className="mx-auto size-6 text-zinc-700 mb-1.5" />
                  No downloads queued yet.
                </div>
              ) : (
                tasks
                  .slice()
                  .reverse()
                  .map((t) => {
                    const pct = progressPercent(t)
                    const live = t.status === 'running' || t.status === 'queued'
                    return (
                      <div
                        key={t.id}
                        className="rounded-lg border border-zinc-800/80 bg-zinc-900/60 p-3 space-y-2 transition-all duration-150 hover:border-zinc-700"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-mono text-xs font-semibold text-zinc-200">{t.id}</span>
                          <div className="flex items-center gap-1.5">
                            <span
                              className={
                                'font-mono text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1 ' +
                                (t.status === 'completed'
                                  ? 'bg-[#3ef50b]/10 text-[#3ef50b] border border-[#3ef50b]/20'
                                  : t.status === 'failed'
                                    ? 'bg-[#f5220b]/10 text-[#f5220b] border border-[#f5220b]/20'
                                    : t.status === 'cancelled'
                                      ? 'bg-zinc-800 text-zinc-400'
                                      : 'bg-[#3ef50b]/15 text-[#3ef50b] border border-[#3ef50b]/30')
                              }
                            >
                              {t.status === 'running' && <Loader2 className="size-2.5 animate-spin text-[#3ef50b]" />}
                              {t.status === 'completed' && <CheckCircle2 className="size-2.5 text-[#3ef50b]" />}
                              {t.status === 'failed' && <AlertCircle className="size-2.5 text-[#f5220b]" />}
                              {STATUS_LABEL[t.status] ?? t.status}
                            </span>
                            {live && (
                              <button
                                onClick={() => cancel(t.id)}
                                className="rounded p-1 text-zinc-500 transition-colors duration-150 hover:bg-[#f5220b]/10 hover:text-[#f5220b]"
                                title="Cancel Task"
                              >
                                <Ban className="size-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Progress bar */}
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                          <div
                            className={
                              'h-full rounded-full transition-all duration-200 ' +
                              (t.status === 'failed'
                                ? 'bg-[#f5220b]'
                                : t.status === 'cancelled'
                                  ? 'bg-zinc-600'
                                  : 'bg-[#3ef50b]')
                            }
                            style={{ width: `${pct}%` }}
                          />
                        </div>

                        {t.error && (
                          <p className="font-mono text-[11px] text-[#f5220b] leading-tight break-all">{t.error}</p>
                        )}
                        {t.status === 'running' && (
                          <div className="flex items-center justify-between font-mono text-[10px] text-zinc-500">
                            <span>PROGRESS: {pct}%</span>
                            <span className="text-zinc-400">DOWNLOADING</span>
                          </div>
                        )}
                      </div>
                    )
                  })
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  )
}
