import { useEffect, useRef, useState } from 'react'
import { api, type DownloadTask } from '../../lib/api'
import { X, Plus, ArrowDownToLine, Ban } from 'lucide-react'
import DownloadOptionsForm, { type DownloadOptions, cleanOptions } from './DownloadOptions'

const STATUS_LABEL: Record<string, string> = {
  queued: 'Queued',
  running: 'Running',
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
    await api.enqueueDownload({ url: url.trim(), ...cleanOptions(options) })
    setUrl('')
    setOptions({})
    refresh()
  }

  const cancel = async (id: string) => {
    await api.cancelDownload(id)
    refresh()
  }

  const active = tasks.filter((t) => t.status === 'queued' || t.status === 'running').length

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 shadow-2xl transition-colors hover:bg-cyan-400"
        title="Download manager"
      >
        <ArrowDownToLine className="h-4 w-4" />
        Downloads
        {active > 0 && (
          <span className="ml-1 rounded-full bg-slate-950 px-2 py-0.5 text-xs text-cyan-300">{active}</span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="relative flex h-full w-[420px] max-w-[92vw] flex-col border-l border-garage-800 bg-garage-950 shadow-2xl">
            <header className="flex items-center justify-between border-b border-garage-800 px-5 py-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200">Download manager</h2>
              <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-garage-800 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="flex items-center gap-2 border-b border-garage-800 px-5 py-4">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && add()}
                placeholder="https://… video or playlist URL"
                className="flex-1 rounded-lg border border-garage-800 bg-garage-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-port-in"
              />
              <button
                onClick={add}
                disabled={!url.trim()}
                className="inline-flex items-center gap-1 rounded-lg bg-cyan-500 px-3 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-cyan-400 disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            </div>

            <DownloadOptionsForm value={options} onChange={setOptions} />

            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {tasks.length === 0 ? (
                <p className="text-sm text-slate-500">No downloads yet. Paste a URL to start.</p>
              ) : (
                tasks
                  .slice()
                  .reverse()
                  .map((t) => {
                    const pct = progressPercent(t)
                    const live = t.status === 'running' || t.status === 'queued'
                    return (
                      <div key={t.id} className="rounded-xl border border-garage-800 bg-garage-900/50 p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="truncate font-mono text-xs text-slate-300">{t.id}</span>
                          <div className="flex items-center gap-2">
                            <span
                              className={
                                'rounded-full px-2 py-0.5 text-[11px] font-medium ' +
                                (t.status === 'completed'
                                  ? 'bg-emerald-500/15 text-emerald-400'
                                  : t.status === 'failed'
                                    ? 'bg-red-500/15 text-red-400'
                                    : t.status === 'cancelled'
                                      ? 'bg-slate-500/15 text-slate-400'
                                      : 'bg-cyan-500/15 text-cyan-300')
                              }
                            >
                              {STATUS_LABEL[t.status] ?? t.status}
                            </span>
                            {live && (
                              <button
                                onClick={() => cancel(t.id)}
                                className="rounded-md p-1 text-slate-500 transition-colors hover:bg-garage-800 hover:text-red-400"
                                title="Cancel"
                              >
                                <Ban className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-garage-800">
                          <div
                            className={'h-full rounded-full transition-all ' + (t.status === 'failed' ? 'bg-red-500' : 'bg-cyan-500')}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        {t.error && <p className="mt-2 text-xs text-red-400">{t.error}</p>}
                        {t.status === 'running' && (
                          <p className="mt-1 text-[11px] text-slate-500">{JSON.stringify(t.progress)}</p>
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
