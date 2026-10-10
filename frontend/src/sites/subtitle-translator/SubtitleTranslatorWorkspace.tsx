import { useEffect, useRef, useState, type DragEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight, FileUp, Play } from 'lucide-react'
import { api, errorMessage, type DetectedModelProvider, type ToolManifest } from '../../lib/api'
import { initialParamsFromManifest, useToolExecute } from '../../hooks/useToolExecute'
import { useToolDeps } from '../../hooks/useToolDeps'
import DependencyGate from '../../components/deps/DependencyGate'
import type { ToolExecuteResult } from '../../lib/toolPageTypes'
import { alignSubtitleCues, cueHasFailedIndex, parseSubtitleCues, type CuePair, type ParsedSubtitles } from './subtitleCues'

interface FieldSpec { title?: string; description?: string; default?: unknown; minimum?: number; maximum?: number; enum?: unknown[]; enumLabels?: Record<string, string> }
type Pane = 'source' | 'translation'

export function SubtitleTranslatorWorkspace({ manifest, initialInputPath }: { manifest: ToolManifest; initialInputPath?: string }) {
  const navigate = useNavigate()
  const execute = useToolExecute(manifest.id)
  const deps = useToolDeps(manifest.id)
  const inputRef = useRef<HTMLInputElement>(null)
  const runId = useRef(0)
  const schema = manifest.parameters_schema as Record<string, FieldSpec>
  const [params, setParams] = useState(() => initialParamsFromManifest(manifest, initialInputPath ? { input_path: initialInputPath } : {}))
  const [providers, setProviders] = useState<DetectedModelProvider[]>([])
  const [models, setModels] = useState<string[]>([])
  const [modelSource, setModelSource] = useState('')
  const [providerError, setProviderError] = useState<string | null>(null)
  const [keyDraft, setKeyDraft] = useState('')
  const [keyStatus, setKeyStatus] = useState('')
  const [uploading, setUploading] = useState(false)
  const [inputError, setInputError] = useState<string | null>(null)
  const [result, setResult] = useState<ToolExecuteResult | null>(null)
  const [resultInputPath, setResultInputPath] = useState('')
  const [runIdentity, setRunIdentity] = useState(0)
  const [cueRows, setCueRows] = useState<CuePair[]>([])
  const [sourceFormat, setSourceFormat] = useState<'srt' | 'vtt' | null>(null)
  const [parseState, setParseState] = useState<{ loading: boolean; error: string | null }>({ loading: false, error: null })
  const [selectedCue, setSelectedCue] = useState(0)
  const [pane, setPane] = useState<Pane>('source')
  const resultParams = useRef<Record<string, unknown>>(params)
  const value = (key: string) => params[key]
  const set = (key: string, next: unknown) => setParams((prev) => ({ ...prev, [key]: next }))
  const inputPath = String(value('input_path') ?? '')
  const provider = String(value('provider') ?? 'auto')
  const stale = result !== null && JSON.stringify(params) !== JSON.stringify(resultParams.current)

  useEffect(() => { api.getDetectedModelProviders().then((r) => setProviders(r.providers ?? [])).catch((cause) => setProviderError(errorMessage(cause))) }, [])
  useEffect(() => {
    if (!provider || provider === 'auto') { setModels([]); setModelSource(''); return }
    let active = true
    api.getProviderModels(provider, keyDraft || undefined).then((r) => {
      if (!active) return
      setModels(r.models ?? []); setModelSource(r.source ?? '')
      setProviderError(r.error ?? null)
    }).catch((cause) => { if (active) setProviderError(errorMessage(cause)) })
    return () => { active = false }
  }, [provider, keyDraft])

  const upload = async (file?: File) => {
    if (!file) return
    setInputError(null); setUploading(true)
    try {
      const ext = file.name.toLowerCase().split('.').pop()
      if (ext !== 'srt' && ext !== 'vtt') throw new Error('Choose an .srt or .vtt subtitle file.')
      const uploaded = await api.uploadFile(file)
      set('input_path', uploaded.path)
    } catch (cause) { setInputError(errorMessage(cause)) }
    finally { setUploading(false) }
  }
  const onDrop = (event: DragEvent<HTMLElement>) => {
    if (!Array.from(event.dataTransfer.types).includes('Files')) return
    event.preventDefault(); void upload(event.dataTransfer.files[0])
  }
  const saveKey = async () => {
    if (!keyDraft || provider === 'auto') return
    setProviderError(null); setKeyStatus('')
    try {
      await api.saveKey(provider, keyDraft)
      setKeyDraft(''); setKeyStatus('Key saved for this provider.')
    } catch (cause) { setProviderError(errorMessage(cause)) }
  }
  const executeRun = async () => {
    if (!inputPath.trim() || execute.busy) return
    setInputError(null)
    const snapshot = { ...params }
    const identity = ++runId.current
    const completed = await execute.run(snapshot)
    if (completed) {
      resultParams.current = snapshot
      setResultInputPath(String(snapshot.input_path ?? ''))
      setResult(completed)
      setRunIdentity(identity)
      setSelectedCue(0); setPane('source')
    }
  }
  const artifact = result?.artifacts.find((item) => /\.(?:srt|vtt)$/i.test(item.name || item.path)) ?? result?.artifacts[0]
  useEffect(() => {
    if (!artifact?.path || !resultInputPath) { setCueRows([]); setParseState({ loading: false, error: null }); return }
    let active = true
    setParseState({ loading: true, error: null }); setCueRows([])
    Promise.all([api.getArtifactContent(resultInputPath), api.getArtifactContent(artifact.path)]).then(([source, translated]) => {
      if (!active) return
      const parsedSource: ParsedSubtitles = parseSubtitleCues(source.content)
      const parsedTranslation: ParsedSubtitles = parseSubtitleCues(translated.content)
      setCueRows(alignSubtitleCues(parsedSource.cues, parsedTranslation.cues))
      setSourceFormat(parsedSource.format)
      setParseState({ loading: false, error: null })
    }).catch((cause) => { if (active) setParseState({ loading: false, error: errorMessage(cause) }) })
    return () => { active = false }
  }, [artifact?.path, resultInputPath, runIdentity])

  const languageControl = (key: 'source_lang' | 'target_lang') => {
    const field = schema[key]
    return <label className="sub-field" data-param-key={key}><span>{field?.title ?? key}</span><select value={String(value(key) ?? field?.default ?? '')} onChange={(event) => set(key, event.target.value)}>{(field?.enum ?? []).map((option) => <option key={String(option)} value={String(option)}>{field?.enumLabels?.[String(option)] ?? String(option)}</option>)}</select>{field?.description && <small>{field.description}</small>}</label>
  }
  const downloadHref = artifact ? `/api/artifacts/content?path=${encodeURIComponent(artifact.path)}` : ''

  return <main className="sub-root sub-workspace" onDragOver={(event) => { if (Array.from(event.dataTransfer.types).includes('Files')) event.preventDefault() }} onDrop={onDrop}>
    <header className="sub-masthead"><Link to="/" className="sub-home"><ArrowLeft size={14}/> Index</Link><span className="sub-brand"><span className="sub-mark"/> Cue ledger</span><span className="sub-tool-id">{manifest.id}</span></header>
    <div className="sub-workspace__head"><div><p className="sub-eyebrow">Translator / workspace</p><h1>Read cue by cue.</h1><p>Choose a subtitle file, set the translation route, then inspect the returned timing and text.</p></div><button type="button" className="sub-text-button" onClick={() => navigate(`/t/${manifest.id}`)}>← Site introduction</button></div>
    <section className="sub-workspace__grid">
      <aside className="sub-settings" aria-label="Translation settings">
        <div className="sub-section-title"><span>01</span><h2>Source & route</h2></div>
        <div className="sub-file-field" data-param-key="input_path"><label htmlFor="sub-input-path">{schema.input_path?.title ?? 'Subtitle File'}</label><div className="sub-path-line"><input id="sub-input-path" value={inputPath} onChange={(event) => set('input_path', event.target.value)} placeholder="Choose or paste a subtitle path"/><button type="button" aria-label="Choose subtitle file" onClick={() => inputRef.current?.click()} disabled={uploading}><FileUp size={15}/></button><input ref={inputRef} className="sub-visually-hidden" type="file" accept=".srt,.vtt,application/x-subrip,text/vtt" onChange={(event) => { void upload(event.target.files?.[0]); event.currentTarget.value = '' }}/></div>{schema.input_path?.description && <small>{schema.input_path.description}</small>}</div>
        {languageControl('source_lang')}{languageControl('target_lang')}
        <label className="sub-field" data-param-key="provider"><span>{schema.provider?.title ?? 'Provider'}</span><select value={provider} onChange={(event) => { set('provider', event.target.value); set('model', 'auto'); setKeyDraft(''); setKeyStatus('') }}>{(schema.provider?.enum ?? []).map((option) => <option key={String(option)} value={String(option)}>{schema.provider?.enumLabels?.[String(option)] ?? String(option)}</option>)}</select>{providers.length > 0 && <small>{providers.find((item) => item.id === provider)?.description ?? 'Choose a detected provider.'}</small>}</label>
        <div className="sub-key-row"><label className="sub-field" htmlFor="sub-provider-key"><span>Provider key</span><input id="sub-provider-key" type="password" autoComplete="new-password" value={keyDraft} onChange={(event) => { setKeyDraft(event.target.value); setKeyStatus('') }} placeholder="Save the key before translating" disabled={provider === 'auto'}/></label><button type="button" onClick={() => void saveKey()} disabled={!keyDraft || provider === 'auto'}>Save key</button></div>
        {keyStatus && <small className="sub-success" role="status">{keyStatus}</small>}
        <label className="sub-field" data-param-key="model"><span>{schema.model?.title ?? 'Model'}</span><select value={String(value('model') ?? 'auto')} onChange={(event) => set('model', event.target.value)}><option value="auto">Auto</option>{models.map((model) => <option key={model} value={model}>{model}</option>)}</select>{modelSource && <small>Models reported by {modelSource}.</small>}</label>
        <label className="sub-field" data-param-key="batch_size"><span>{schema.batch_size?.title ?? 'Batch size'}</span><input type="number" min={schema.batch_size?.minimum} max={schema.batch_size?.maximum} value={Number(value('batch_size') ?? 1)} onChange={(event) => set('batch_size', Number(event.target.value))}/>{schema.batch_size?.description && <small>{schema.batch_size.description}</small>}</label>
        {(inputError || providerError) && <p className="sub-error" role="alert">{inputError ?? providerError}</p>}
        <button type="button" className="sub-button sub-button--dark sub-run" onClick={() => void executeRun()} disabled={!inputPath.trim() || execute.busy || !deps.ready}><Play size={15}/>{execute.busy ? `Translating · ${execute.state.elapsedSeconds.toFixed(1)}s` : result ? 'Translate again' : 'Translate cues'}</button>
      </aside>
      <section className="sub-ledger" aria-label="Cue comparison">
        <div className="sub-ledger__head"><div><div className="sub-section-title"><span>02</span><h2>Aligned proof</h2></div><p>{artifact ? artifact.name : 'Translation output will appear here.'}</p></div>{artifact && <a href={downloadHref} download={artifact.name}>Download {artifact.name}</a>}</div>
        {result?.status === 'failed' && <p className="sub-error" role="alert">{result.error ?? 'Translation finished with failed cues. Partial output is shown where available.'}</p>}
        {stale && <p className="sub-stale" role="status">Settings changed · translate again to refresh this result.</p>}
        {parseState.loading && <p role="status" className="sub-ledger__empty">Reading returned subtitle files…</p>}
        {parseState.error && <p role="alert" className="sub-error">Subtitle preview unavailable: {parseState.error}</p>}
        {!result && <p className="sub-ledger__empty">The cue comparison appears after a translation run.</p>}
        {result && !parseState.loading && !parseState.error && cueRows.length === 0 && <p className="sub-ledger__empty">No subtitle cues were returned.</p>}
        {cueRows.length > 0 && <CueLedger rows={cueRows} selected={selectedCue} onSelect={setSelectedCue} pane={pane} onPane={setPane} failedIndices={failedIndices(result)} sourceFormat={sourceFormat ?? 'srt'}/>}
      </section>
    </section>
    <div className="sub-dependency"><DependencyGate toolId={manifest.id} state={deps}/></div>
  </main>
}

function failedIndices(result: ToolExecuteResult | null) {
  const indices = result?.data?.failed_cue_indices
  return Array.isArray(indices) ? new Set(indices.map(String)) : new Set<string>()
}

export function CueLedger({ rows, selected, onSelect, pane, onPane, failedIndices, sourceFormat }: { rows: CuePair[]; selected: number; onSelect: (next: number) => void; pane: Pane; onPane: (next: Pane) => void; failedIndices: Set<string>; sourceFormat: 'srt' | 'vtt' }) {
  const row = rows[selected]
  const sourceContext = row?.source ? `${row.source.id ? `#${row.source.id}` : `Cue ${row.source.ordinal}`} · ${row.source.timestamp}` : 'No matching source cue.'
  const translationContext = row?.translation ? `${row.translation.id ? `#${row.translation.id}` : `Cue ${row.translation.ordinal}`} · ${row.translation.timestamp}` : 'No matching translated cue.'
  return <>
    <div className="sub-pane-switch" role="tablist" aria-label="Cue text pane"><button role="tab" aria-selected={pane === 'source'} onClick={() => onPane('source')}>Source</button><button role="tab" aria-selected={pane === 'translation'} onClick={() => onPane('translation')}>Translation</button></div>
    <div className="sub-cue-mobile"><div className="sub-cue-mobile__context"><span><strong>Source</strong> {sourceContext}</span><span><strong>Translation</strong> {translationContext}</span></div><p>{pane === 'source' ? row?.source?.text ?? 'No matching source cue.' : row?.translation?.text ?? 'No matching translated cue.'}</p></div>
    <div className="sub-cue-list" aria-label="All aligned cues">{rows.map((pair, index) => {
      const cue = pair.source ?? pair.translation!
      const id = pair.source?.id ?? pair.translation?.id
      const label = id ? `#${id}` : `Cue ${cue.ordinal}`
      const failed = pair.source && cueHasFailedIndex(pair.source, failedIndices, sourceFormat)
      return <button key={`${label}-${index}`} className={`sub-cue${selected === index ? ' is-selected' : ''}`} onClick={() => onSelect(index)} aria-current={selected === index ? 'true' : undefined}>
        <span className="sub-cue__meta"><b>{label}</b><em className={`sub-cue__state sub-cue__state--${failed ? 'failed' : pair.state}`}>{failed ? 'Batch failed' : pair.state === 'same' ? 'Unchanged' : pair.state === 'changed' ? 'Changed' : pair.state === 'missing' ? 'Missing translation' : 'Extra translation'}</em></span>
        <span className="sub-cue__columns"><span><span className="sub-cue__cell-head">{pair.source?.id ? `#${pair.source.id}` : pair.source ? `Cue ${pair.source.ordinal}` : 'Source unavailable'}<time>{pair.source?.timestamp ?? '—'}</time></span>{pair.source?.text ?? 'No matching source cue.'}</span><span><span className="sub-cue__cell-head">{pair.translation?.id ? `#${pair.translation.id}` : pair.translation ? `Cue ${pair.translation.ordinal}` : 'Translation unavailable'}<time>{pair.translation?.timestamp ?? '—'}</time></span>{pair.translation?.text ?? 'No matching translated cue.'}</span></span>
      </button>
    })}</div>
    <div className="sub-cue-nav"><button type="button" onClick={() => onSelect(Math.max(0, selected - 1))} disabled={selected === 0}><ChevronLeft size={15}/>Previous</button><span>{selected + 1} / {rows.length}</span><button type="button" onClick={() => onSelect(Math.min(rows.length - 1, selected + 1))} disabled={selected >= rows.length - 1}>Next<ChevronRight size={15}/></button></div>
  </>
}
