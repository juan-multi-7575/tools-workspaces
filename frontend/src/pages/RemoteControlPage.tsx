import { useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import {
  Ban,
  Copy,
  Check,
  Radio,
} from 'lucide-react'
import { api, type DownloadTask } from '../lib/api'

const STATUS_LABEL: Record<string, string> = {
  queued: 'Queued',
  running: 'Downloading',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

export default function RemoteControlPage() {
  const [token, setToken] = useState('')
  const [connectUrl, setConnectUrl] = useState('')
  const [tasks, setTasks] = useState<DownloadTask[]>([])
  const [copied, setCopied] = useState(false)
  const [tokenCopied, setTokenCopied] = useState(false)
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
    <div className="mx-auto max-w-4xl space-y-6 text-[#4E220F]">
      {/* Header */}
      <div className="border-b border-[#B0BA99] pb-4">
        <div className="flex items-center gap-2.5">
          <h1 className="text-xl font-bold tracking-tight text-[#4E220F]">LAN Remote Control</h1>
          <span className="font-mono text-xs px-2.5 py-0.5 rounded-full bg-[#B0BA99]/40 border border-[#B0BA99] text-[#4E220F] flex items-center gap-1.5 font-bold">
            <span className="h-2 w-2 rounded-full bg-[#9D6638] animate-pulse" />
            BROADCASTING
          </span>
        </div>
        <p className="mt-1 text-xs text-[#7C5339]">
          Pair with any mobile device or secondary computer on the local network for remote download control.
        </p>
        <ol className="mt-2 space-y-1 text-[11px] text-[#7C5339] list-decimal list-inside">
          <li>Connect your phone to the same Wi-Fi as this machine.</li>
          <li>Scan the QR code below (it encodes the connection URL).</li>
          <li>Enter the session token when asked — a new token is issued on every server restart.</li>
        </ol>
      </div>

      {/* QR Pairing & Connection Details */}
      <section className="rounded-2xl border-2 border-[#B0BA99] bg-[#FFFFFF] p-5 space-y-4 shadow-sm">
        <div className="flex items-center gap-2.5 border-b border-[#B0BA99]/60 pb-3">
          <div className="flex size-8 items-center justify-center rounded-xl bg-[#9D6638] text-[#FDFBF7]">
            <Radio className="size-4" />
          </div>
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#4E220F]">
              LAN Device Pairing
            </h2>
            <p className="font-mono text-[10px] text-[#7C5339]">SCAN QR CODE TO ACCESS REMOTE CLIENT</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-6 pt-1">
          <div className="flex flex-col items-center gap-2">
            <div className="rounded-2xl border-2 border-[#B0BA99] bg-[#F7F1DE] p-4 shadow-sm">
              {connectUrl ? (
                <QRCodeSVG value={connectUrl} size={140} fgColor="#4E220F" bgColor="#F7F1DE" />
              ) : (
                <div className="size-[140px] bg-[#EDE5CD] flex items-center justify-center text-[#7C5339] font-mono text-xs">
                  Generating…
                </div>
              )}
            </div>
            <p className="font-mono text-[10px] text-[#7C5339] text-center">QR encodes the connection URL above</p>
          </div>

          <div className="flex-1 space-y-3.5 w-full">
            <div>
              <label className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#7C5339] block mb-1">
                Direct Connection URL
              </label>
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all rounded-xl border border-[#B0BA99] bg-[#F7F1DE]/70 px-3.5 py-2 font-mono text-xs text-[#4E220F] select-all font-semibold">
                  {connectUrl || 'Connecting to local host…'}
                </code>
                <button
                  onClick={copy}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-[#B0BA99] bg-[#EDE5CD] px-3 py-2 text-xs font-bold text-[#4E220F] transition-all hover:bg-[#B0BA99]/40 active:scale-95 shadow-xs"
                  title="Copy URL"
                >
                  {copied ? <Check className="size-3.5 text-[#9D6638]" /> : <Copy className="size-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            {isLocalhostUrl && (
              <div className="rounded-xl border border-[#9D6638]/50 bg-[#F5C86B]/20 p-3 text-[11px] text-[#4E220F] leading-relaxed">
                <span className="font-bold">Heads up:</span> you opened this page via localhost, so this URL and QR
                only work on this machine. To pair a phone, open this page through your LAN address instead
                (e.g. <span className="font-mono">http://&lt;your-lan-ip&gt;:5173/remote</span>) and re-scan.
              </div>
            )}
            <div className="rounded-xl border border-[#B0BA99]/70 bg-[#EDE5CD]/50 p-3 font-mono text-[11px] text-[#7C5339] space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span>SESSION TOKEN:</span>
                <span className="flex items-center gap-2">
                  <span className="text-[#4E220F] font-bold">{token ? `${token.slice(0, 10)}…` : '—'}</span>
                  <button
                    onClick={copyToken}
                    disabled={!token}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#B0BA99] bg-[#FFFFFF] px-2 py-1 text-[10px] font-bold text-[#4E220F] hover:bg-[#EDE5CD] transition-colors disabled:opacity-40"
                    title="Copy full session token"
                  >
                    {tokenCopied ? <Check className="size-3 text-[#9D6638]" /> : <Copy className="size-3" />}
                    {tokenCopied ? 'Copied' : 'Copy token'}
                  </button>
                </span>
              </div>
              <p className="text-[10px] text-[#7C5339]">
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
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#7C5339]">
              Remote Download Pool
            </span>
            <span className="font-mono text-[10px] text-[#7C5339]">{tasks.length} total tasks</span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {tasks.map((t) => (
              <div
                key={t.id}
                className="rounded-xl border border-[#B0BA99] bg-[#FFFFFF] p-4 shadow-xs space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-[#4E220F]">Task: {t.id}</span>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        t.status === 'completed'
                          ? 'bg-[#B0BA99]/40 text-[#4E220F] border border-[#B0BA99]'
                          : t.status === 'failed'
                            ? 'bg-[#A83232]/15 text-[#A83232] border border-[#A83232]/30'
                            : 'bg-[#9D6638]/20 text-[#9D6638] border border-[#9D6638]/30'
                      }`}
                    >
                      {STATUS_LABEL[t.status] ?? t.status}
                    </span>
                    {(t.status === 'queued' || t.status === 'running') && (
                      <button
                        onClick={() => cancel(t.id)}
                        className="rounded p-1 text-[#7C5339] hover:bg-[#A83232]/15 hover:text-[#A83232]"
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
  )
}
