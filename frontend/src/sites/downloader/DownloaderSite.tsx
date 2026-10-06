import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowDownToLine, ArrowLeft, ArrowRight, RefreshCw, X } from 'lucide-react'
import { api, errorMessage, resolveUrl, type DownloadTask, type ToolManifest } from '../../lib/api'
import { depDisplayBytes } from '../../lib/depsApi'
import { useToolExecute } from '../../hooks/useToolExecute'
import { useToolDeps } from '../../hooks/useToolDeps'
import DependencyGate from '../../components/deps/DependencyGate'
import ToolResultPanel from '../../components/tools/ToolResultPanel'
import { ToolForm } from '../../lib/toolForms'
import './downloader.css'

const ID = 'media.download.yt-dlp'
const SUBMITTED_PARAMS_STORAGE_KEY = 'media.download.yt-dlp.submitted-params.v1'
// Keep credentials and free-form CLI/extractor arguments out of browser session storage.
const OMIT_FROM_SESSION_SNAPSHOT = new Set(['url', 'cookies_file', 'raw_args', 'extractor_args'])
export const DOWNLOADER_HELPERS = [
  ['media.download.resolve', 'Resolve a media URL'],
  ['media.download.format_select', 'Select a format'],
  ['media.subtitle.fetch', 'Fetch subtitles'],
  ['media.thumbnail.get', 'Get a thumbnail'],
] as const

type ProbeResult = Awaited<ReturnType<typeof api.getVideoInfo>>
type WorkspaceEntry = { url?: string; probe?: ProbeResult }

export function createProbeWorkspaceEntry(url: string, probe: ProbeResult): WorkspaceEntry {
  return { url: url.trim(), probe }
}

export function paramsAfterEnqueue(schema: Record<string, unknown>) {
  return defaults(schema)
}

export function paramsAfterAcceptedSource(params: Record<string, unknown>) {
  const { url: _url, ...options } = params
  return options
}

type SnapshotStorage = Pick<Storage, 'getItem' | 'setItem'>

export function safeSubmittedParams(params: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(params).filter(([key]) => !OMIT_FROM_SESSION_SNAPSHOT.has(key)))
}

export function hydrateSubmittedParams(storage: Pick<Storage, 'getItem'>) {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(SUBMITTED_PARAMS_STORAGE_KEY) ?? '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).flatMap(([taskId, value]) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return []
      return [[taskId, safeSubmittedParams(value as Record<string, unknown>)]]
    })) as Record<string, Record<string, unknown>>
  } catch { return {} }
}

export function persistSubmittedParams(storage: SnapshotStorage, current: Record<string, Record<string, unknown>>, taskId: string, params: Record<string, unknown>) {
  const next = { ...current, [taskId]: safeSubmittedParams(params) }
  try { storage.setItem(SUBMITTED_PARAMS_STORAGE_KEY, JSON.stringify(next)) } catch { /* Session storage may be unavailable; persisted API params still support stale checks. */ }
  return next
}

export function deleteSubmittedParams(storage: SnapshotStorage, current: Record<string, Record<string, unknown>>, taskId: string) {
  const next = { ...current }
  delete next[taskId]
  try { storage.setItem(SUBMITTED_PARAMS_STORAGE_KEY, JSON.stringify(next)) } catch { /* Session storage may be unavailable. */ }
  return next
}

export function shouldResetDraftAfterEnqueue(currentRevision: number, submittedRevision: number) {
  return currentRevision === submittedRevision
}

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

function probeFacts(probe: ProbeResult) {
  return [
    typeof probe.title === 'string' && probe.title ? probe.title : null,
    typeof probe.author_name === 'string' && probe.author_name ? probe.author_name : null,
    typeof probe.duration === 'number' && Number.isFinite(probe.duration) ? `${Math.round(probe.duration)} sec` : null,
    typeof probe.provider_name === 'string' && probe.provider_name ? probe.provider_name : null,
  ].filter((fact): fact is string => Boolean(fact))
}

export function DownloaderHero({ manifest }: { manifest: ToolManifest }) {
  const navigate = useNavigate()
  const [heroUrl, setHeroUrl] = useState('')
  const [heroProbe, setHeroProbe] = useState<ProbeResult | null>(null)
  const [heroProbeError, setHeroProbeError] = useState<string | null>(null)
  const [heroProbing, setHeroProbing] = useState(false)
  const probeSequence = useRef(0)
  const probeHeroUrl = async () => {
    const url = heroUrl.trim()
    const sequence = ++probeSequence.current
    setHeroProbe(null); setHeroProbeError(null); setHeroProbing(true)
    try {
      const result = await api.getVideoInfo(url)
      if (sequence === probeSequence.current) setHeroProbe(result)
    } catch (cause) {
      if (sequence === probeSequence.current) setHeroProbeError(errorMessage(cause))
    } finally {
      if (sequence === probeSequence.current) setHeroProbing(false)
    }
  }
  const changeHeroUrl = (value: string) => {
    probeSequence.current += 1
    setHeroUrl(value); setHeroProbe(null); setHeroProbeError(null); setHeroProbing(false)
  }
  const continueToWorkspace = () => heroProbe && navigate(`/t/${ID}/workspace`, { state: createProbeWorkspaceEntry(heroUrl, heroProbe) })

  return <main className="dl-root dl-hero">
    <header className="dl-wordmark"><Link to="/" className="dl-index-link"><ArrowLeft size={14}/> Index</Link><span className="dl-brand"><span className="dl-mark"/> Media desk</span><span className="dl-wordmark__id">{ID}</span></header>
    <section className="dl-hero__body">
      <div className="dl-hero__copy">
        <p className="dl-kicker">Catalogue · dispatch 01</p>
        <h1>Bring media<br/>into reach.</h1>
        <p className="dl-lede">{manifest.description}</p>
        <div className="dl-entry-grid">
          <div className="dl-entry dl-entry--probe">
            <span className="dl-entry__number">01</span>
            <div className="dl-entry__body">
              <label htmlFor="dl-hero-url">Inspect a media URL</label>
              <div className="dl-hero-probe__line"><input id="dl-hero-url" type="url" value={heroUrl} placeholder="Paste a media link" onChange={(event) => changeHeroUrl(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && heroUrl.trim() && !heroProbing) void probeHeroUrl() }}/><button onClick={() => void probeHeroUrl()} disabled={!heroUrl.trim() || heroProbing}>{heroProbing ? 'Checking…' : 'Probe'}</button></div>
              {heroProbeError && <p className="dl-error" role="alert">{heroProbeError}</p>}
              {heroProbe && <div className="dl-hero-result">
                {heroProbe.thumbnail_url && <img src={heroProbe.thumbnail_url} alt=""/>}
                <div><strong>{heroProbe.title || 'Title unavailable'}</strong><span>{probeFacts(heroProbe).filter((fact) => fact !== heroProbe.title).join(' · ') || 'No additional metadata returned'}</span></div>
              </div>}
            </div>
          </div>
          <DownloaderHeroEntryPaths hasProbe={Boolean(heroProbe)} onEmpty={() => navigate(`/t/${ID}/workspace`, { state: {} })} onContinue={continueToWorkspace}/>
        </div>
      </div>
      <aside className="dl-index-card" aria-label="Downloader manifest overview">
        <div className="dl-index-card__top"><span>TOOL INDEX</span><span>01 / 04</span></div>
        <div className="dl-index-card__diagram"><span className="dl-orbit dl-orbit--outer"/><span className="dl-orbit dl-orbit--inner"/><span className="dl-index-card__node"/></div>
        <div className="dl-index-card__bottom"><span>YT-DLP</span><span>MEDIA / IN</span></div>
        <p>{Object.keys(manifest.parameters_schema ?? {}).length} manifest parameters · {DOWNLOADER_HELPERS.length} hosted utilities</p>
      </aside>
    </section>
  </main>
}

export function DownloaderHeroEntryPaths({ hasProbe, onEmpty, onContinue }: {
  hasProbe: boolean
  onEmpty: () => void
  onContinue: () => void
}) {
  return <>
    {hasProbe && <button className="dl-entry dl-entry--continue" onClick={onContinue}><span className="dl-entry__number">↳</span><span className="dl-entry__body"><strong>Continue to workspace with this item</strong><small>Keep the probed URL and returned metadata.</small></span><ArrowRight size={17}/></button>}
    <button className="dl-entry dl-entry--empty" onClick={onEmpty}><span className="dl-entry__number">02</span><span className="dl-entry__body"><strong>Open an empty workspace</strong><small>Start with your own URL and settings.</small></span><ArrowRight size={17}/></button>
  </>
}

export function DownloaderParameterControls({ schema, value, onChange }: {
  schema: Record<string, unknown>
  value: Record<string, unknown>
  onChange: (next: Record<string, unknown>) => void
}) {
  return <ToolForm toolId={`${ID}.manifest`} schema={schema} value={value} onChange={onChange} />
}

export function DownloaderUrlProbe({ value, onChange, onProbe, probing = false, error, result, onContinue }: {
  value: string
  onChange: (value: string) => void
  onProbe: () => void
  probing?: boolean
  error: string | null
  result: ProbeResult | null
  onContinue?: () => void
}) {
  const facts = result ? probeFacts(result).filter((fact) => fact !== result.title) : []
  return <div className="dl-probe" data-param-key="url"><label htmlFor="dl-url-probe">Media URL</label><div className="dl-probe__line"><input id="dl-url-probe" type="url" value={value} placeholder="https://…" onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && value.trim() && !probing) onProbe() }}/><button onClick={onProbe} disabled={!value.trim() || probing}>{probing ? 'Checking…' : 'Probe'}</button></div>
    {error && <p className="dl-error" role="alert">{error}</p>}
    {result && <div className="dl-metadata">{result.thumbnail_url && <img src={result.thumbnail_url} alt=""/>}<div><strong>{result.title || 'Title unavailable'}</strong>{facts.length > 0 && <span>{facts.join(' · ')}</span>}</div>{onContinue && <button className="dl-continue" onClick={onContinue}>Continue with this item <ArrowRight size={13}/></button>}</div>}
  </div>
}

export function taskIsStale(task: DownloadTask, value: Record<string, unknown>, schema: Record<string, unknown>, submittedParams?: Record<string, unknown>) {
  if (task.status !== 'completed' || !task.result?.artifacts?.length) return false
  const persisted = task.params ?? {}
  return Object.keys(schema).some((key) => {
    if (key === 'url') return false
    const hasSnapshotValue = Boolean(submittedParams && Object.hasOwn(submittedParams, key))
    const hasPersistedValue = Object.hasOwn(persisted, key)
    if (!hasSnapshotValue && !hasPersistedValue) return false
    const originalValue = hasSnapshotValue ? submittedParams![key] : persisted[key]
    return JSON.stringify(originalValue) !== JSON.stringify(value[key])
  })
}

export function DownloaderTaskRow({ task, onCancel, onRemove, stale = false }: { task: DownloadTask; onCancel: () => void; onRemove: () => void; stale?: boolean }) {
  const live = task.progress ?? {}
  const percent = typeof live.percent === 'number' && Number.isFinite(live.percent) ? live.percent : null
  const got = byteText(live.downloaded_bytes)
  const total = byteText(live.total_bytes)
  const showProgressTrack = percent !== null || task.status === 'running'
  const name = task.result?.artifacts?.[0]?.name ?? task.params?.url ?? task.id
  return <article className="dl-row">
    <div className="dl-row__top"><div className="dl-row__name" title={name}>{name}</div><span className={`dl-status dl-status--${task.status}`}>{task.status}</span>{stale && <span className="dl-stale">Settings changed</span>}
      <div className="dl-row__actions">{(task.status === 'queued' || task.status === 'running') && <button onClick={onCancel} aria-label={`Cancel ${name}`}><X size={15}/></button>}{!['queued', 'running'].includes(task.status) && <button onClick={onRemove} aria-label={`Remove ${name}`}><X size={15}/></button>}</div>
    </div>
    {stale && <p className="dl-stale-note">Current output settings differ from this completed item. Its artifact remains available.</p>}
    {task.error && <p className="dl-error" role="alert">{task.error}</p>}
    {showProgressTrack && <div className="dl-progress" role="progressbar" aria-label="Download progress" aria-valuenow={percent ?? undefined} aria-valuemin={percent === null ? undefined : 0} aria-valuemax={percent === null ? undefined : 100} data-indeterminate={percent === null ? 'true' : undefined}>{percent !== null ? <span style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}/> : <span className="dl-progress__indeterminate"/>}</div>}
    <div className="dl-row__meta"><span>{percent !== null ? `${percent}%` : got || total ? `${got ?? '—'} / ${total ?? '—'}` : 'No byte progress reported'}</span>{percent !== null && (got || total) && <span>{got ?? '—'} / {total ?? '—'}</span>}{typeof live.speed === 'string' && <span>{live.speed}</span>}{typeof live.eta === 'string' && <span>ETA {live.eta}</span>}
      {task.result?.artifacts?.map((artifact) => <a key={artifact.path} href={resolveUrl(`/api/artifacts/content?path=${encodeURIComponent(artifact.path)}`)} download={artifact.name}>{artifact.name} <ArrowDownToLine size={12}/></a>)}
    </div>
  </article>
}

function Helper({ id, title }: { id: string; title: string }) {
  const { manifest, error } = useManifest(id)
  const execute = useToolExecute(id)
  const [params, setParams] = useState<Record<string, unknown>>({})
  useEffect(() => { if (manifest) setParams((old) => Object.keys(old).length ? old : defaults(manifest.parameters_schema ?? {})) }, [manifest])
  return <details className="dl-helper">
    <summary><span>{title}</span><code>{id}</code></summary>
    {error ? <pre className="dl-error" role="alert">{error}</pre> : manifest ? <>
      <ToolForm toolId={id} schema={manifest.parameters_schema ?? {}} value={params} onChange={(next) => setParams((old) => ({ ...old, ...next }))}/>
      <button className="dl-button dl-button--small" disabled={execute.busy} onClick={() => void execute.run(params)}>{execute.busy ? 'Running…' : `Run ${title.toLowerCase()}`}</button>
      {execute.state.phase !== 'idle' && <ToolResultPanel state={execute.state} toolId={id} toolName={manifest.name} />}
    </> : <p>Loading helper manifest…</p>}
  </details>
}

export default function DownloaderSite({ siteState }: { siteState: 'hero' | 'workspace' }) {
  const location = useLocation()
  const entry = (location.state ?? {}) as WorkspaceEntry
  const { manifest, error } = useManifest(ID)
  const deps = useToolDeps(ID)
  const [params, setParams] = useState<Record<string, unknown>>(() => entry.url ? { url: entry.url } : {})
  const [probe, setProbe] = useState<ProbeResult | null>(() => entry.probe ?? null)
  const [flowStep, setFlowStep] = useState<'source' | 'review' | 'output'>(() => entry.probe ? 'review' : 'source')
  const [probeError, setProbeError] = useState<string | null>(null)
  const [probing, setProbing] = useState(false)
  const probeSequence = useRef(0)
  const [queue, setQueue] = useState<DownloadTask[]>([])
  const [submittedParamsByTask, setSubmittedParamsByTask] = useState<Record<string, Record<string, unknown>>>({})
  const submittedParamsByTaskRef = useRef<Record<string, Record<string, unknown>>>({})
  const [view, setView] = useState<'new' | 'downloads' | 'utilities'>('new')
  const [queueError, setQueueError] = useState<string | null>(null)
  const [enqueuePending, setEnqueuePending] = useState(false)
  const enqueueGuard = useRef(false)
  const draftRevision = useRef(0)
  const [settings, setSettings] = useState<{ max_concurrent: number } | null>(null)
  const [settingDraft, setSettingDraft] = useState('')
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null)
  const streams = useRef(new Map<string, EventSource>())
  const schema = manifest?.parameters_schema ?? {}
  const queueActive = useMemo(() => queue.some((task) => task.status === 'queued' || task.status === 'running'), [queue])
  const activeTasks = queue.filter((task) => task.status === 'queued' || task.status === 'running')
  const readyTasks = queue.filter((task) => task.status === 'completed')
  const attentionTasks = queue.filter((task) => task.status === 'failed' || task.status === 'cancelled')

  useEffect(() => { if (manifest) setParams((old) => ({ ...defaults(manifest.parameters_schema ?? {}), ...old })) }, [manifest])
  useEffect(() => {
    const hydrated = hydrateSubmittedParams(window.sessionStorage)
    submittedParamsByTaskRef.current = hydrated
    setSubmittedParamsByTask(hydrated)
  }, [])
  const refresh = useCallback(async () => {
    try {
      const result = await api.listDownloads()
      for (const task of result.downloads) if (['completed', 'failed', 'cancelled'].includes(task.status)) {
        streams.current.get(task.id)?.close(); streams.current.delete(task.id)
      }
      setQueue(result.downloads); setQueueError(null)
    } catch (cause) { setQueueError(errorMessage(cause)) }
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
        } catch { /* The next queue list is authoritative if a frame is malformed. */ }
      }
      stream.onerror = () => { stream.close(); streams.current.delete(task.id); void refresh() }
    }
  }, [queue, refresh])
  useEffect(() => { if (!queueActive) return; const timer = window.setInterval(() => void refresh(), 4000); return () => window.clearInterval(timer) }, [queueActive, refresh])

  const changeParams = (next: Record<string, unknown>) => {
    draftRevision.current += 1
    setParams((old) => ({ ...old, ...next }))
  }
  const changeUrl = (url: string) => {
    draftRevision.current += 1
    probeSequence.current += 1
    setParams((old) => ({ ...old, url })); setProbe(null); setProbeError(null); setProbing(false); setFlowStep('source')
  }
  const probeUrl = async () => {
    const url = String(params.url ?? '').trim()
    const sequence = ++probeSequence.current
    setProbe(null); setProbeError(null); setProbing(true)
    try { const result = await api.getVideoInfo(url); if (sequence === probeSequence.current) { setProbe(result); setFlowStep('review') } }
    catch (cause) { if (sequence === probeSequence.current) setProbeError(errorMessage(cause)) }
    finally { if (sequence === probeSequence.current) setProbing(false) }
  }
  const editSource = () => {
    draftRevision.current += 1
    setProbe(null); setProbeError(null); setFlowStep('source')
  }
  const resetDraft = () => {
    draftRevision.current += 1
    setParams(paramsAfterEnqueue(schema))
    setProbe(null); setProbeError(null); setProbing(false); setFlowStep('source')
  }
  const clearAcceptedSource = (submittedParams: Record<string, unknown>) => {
    draftRevision.current += 1
    setParams(paramsAfterAcceptedSource(submittedParams))
    setProbe(null); setProbeError(null); setProbing(false); setFlowStep('source')
  }
  const enqueue = async () => {
    if (enqueueGuard.current || !String(params.url ?? '').trim()) return
    enqueueGuard.current = true
    const submittedRevision = draftRevision.current
    const submittedParams = { ...params }
    setEnqueuePending(true)
    setQueueError(null)
    try {
      const accepted = await api.enqueueDownload(submittedParams)
      const nextSnapshots = persistSubmittedParams(window.sessionStorage, submittedParamsByTaskRef.current, accepted.id, submittedParams)
      submittedParamsByTaskRef.current = nextSnapshots
      setSubmittedParamsByTask(nextSnapshots)
      await refresh()
      if (shouldResetDraftAfterEnqueue(draftRevision.current, submittedRevision)) {
        clearAcceptedSource(submittedParams)
        setView('downloads')
      }
    } catch (cause) { setQueueError(errorMessage(cause)) }
    finally { enqueueGuard.current = false; setEnqueuePending(false) }
  }
  const cancel = async (id: string) => { try { await api.cancelDownload(id); await refresh() } catch (cause) { setQueueError(errorMessage(cause)) } }
  const remove = async (id: string) => { try { await api.removeDownload(id); const nextSnapshots = deleteSubmittedParams(window.sessionStorage, submittedParamsByTaskRef.current, id); submittedParamsByTaskRef.current = nextSnapshots; setSubmittedParamsByTask(nextSnapshots); await refresh() } catch (cause) { setQueueError(errorMessage(cause)) } }
  const startNewDraft = () => { resetDraft(); setView('new') }
  const saveSettings = async () => {
    try { const value = await api.updateDownloadSettings(Number(settingDraft)); setSettings(value); setSettingsMessage(`Maximum concurrent downloads: ${value.max_concurrent}`) }
    catch (cause) { setSettingsMessage(errorMessage(cause)) }
  }

  if (error) return <main className="dl-root"><pre className="dl-error" role="alert">{error}</pre></main>
  if (!manifest) return <main className="dl-root"><p>Loading downloader manifest…</p></main>
  if (siteState === 'hero') return <DownloaderHero manifest={manifest}/>

  const mode = String(params.download_mode ?? 'video_audio')
  const commonKeys = mode === 'audio_only'
    ? ['audio_format', 'audio_quality']
    : mode === 'video_only'
      ? ['format_preset', 'merge_output_format']
      : ['format_preset', 'merge_output_format']
  const commonSchema = Object.fromEntries(commonKeys.filter((key) => key in schema).map((key) => [key, schema[key]]))
  const advancedSchema = Object.fromEntries(Object.entries(schema).filter(([key]) => key !== 'url' && key !== 'download_mode' && !commonKeys.includes(key)))
  const renderRows = (tasks: DownloadTask[]) => tasks.map((task) => <DownloaderTaskRow key={task.id} task={task} stale={taskIsStale(task, params, schema, submittedParamsByTask[task.id])} onCancel={() => void cancel(task.id)} onRemove={() => void remove(task.id)}/> )
  const queueSection = (label: string, note: string, tasks: DownloadTask[], empty: string) => <section className="dl-download-group" key={label}>
    <header><h2>{label}</h2><span>{String(tasks.length).padStart(2, '0')}</span></header>
    {tasks.length ? renderRows(tasks) : <p className="dl-download-group__empty">{empty}</p>}
    <small>{note}</small>
  </section>
  return <main className="dl-root dl-workspace">
    <header className="dl-header"><Link to="/" className="dl-home"><ArrowLeft size={15}/> Index</Link><div className="dl-header__title"><span className="dl-mark"/><strong>Media desk</strong><span>{ID}</span></div><button className="dl-refresh" onClick={() => void refresh()}><RefreshCw size={14}/> Refresh queue</button></header>
    <nav className="dl-nav" aria-label="Downloader sections">
      <button className={view === 'new' ? 'is-active' : ''} aria-current={view === 'new' ? 'page' : undefined} onClick={() => setView('new')}><span>01</span> New download</button>
      <button className={view === 'downloads' ? 'is-active' : ''} aria-current={view === 'downloads' ? 'page' : undefined} onClick={() => setView('downloads')}><span>02</span> Downloads <b>{queue.length}</b></button>
      <button className={view === 'utilities' ? 'is-active' : ''} aria-current={view === 'utilities' ? 'page' : undefined} onClick={() => setView('utilities')}><span>03</span> Utilities</button>
    </nav>
    {queueError && <p role="alert" className="dl-error dl-queue-error dl-global-error">{queueError}</p>}
    <div className="dl-view-scroll">
      {view === 'new' && <section className="dl-new-view" aria-labelledby="dl-new-title">
        <header className="dl-page-heading"><p className="dl-kicker">NEW DOWNLOAD <i>·</i> ONE ITEM AT A TIME</p><h1 id="dl-new-title">What do you want to bring in?</h1><p>Inspect the link first. Then choose the file you need.</p></header>
        <div className="dl-flow">
          <section className="dl-flow-step dl-source-step"><div className="dl-step-number">01</div><div className="dl-step-content"><header><div><p className="dl-kicker">Source</p><h2>Paste one media link</h2></div><span className={probe ? 'dl-step-state is-ready' : 'dl-step-state'}>{probe ? 'INSPECTED' : 'WAITING'}</span></header>
            <DownloaderUrlProbe value={String(params.url ?? '')} onChange={changeUrl} onProbe={() => void probeUrl()} probing={probing} error={probeError} result={probe}/>
          </div></section>
          {probe && flowStep === 'review' && <section className="dl-flow-step dl-reviewed-step"><div className="dl-step-number">02</div><div className="dl-step-content"><header><div><p className="dl-kicker">Review returned details</p><h2>The item yt-dlp identified</h2></div><span className="dl-step-state is-ready">FROM PROBE</span></header>
              <p className="dl-review-url" title={String(params.url ?? '')}>{String(params.url ?? '')}</p>
              <div className="dl-review-card">{probe.thumbnail_url && <img src={probe.thumbnail_url} alt=""/>}<div><strong>{probe.title || 'Title not returned'}</strong><dl>{typeof probe.author_name === 'string' && probe.author_name && <><dt>Publisher</dt><dd>{probe.author_name}</dd></>}{typeof probe.duration === 'number' && Number.isFinite(probe.duration) && <><dt>Duration</dt><dd>{Math.round(probe.duration)} sec</dd></>}{probe.provider_name && <><dt>Source</dt><dd>{probe.provider_name}</dd></>}</dl>{!probeFacts(probe).length && <p>No additional metadata was returned for this link.</p>}</div></div>
              <div className="dl-step-actions"><button className="dl-text-button" onClick={editSource}><ArrowLeft size={13}/> Change URL</button><button className="dl-button" onClick={() => setFlowStep('output')}>Continue to output <ArrowRight size={14}/></button></div>
            </div></section>}
          {probe && flowStep === 'output' && <>
            <div className="dl-output-source"><button className="dl-text-button" onClick={editSource}><ArrowLeft size={13}/> Edit URL</button><span title={String(params.url ?? '')}>{String(params.url ?? '')}</span><button className="dl-text-button" onClick={() => setFlowStep('review')}>Review item</button></div>
            <section className="dl-flow-step dl-output-step"><div className="dl-step-number">03</div><div className="dl-step-content"><header><div><p className="dl-kicker">Output intent</p><h2>What should the saved file contain?</h2></div><span className="dl-step-state">CHOOSE ONE</span></header>
              <DownloaderParameterControls schema={{ download_mode: schema.download_mode }} value={params} onChange={changeParams}/>
            </div></section>
            <section className="dl-flow-step dl-common-step"><div className="dl-step-number">04</div><div className="dl-step-content"><header><div><p className="dl-kicker">File choices</p><h2>{mode === 'audio_only' ? 'Choose an audio format' : 'Choose quality and container'}</h2></div><span className="dl-step-state">COMMON</span></header>
              <DownloaderParameterControls schema={commonSchema} value={params} onChange={changeParams}/>
            </div></section>
            <details className="dl-advanced"><summary><span>Advanced options</span><small>{Object.keys(advancedSchema).length} additional controls · searchable and grouped</small></summary>
              <p>Optional download behavior, playlist selection, subtitles, filenames, and network controls.</p>
              <DownloaderParameterControls schema={advancedSchema} value={params} onChange={changeParams}/>
            </details>
            <footer className="dl-submit-bar"><div><strong>Ready to add this item?</strong><span>{String(params.url ?? '')}</span></div><button className="dl-button" onClick={() => void enqueue()} disabled={!String(params.url ?? '').trim() || enqueuePending}>{enqueuePending ? 'Adding…' : <><ArrowDownToLine size={15}/> Add to downloads <ArrowRight size={15}/></>}</button></footer>
          </>}
          {flowStep === 'source' && !probe && !probing && <p className="dl-next-hint">After inspection, review the returned details before choosing an output.</p>}
        </div>
      </section>}
      {view === 'downloads' && <section className="dl-downloads-view" aria-labelledby="dl-downloads-title">
        <header className="dl-page-heading dl-downloads-heading"><div><p className="dl-kicker">DOWNLOADS <i>·</i> LIVE TASKS</p><h1 id="dl-downloads-title">Your downloads</h1><p>Track each item from the queue to the file on disk.</p></div><button className="dl-button" onClick={startNewDraft}><ArrowLeft size={14}/> New download</button></header>
        <div className="dl-download-groups">
          {queueSection('In progress', 'Queued and running items', activeTasks, 'No downloads are running.')}
          {queueSection('Ready', 'Completed files', readyTasks, 'Finished files will appear here.')}
          {queueSection('Needs attention', 'Failed or cancelled items', attentionTasks, 'Nothing needs attention.')}
        </div>
        <details className="dl-settings dl-settings--downloads"><summary>Queue settings <span>{settings ? `Active limit ${settings.max_concurrent}` : 'Loading setting'}</span></summary><div className="dl-settings__body"><label htmlFor="dl-concurrency">Maximum simultaneous downloads</label><div><input id="dl-concurrency" aria-label="Maximum concurrent downloads" type="number" min="1" value={settingDraft} onChange={(event) => setSettingDraft(event.target.value)}/><button onClick={() => void saveSettings()} disabled={!settingDraft || Number(settingDraft) < 1}>Save limit</button></div>{settingsMessage && <small role="status">{settingsMessage}</small>}</div></details>
      </section>}
      {view === 'utilities' && <section className="dl-utilities-view" aria-labelledby="dl-utilities-title">
        <header className="dl-page-heading"><p className="dl-kicker">UTILITIES <i>·</i> 04 HOSTED TOOLS</p><h1 id="dl-utilities-title">Prepare a source</h1><p>Use a focused helper when you need to resolve a link, choose a format, fetch subtitles, or save a thumbnail.</p></header>
        <div className="dl-utility-list">{DOWNLOADER_HELPERS.map(([id, title], index) => <section className="dl-utility" key={id}><header><span>{String(index + 1).padStart(2, '0')}</span><div><h2>{title}</h2><code>{id}</code></div></header><Helper id={id} title={title}/></section>)}</div>
      </section>}
    </div>
    <aside className="dl-dependencies"><div className="dl-media-size">{(() => { const media = deps.data?.deps.find((entry) => entry.dep_id === 'conda.media'); if (!media) return null; const bytes = depDisplayBytes(media); return <span><strong>conda.media</strong> · {bytes.bytes === null ? 'size unknown' : `${bytes.bytes.toLocaleString()} bytes ${bytes.measured ? 'measured' : 'catalog estimate'}`}</span> })()}</div><DependencyGate toolId={ID} state={deps} accent="#0A7C7C"/></aside>
  </main>
}
