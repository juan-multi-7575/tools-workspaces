import { useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { ArrowDownToLine, Ban, Copy, Smartphone } from 'lucide-react'
import { api, type DownloadTask } from '../lib/api'
import DownloadOptionsForm, { type DownloadOptions, cleanOptions } from '../components/downloads/DownloadOptions'

const STATUS_LABEL: Record<string, string> = {
  queued: 'Queued',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

export default function RemoteControlPage() {
  const [token, setToken] = useState('')
  const [connectUrl, setConnectUrl] = useState('')
  const [url, setUrl] = useState('')
  const [options, setOptions] = useState<DownloadOptions>({})
  const [tasks, setTasks] = useState<DownloadTask[]>([])
  const [copied, setCopied] = useState(false)
  const sources = useRef<Record<string, EventSource>>({})

  useEffect(() => {
    api.getRemoteInfo().then((info) => {
      setToken(info.token)
      setConnectUrl(info.connect_url)
    })
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
          /* ignore */
        }
      }
    }
  }, [tasks])

  useEffect(() => {
    const current = sources.current
    return () => Object.values(current).forEach((s) => s.close())
  }, [])

  const add = async () => {
    if (!url.trim() || !token) return
    const res = await api.remoteEnqueue({ token, url: url.trim(), ...cleanOptions(options) })
    setUrl('')
    setOptions({})
    setTasks((prev) => [...prev, { id: res.id, status: res.status, progress: {} }])
  }

  const cancel = async (id: string) => {
    if (!token) return
    await api.remoteCancel(id, token)
  }

  const copy = () => {
    navigator.clipboard?.writeText(connectUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <h1 className="flex items-center gap-2 text-3xl font-black tracking-tight text-slate-50">
          <Smartphone className="h-7 w-7 text-port-in" /> Remote control
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Scan the QR with your phone to control downloads from the same network.
        </p>
      </header>

      <section className="rounded-2xl border border-garage-800 bg-garage-900/60 p-6">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <div className="rounded-xl bg-white p-3">
            {connectUrl ? <QRCodeSVG value={connectUrl} size={160} /> : <div className="h-[160px] w-[160px]" />}
          </div>
          <div className="flex-1">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Connect URL</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all rounded-lg border border-garage-800 bg-garage-950 px-3 py-2 text-xs text-slate-300">
                {connectUrl || 'loading…'}
              </code>
              <button
                onClick={copy}
                className="rounded-lg border border-garage-700 bg-garage-900 p-2 text-slate-300 transition-colors hover:bg-garage-800"
                title="Copy"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
            {copied && <p className="mt-1 text-xs text-emerald-400">Copied!</p>}
            <p className="mt-3 text-xs text-slate-500">
              Token: <span className="font-mono text-slate-400">{token ? `${token.slice(0, 6)}…` : '—'}</span> (regenerated each boot)
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-garage-800 bg-garage-900/60 p-6">
        <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-slate-100">
          <ArrowDownToLine className="h-4 w-4 text-port-in" /> New download
        </h2>
        <div className="flex items-center gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="https://… video or playlist URL"
            className="flex-1 rounded-lg border border-garage-800 bg-garage-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-port-in"
          />
          <button
            onClick={add}
            disabled={!url.trim() || !token}
            className="inline-flex items-center gap-1 rounded-lg bg-cyan-500 px-3 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-cyan-400 disabled:opacity-40"
          >
            <ArrowDownToLine className="h-3.5 w-3.5" /> Add
          </button>
        </div>
        <DownloadOptionsForm value={options} onChange={setOptions} />
      </section>

      {tasks.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Remote downloads</h2>
          {tasks
            .slice()
            .reverse()
            .map((t) => {
              const pct = typeof (t.progress as { percent?: number }).percent === 'number' ? Math.round((t.progress as { percent?: number }).percent as number) : t.status === 'completed' ? 100 : 0
              const live = t.status === 'queued' || t.status === 'running'
              return (
                <div key={t.id} className="rounded-xl border border-garage-800 bg-garage-900/50 p-3">
                  <div className="mb-2 flex items-center justify-between">
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
                        <button onClick={() => cancel(t.id)} className="rounded-md p-1 text-slate-500 hover:text-red-400" title="Cancel">
                          <Ban className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-garage-800">
                    <div className={'h-full rounded-full transition-all ' + (t.status === 'failed' ? 'bg-red-500' : 'bg-cyan-500')} style={{ width: `${pct}%` }} />
                  </div>
                  {t.error && <p className="mt-2 text-xs text-red-400">{t.error}</p>}
                </div>
              )
            })}
        </section>
      )}
    </div>
  )
}
