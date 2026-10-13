import { useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import {
  Ban,
  Copy,
  Check,
  Radio,
} from 'lucide-react'
import { api, resolveUrl, type DownloadTask } from '../lib/api'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

const STATUS_LABEL: Record<string, string> = {
  queued: 'Queued',
  running: 'Downloading',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

export default function RemoteControlPage() {
  useDocumentTitle('Tools Garage — remote control')

  const [token, setToken] = useState('')
  const [connectUrl, setConnectUrl] = useState('')
  const [tasks, setTasks] = useState<DownloadTask[]>([])
  const [copied, setCopied] = useState(false)
  const [tokenCopied, setTokenCopied] = useState(false)
  const [rotating, setRotating] = useState(false)

  const rotateToken = async () => {
    if (!window.confirm('Rotate the session token? Paired devices will need the new token.')) return
    setRotating(true)
    try {
      const res = await fetch(resolveUrl('/api/remote/rotate'), { method: 'POST' })
      const data = await res.json()
      if (data?.token) setToken(data.token)
    } catch {
      /* ignore */
    } finally {
      setRotating(false)
    }
  }
  const isLocalhostUrl = /^(https?:\/\/)(localhost|127\.0\.0\.1)(:\d+)?\//i.test(connectUrl)

  const copyToken = () => {
    if (!token) return
    navigator.clipboard?.writeText(token).catch(() => {})
    setTokenCopied(true)
    setTimeout(() => setTokenCopied(false), 1500)
  }
  const sources = useRef<Record<string, EventSource>>({})

  useEffect(() => {
    api.getRemoteInfo().then((info) => {
      setToken(info.token)
      setConnectUrl(info.connect_url)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    for (const t of tasks) {
      if (sources.current[t.id]) continue
      try {
        const es = new EventSource(api.downloadStreamUrl(t.id))
        sources.current[t.id] = es
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
              delete sources.current[t.id]
            }
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* ignore */
      }
    }
  }, [tasks])

  useEffect(() => {
    const current = sources.current
    return () => Object.values(current).forEach((s) => s.close())
  }, [])

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
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto max-w-4xl space-y-6 text-brand-espresso">
      {/* Header */}
      <div className="border-b border-brand-sage pb-4">
        <div className="flex items-center gap-2.5">
          <h1 className="text-xl font-bold tracking-tight text-brand-espresso">LAN Remote Control</h1>
          {!isLocalhostUrl ? (
            <span className="font-mono text-xs px-2.5 py-0.5 rounded-full bg-brand-sage/40 border border-brand-sage text-brand-espresso flex items-center gap-1.5 font-bold">
              <span className="h-2 w-2 rounded-full bg-brand-caramel animate-pulse" />
              BROADCASTING
            </span>
          ) : (
            <span className="font-mono text-xs px-2.5 py-0.5 rounded-full bg-brand-cream-dark border border-brand-sage text-brand-caramel-text flex items-center gap-1.5 font-bold">
              <span className="h-2 w-2 rounded-full bg-brand-sage" />
              LOCAL ONLY
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-brand-caramel-text">
          Pair with any mobile device or secondary computer on the local network for remote download control.
        </p>
        <ol className="mt-2 space-y-1 text-xs text-brand-caramel-text list-decimal list-inside">
          <li>Connect your phone to the same Wi-Fi as this machine.</li>
          <li>Scan the QR code below (it encodes the connection URL).</li>
          <li>Enter the session token when asked — a new token is issued on every server restart.</li>
        </ol>
      </div>

      {/* QR Pairing & Connection Details */}
      <section className="rounded-2xl border-2 border-brand-sage bg-surface-white p-5 space-y-4 shadow-sm">
        <div className="flex items-center gap-2.5 border-b border-brand-sage/60 pb-3">
          <div className="flex size-8 items-center justify-center rounded-xl bg-brand-caramel text-brand-cream-light">
            <Radio className="size-4" />
          </div>
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-brand-espresso">
              LAN Device Pairing
            </h2>
            <p className="font-mono text-xs text-brand-caramel-text">SCAN QR CODE TO ACCESS REMOTE CLIENT</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-6 pt-1">
          <div className="flex flex-col items-center gap-2">
            <div className="rounded-2xl border-2 border-brand-sage bg-brand-cream p-4 shadow-sm">
              {connectUrl ? (
                <QRCodeSVG
                  value={connectUrl}
                  size={140}
                  fgColor="var(--color-brand-espresso)"
                  bgColor="var(--color-brand-cream)"
                  title={`QR code for the remote client at ${connectUrl}`}
                  role="img"
                  aria-label={`QR code for the remote client at ${connectUrl}`}
                />
              ) : (
                <div className="size-[140px] bg-brand-cream-dark flex items-center justify-center text-brand-caramel-text font-mono text-xs">
                  Generating…
                </div>
              )}
            </div>
            <p className="font-mono text-xs text-brand-caramel-text text-center">QR encodes the connection URL shown here</p>
          </div>

          <div className="flex-1 space-y-3.5 w-full">
            <div>
              <label className="font-mono text-xs font-bold uppercase tracking-wider text-brand-caramel-text block mb-1">
                Direct Connection URL
              </label>
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all rounded-xl border border-brand-sage bg-brand-cream/70 px-3.5 py-2 font-mono text-xs text-brand-espresso select-all font-semibold">
                  {connectUrl || 'Connecting to local host…'}
                </code>
                <button
                  onClick={copy}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-brand-sage bg-brand-cream-dark px-3 py-2 text-xs font-bold text-brand-espresso transition-all hover:bg-brand-sage/40 active:scale-95 shadow-xs"
                  title="Copy URL"
                >
                  {copied ? <Check className="size-3.5 text-brand-caramel" /> : <Copy className="size-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            {isLocalhostUrl && (
              <div className="rounded-xl border border-brand-caramel/50 bg-warning/20 p-3 text-xs text-brand-espresso leading-relaxed">
                <span className="font-bold">Heads up:</span> you opened this page via localhost, so this URL and QR
                only work on this machine. To pair a phone, open this page through your LAN address instead
                (e.g. <span className="font-mono">http://&lt;your-lan-ip&gt;:8000/remote</span>) and re-scan.
              </div>
            )}
            <div className="rounded-xl border border-brand-sage/70 bg-brand-cream-dark/50 p-3 font-mono text-xs text-brand-caramel-text space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span>SESSION TOKEN:</span>
                <span className="flex items-center gap-2">
                  <span className="text-brand-espresso font-bold">{token ? `${token.slice(0, 10)}…` : '—'}</span>
                  <button
                    onClick={copyToken}
                    disabled={!token}
                    className="inline-flex items-center gap-1 rounded-lg border border-brand-sage bg-surface-white px-2 py-1 text-xs font-bold text-brand-espresso hover:bg-brand-cream-dark transition-colors disabled:opacity-40"
                    title="Copy full session token"
                  >
                    {tokenCopied ? <Check className="size-3 text-brand-caramel" /> : <Copy className="size-3" />}
                    {tokenCopied ? 'Copied' : 'Copy token'}
                  </button>
                  <button
                    onClick={rotateToken}
                    disabled={rotating}
                    className="inline-flex items-center gap-1 rounded-lg border border-accent-contrast/40 bg-transparent px-2 py-1 text-xs font-bold text-accent-contrast hover:bg-accent-contrast/10 transition-colors disabled:opacity-40"
                    title="Rotate session token"
                  >
                    {rotating ? 'Rotating…' : 'Rotate token'}
                  </button>
                </span>
              </div>
              <p className="text-xs text-brand-caramel-text">
                A fresh cryptographic token is provisioned on server initialization.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Remote Downloads List */}
      {tasks.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-brand-caramel-text">
              Remote Download Pool
            </span>
            <span className="font-mono text-xs text-brand-caramel-text">{tasks.length} total tasks</span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {tasks.map((t) => (
              <div
                key={t.id}
                className="rounded-xl border border-brand-sage bg-surface-white p-4 shadow-xs space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-brand-espresso">Task: {t.id}</span>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`font-mono text-xs font-bold px-2 py-0.5 rounded-full ${
                        t.status === 'completed'
                          ? 'bg-brand-sage/40 text-brand-espresso border border-brand-sage'
                          : t.status === 'failed'
                            ? 'bg-accent-contrast/15 text-accent-contrast border border-accent-contrast/30'
                            : 'bg-brand-caramel/20 text-brand-caramel border border-brand-caramel/30'
                      }`}
                    >
                      {STATUS_LABEL[t.status] ?? t.status}
                    </span>
                    {(t.status === 'queued' || t.status === 'running') && (
                      <button
                        onClick={() => cancel(t.id)}
                        className="rounded p-1 text-brand-caramel-text hover:bg-accent-contrast/15 hover:text-accent-contrast"
                        title="Cancel"
                      >
                        <Ban className="size-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
    </div>
  )
}
