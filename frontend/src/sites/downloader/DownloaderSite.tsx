import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowDownToLine, ArrowLeft, ExternalLink, RefreshCw, X } from 'lucide-react'
import { api, errorMessage, resolveUrl, type DownloadTask, type ToolManifest } from '../../lib/api'
import { depDisplayBytes } from '../../lib/depsApi'
import { useToolExecute } from '../../hooks/useToolExecute'
import { useToolDeps } from '../../hooks/useToolDeps'
import DependencyGate from '../../components/deps/DependencyGate'
import ToolResultPanel from '../../components/tools/ToolResultPanel'
import { ToolForm } from '../../lib/toolForms'
import './downloader.css'

const ID = 'media.download.yt-dlp'
const HELPERS = [
  ['media.download.resolve', 'Resolve a media URL'],
  ['media.download.format_select', 'Select a format'],
  ['media.subtitle.fetch', 'Fetch subtitles'],
  ['media.thumbnail.get', 'Get a thumbnail'],
] as const

function useManifest(id: string) {
  const [manifest, setManifest] = useState<ToolManifest | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    api.getTool(id).then((value) => live && setManifest(value)).catch((cause) => live && setError(errorMessage(cause)))
    return () => { live = false }
  }, [id])
  return { manifest, error }
}

function defaults(schema: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(schema).flatMap(([key, field]) => {
    if (field && typeof field === 'object' && 'default' in field) return [[key, (field as { default: unknown }).default]]
    return []
  }))
}

function byteText(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  let n = value, unit = 0
  while (n >= 1024 && unit < units.length - 1) { n /= 1024; unit += 1 }
  return `${n.toFixed(unit ? 1 : 0)} ${units[unit]}`
}

export function DownloaderHero({ manifest }: { manifest: ToolManifest }) {
  const navigate = useNavigate()
  const [heroUrl, setHeroUrl] = useState('')
  const [heroProbe, setHeroProbe] = useState<Record<string, unknown> | null>(null)
  const [heroProbeError, setHeroProbeError] = useState<string | null>(null)
  const [heroProbing, setHeroProbing] = useState(false)
  const probeHeroUrl = async () => {
    setHeroProbe(null); setHeroProbeError(null); setHeroProbing(true)
    try { setHeroProbe(await api.getVideoInfo(heroUrl.trim())) }
    catch (cause) { setHeroProbeError(errorMessage(cause)) }
    finally { setHeroProbing(false) }
  }
  return <main className="dl-root dl-hero">
    <header className="dl-wordmark"><span className="dl-mark"/> Media desk <span className="dl-wordmark__id">{ID}</span></header>
    <section className="dl-hero__body">
      <div><p className="dl-kicker">A catalogue for the open web</p><h1>Bring media<br/>into reach.</h1><p className="dl-lede">{manifest.description} Probe a link, choose its output and follow each download through the queue.</p>
        <div className="dl-actions"><button className="dl-button" onClick={() => navigate(`/t/${ID}/workspace`)}><ArrowDownToLine size={16}/> Open downloader</button></div>
        <div className="dl-hero-probe"><label htmlFor="dl-hero-url">Or inspect a media URL</label><div><input id="dl-hero-url" value={heroUrl} placeholder="Paste a URL to inspect" onChange={(event) => setHeroUrl(event.target.value)}/><button onClick={() => void probeHeroUrl()} disabled={!heroUrl.trim() || heroProbing}>{heroProbing ? 'Checking…' : 'Probe'}</button></div>{heroProbeError && <p className="dl-error">{heroProbeError}</p>}{heroProbe && <p>{typeof heroProbe.title === 'string' && heroProbe.title ? heroProbe.title : 'Metadata unavailable'}{typeof heroProbe.author_name === 'string' && heroProbe.author_name ? ` · ${heroProbe.author_name}` : ''}</p>}</div>
      </div>
      <div className="dl-record" aria-hidden="true"><div className="dl-record__label">MEDIA / INDEX 01</div><div className="dl-record__disc"><i/></div><div className="dl-record__caption"><span>QUEUE / LOCAL</span><span>01—04</span></div></div>
    </section>
  </main>
}

export function DownloaderParameterControls({ schema, value, onChange }: {
  schema: Record<string, unknown>
  value: Record<string, unknown>
  onChange: (next: Record<string, unknown>) => void
}) {
  return <ToolForm toolId={`${ID}.manifest`} schema={schema} value={value} onChange={onChange} />
}

export function DownloaderUrlProbe({ value, onChange, onProbe, error, result }: {
  value: string
  onChange: (value: string) => void
  onProbe: () => void
  error: string | null
  result: Record<string, unknown> | null
}) {
  return <div className="dl-probe" data-param-key="url"><label htmlFor="dl-url-probe">Media URL</label><div className="dl-probe__line"><input id="dl-url-probe" value={value} placeholder="https://…" onChange={(event) => onChange(event.target.value)}/><button onClick={onProbe} disabled={!value.trim()}>Probe</button></div>
    {error && <p className="dl-error">{error}</p>}
    {result && <div className="dl-metadata">{typeof result.thumbnail_url === 'string' && <img src={result.thumbnail_url} alt=""/>}<div><strong>{typeof result.title === 'string' && result.title ? result.title : 'Metadata unavailable'}</strong>{typeof result.author_name === 'string' && result.author_name && <span>{result.author_name}</span>}{typeof result.duration === 'number' && <span>{Math.round(result.duration)} seconds</span>}</div></div>}
  </div>
}

export function DownloaderTaskRow({ task, onCancel, onRemove }: { task: DownloadTask; onCancel: () => void; onRemove: () => void }) {
  const live = task.progress ?? {}
  const percent = typeof live.percent === 'number' && Number.isFinite(live.percent) ? live.percent : null
  const got = byteText(live.downloaded_bytes)
  const total = byteText(live.total_bytes)
  const name = task.result?.artifacts?.[0]?.name ?? task.params?.url ?? task.id
  return <article className="dl-row">
    <div className="dl-row__top">
      <div className="dl-row__name" title={name}>{name}</div>
      <span className={`dl-status dl-status--${task.status}`}>{task.status}</span>
      <div className="dl-row__actions">
        {(task.status === 'queued' || task.status === 'running') && <button onClick={onCancel} aria-label={`Cancel ${name}`}><X size={15}/></button>}
        {!['queued', 'running'].includes(task.status) && <button onClick={onRemove} aria-label={`Remove ${name}`}><X size={15}/></button>}
      </div>
    </div>
    {task.error && <p className="dl-error">{task.error}</p>}
    <div className="dl-progress" aria-label="Download progress" data-indeterminate={percent === null ? 'true' : undefined}>
      {percent !== null ? <span style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}/> : percent === null ? <span className="dl-progress__indeterminate"/> : null}
    </div>
    <div className="dl-row__meta">
      <span>{percent !== null ? `${percent}%` : got || total ? `${got ?? '—'} / ${total ?? '—'}` : 'No byte progress reported'}</span>
      {percent !== null && (got || total) && <span>{got ?? '—'} / {total ?? '—'}</span>}
      {typeof live.speed === 'string' && <span>{live.speed}</span>}
      {typeof live.eta === 'string' && <span>ETA {live.eta}</span>}
      {task.result?.artifacts?.map((artifact) => <a key={artifact.path} href={resolveUrl(`/api/artifacts/content?path=${encodeURIComponent(artifact.path)}`)}>{artifact.name} <ExternalLink size={11}/></a>)}
    </div>
  </article>
}

function Helper({ id, title }: { id: string; title: string }) {
  const { manifest, error } = useManifest(id)
  const execute = useToolExecute(id)
  const [params, setParams] = useState<Record<string, unknown>>({})
  useEffect(() => { if (manifest) setParams((old) => Object.keys(old).length ? old : defaults(manifest.parameters_schema ?? {})) }, [manifest])
  return <details className="dl-helper">
    <summary>{title}<span>{id}</span></summary>
    {error ? <pre className="dl-error">{error}</pre> : manifest ? <>
      <ToolForm toolId={id} schema={manifest.parameters_schema ?? {}} value={params} onChange={(next) => setParams((old) => ({ ...old, ...next }))}/>
      <button className="dl-button dl-button--small" disabled={execute.busy} onClick={() => void execute.run(params)}>{execute.busy ? 'Running…' : 'Run helper'}</button>
      {execute.state.phase !== 'idle' && <ToolResultPanel state={execute.state} toolId={id} toolName={manifest.name} />}
    </> : <p>Loading the helper manifest…</p>}
  </details>
}

export default function DownloaderSite({ siteState }: { siteState: 'hero' | 'workspace' }) {
  const navigate = useNavigate()
  const { manifest, error } = useManifest(ID)
  const deps = useToolDeps(ID)
  const [params, setParams] = useState<Record<string, unknown>>({})
  const [probe, setProbe] = useState<Record<string, unknown> | null>(null)
  const [probeError, setProbeError] = useState<string | null>(null)
  const [queue, setQueue] = useState<DownloadTask[]>([])
  const [queueError, setQueueError] = useState<string | null>(null)
  const [settings, setSettings] = useState<{ max_concurrent: number } | null>(null)
  const [settingDraft, setSettingDraft] = useState('')
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null)
  const [helperOpen, setHelperOpen] = useState(false)
  const streams = useRef(new Map<string, EventSource>())
  const queueActive = useMemo(() => queue.some((task) => task.status === 'queued' || task.status === 'running'), [queue])

  useEffect(() => { if (manifest) setParams((old) => Object.keys(old).length ? old : defaults(manifest.parameters_schema ?? {})) }, [manifest])
  const refresh = useCallback(async () => {
    try {
      const result = await api.listDownloads()
      for (const task of result.downloads) {
        if (['completed', 'failed', 'cancelled'].includes(task.status)) {
          streams.current.get(task.id)?.close()
          streams.current.delete(task.id)
        }
      }
      setQueue(result.downloads)
      setQueueError(null)
    }
    catch (cause) { setQueueError(errorMessage(cause)) }
  }, [])
  useEffect(() => {
    const activeStreams = streams.current
    void refresh()
    api.getDownloadSettings().then((value) => { setSettings(value); setSettingDraft(String(value.max_concurrent)) }).catch((cause) => setSettingsMessage(errorMessage(cause)))
    return () => { for (const stream of activeStreams.values()) stream.close(); activeStreams.clear() }
  }, [refresh])
  useEffect(() => {
    for (const task of queue) {
      if (!['queued', 'running'].includes(task.status) || streams.current.has(task.id)) continue
      const stream = new EventSource(api.downloadStreamUrl(task.id)); streams.current.set(task.id, stream)
      stream.onmessage = (event) => {
        try {
          const update = JSON.parse(event.data) as Record<string, unknown>
          setQueue((items) => items.map((current) => current.id === task.id ? { ...current, status: typeof update.status === 'string' ? update.status : current.status, progress: update } : current))
          if (['completed', 'failed', 'cancelled'].includes(String(update.status))) { stream.close(); streams.current.delete(task.id); void refresh() }
        } catch { /* malformed frames are ignored; the next list refresh is authoritative */ }
      }
      stream.onerror = () => { stream.close(); streams.current.delete(task.id); void refresh() }
    }
  }, [queue, refresh])
  useEffect(() => { if (!queueActive) return; const timer = window.setInterval(() => void refresh(), 4000); return () => window.clearInterval(timer) }, [queueActive, refresh])

  const probeUrl = async () => {
    setProbe(null); setProbeError(null)
    try { setProbe(await api.getVideoInfo(String(params.url ?? '').trim())) }
    catch (cause) { setProbeError(errorMessage(cause)) }
  }
  const enqueue = async () => {
    try { await api.enqueueDownload(params); await refresh() }
    catch (cause) { setQueueError(errorMessage(cause)) }
  }
  const cancel = async (id: string) => { try { await api.cancelDownload(id); await refresh() } catch (cause) { setQueueError(errorMessage(cause)) } }
  const remove = async (id: string) => { try { await api.removeDownload(id); await refresh() } catch (cause) { setQueueError(errorMessage(cause)) } }
  const saveSettings = async () => {
    try { const value = await api.updateDownloadSettings(Number(settingDraft)); setSettings(value); setSettingsMessage(`Maximum concurrent downloads: ${value.max_concurrent}`) }
    catch (cause) { setSettingsMessage(errorMessage(cause)) }
  }

  if (error) return <main className="dl-root"><pre className="dl-error">{error}</pre></main>
  if (!manifest) return <main className="dl-root"><p>Loading downloader manifest…</p></main>
  if (siteState === 'hero') return <DownloaderHero manifest={manifest} />

  return <main className="dl-root dl-workspace">
    <header className="dl-header"><button className="dl-home" onClick={() => navigate('/')}><ArrowLeft size={15}/> Index</button><div className="dl-header__title"><span className="dl-mark"/><strong>Media desk</strong><span>{ID}</span></div><button className="dl-refresh" onClick={() => void refresh()}><RefreshCw size={14}/> Refresh queue</button></header>
    <div className="dl-columns">
      <section className="dl-intake">
        <p className="dl-kicker">01 / Intake</p><h1>Download media</h1><p className="dl-subtitle">Paste a URL, inspect its metadata, then add it to the queue.</p>
        <DownloaderUrlProbe value={String(params.url ?? '')} onChange={(url) => setParams((old) => ({ ...old, url }))} onProbe={() => void probeUrl()} error={probeError} result={probe}/>
        <details className="dl-options" open><summary>Format and options <span>{Object.keys(manifest.parameters_schema ?? {}).length} parameters</span></summary>
          {/* url is hand-built above; the other 25 manifest fields, including the declared download_mode control, use ToolForm's manifest-driven fallback. */}
          <DownloaderParameterControls schema={Object.fromEntries(Object.entries(manifest.parameters_schema ?? {}).filter(([key]) => key !== 'url'))} value={params} onChange={(next) => setParams((old) => ({ ...old, ...next }))}/>
        </details>
        <div className="dl-enqueue"><button className="dl-button" onClick={() => void enqueue()} disabled={!String(params.url ?? '').trim()}><ArrowDownToLine size={16}/> Add to queue</button><p>Settings are sent with this queue item.</p></div>
      </section>
      <section className="dl-queue"><div className="dl-queue__head"><div><p className="dl-kicker">02 / Now playing</p><h2>Download queue</h2></div><span className="dl-count">{queue.length} items</span></div>
        <div className="dl-queue__list">{queueError && <p role="alert" className="dl-error">{queueError}</p>}{queue.length ? queue.map((task) => <DownloaderTaskRow key={task.id} task={task} onCancel={() => void cancel(task.id)} onRemove={() => void remove(task.id)}/>) : <div className="dl-empty"><span>—</span><p>Your queue is empty.</p><small>Items you add will appear here with backend-reported status and byte progress.</small></div>}</div>
        <div className="dl-settings"><label>Concurrent downloads <span>{settings ? `Current: ${settings.max_concurrent}` : ''}</span></label><div><input aria-label="Maximum concurrent downloads" type="number" min="1" value={settingDraft} onChange={(event) => setSettingDraft(event.target.value)}/><button onClick={() => void saveSettings()}>Save</button></div>{settingsMessage && <small>{settingsMessage}</small>}</div>
        <div className="dl-helpers"><button onClick={() => setHelperOpen((open) => !open)}>Media utilities <span>{helperOpen ? '−' : '+'}</span></button>{helperOpen && <div>{HELPERS.map(([id, title]) => <Helper key={id} id={id} title={title}/>)}</div>}</div>
      </section>
    </div>
    <aside className="dl-dependencies"><div className="dl-media-size">{(() => { const media = deps.data?.deps.find((entry) => entry.dep_id === 'conda.media'); if (!media) return null; const bytes = depDisplayBytes(media); return <span><strong>conda.media</strong> · {bytes.bytes === null ? 'size unknown' : `${bytes.bytes.toLocaleString()} bytes ${bytes.measured ? 'measured' : 'catalog estimate'}`}</span> })()}</div><DependencyGate toolId={ID} state={deps} accent="#0A7C7C"/></aside>
  </main>
}
