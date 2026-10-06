import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, FileUp, RotateCcw, Save, Send } from 'lucide-react'
import { api, errorMessage, type DetectedModelProvider, type ToolManifest } from '../../lib/api'
import { initialParamsFromManifest, useToolExecute } from '../../hooks/useToolExecute'
import { useToolDeps } from '../../hooks/useToolDeps'
import DependencyGate from '../../components/deps/DependencyGate'
import type { ToolExecuteResult } from '../../lib/toolPageTypes'
import { pairGalleyText } from './galleyDiff'

interface FieldSpec { title?: string; description?: string; default?: unknown; enum?: unknown[]; enumLabels?: Record<string, string> }
interface SourceReceipt { name: string; path: string; size: number }
type Section = 'source' | 'language' | 'proof'

const LANG_NAMES: Record<string, string> = { auto: 'Detect automatically' }

export function TextTranslatorWorkspace({ manifest, initialInputPath }: { manifest: ToolManifest; initialInputPath?: string }) {
  const navigate = useNavigate()
  const execute = useToolExecute(manifest.id)
  const deps = useToolDeps(manifest.id)
  const fileRef = useRef<HTMLInputElement>(null)
  const resultParams = useRef<Record<string, unknown>>({})
  const schema = manifest.parameters_schema as Record<string, FieldSpec>
  const [params, setParams] = useState(() => initialParamsFromManifest(manifest, initialInputPath ? { input_path: initialInputPath } : {}))
  const [sourceText, setSourceText] = useState('')
  const [receipt, setReceipt] = useState<SourceReceipt | null>(null)
  const [dirty, setDirty] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [loadingSource, setLoadingSource] = useState(false)
  const [providers, setProviders] = useState<DetectedModelProvider[]>([])
  const [models, setModels] = useState<string[]>([])
  const [modelSource, setModelSource] = useState('')
  const [keyDraft, setKeyDraft] = useState('')
  const [keyStatus, setKeyStatus] = useState('')
  const [alert, setAlert] = useState<string | null>(null)
  const [result, setResult] = useState<ToolExecuteResult | null>(null)
  const [resultSource, setResultSource] = useState('')
  const [sourceProof, setSourceProof] = useState('')
  const [translatedProof, setTranslatedProof] = useState('')
  const [readingProof, setReadingProof] = useState(false)
  const [proofError, setProofError] = useState<string | null>(null)
  const [section, setSection] = useState<Section>('source')
  const [proofView, setProofView] = useState<'paired' | 'source' | 'translation'>('paired')

  const readInputPath = String(params.input_path ?? '')
  const provider = String(params.provider ?? 'auto')
  const set = (key: string, next: unknown) => setParams((current) => ({ ...current, [key]: next }))
  const stale = Boolean(result && (dirty || JSON.stringify(params) !== JSON.stringify(resultParams.current)))
  const artifact = result?.artifacts.find((item) => item.path)

  useEffect(() => {
    api.getDetectedModelProviders().then((response) => setProviders(response.providers ?? []))
      .catch((cause) => setAlert(errorMessage(cause)))
  }, [])

  useEffect(() => {
    if (!initialInputPath) return
    let active = true
    setLoadingSource(true)
    api.getArtifactContent(initialInputPath).then((file) => {
      if (!active) return
      setSourceText(file.content)
      setReceipt({ name: file.name, path: initialInputPath, size: file.size })
      setDirty(false)
    }).catch((cause) => { if (active) setAlert(errorMessage(cause)) })
      .finally(() => { if (active) setLoadingSource(false) })
    return () => { active = false }
  }, [initialInputPath])

  useEffect(() => {
    if (!provider || provider === 'auto') { setModels([]); setModelSource(''); return }
    let active = true
    api.getProviderModels(provider, keyDraft || undefined).then((response) => {
      if (!active) return
      setModels(response.models ?? [])
      setModelSource(response.source ?? '')
      if (response.error) setAlert(response.error)
    }).catch((cause) => { if (active) setAlert(errorMessage(cause)) })
    return () => { active = false }
  }, [provider, keyDraft])

  useEffect(() => {
    if (!result || !artifact?.path || !resultSource) {
      setSourceProof(''); setTranslatedProof(''); setReadingProof(false); setProofError(null)
      return
    }
    let active = true
    setReadingProof(true); setProofError(null)
    Promise.all([api.getArtifactContent(resultSource), api.getArtifactContent(artifact.path)]).then(([source, translation]) => {
      if (!active) return
      setSourceProof(source.content)
      setTranslatedProof(translation.content)
      setProofError(null)
    }).catch((cause) => { if (active) setProofError(errorMessage(cause)) })
      .finally(() => { if (active) setReadingProof(false) })
    return () => { active = false }
  }, [artifact?.path, result, resultSource])

  const loadFile = async (file?: File) => {
    if (!file) return
    setAlert(null); setUploading(true)
    try {
      const uploaded = await api.uploadFile(file)
      const content = await api.getArtifactContent(uploaded.path)
      setSourceText(content.content)
      set('input_path', uploaded.path)
      setReceipt({ name: uploaded.name, path: uploaded.path, size: uploaded.size })
      setDirty(false)
      setSection('source')
    } catch (cause) { setAlert(errorMessage(cause)) }
    finally { setUploading(false) }
  }

  const uploadEditedSource = async () => {
    if (!sourceText.trim()) { setAlert('Add source text before uploading the edited document.'); return }
    setAlert(null); setUploading(true)
    try {
      const baseName = receipt?.name?.replace(/\.[^.]+$/, '') || 'translation-source'
      const file = new File([sourceText], `${baseName}.txt`, { type: 'text/plain' })
      const uploaded = await api.uploadFile(file)
      set('input_path', uploaded.path)
      setReceipt({ name: uploaded.name, path: uploaded.path, size: uploaded.size })
      setDirty(false)
    } catch (cause) { setAlert(errorMessage(cause)) }
    finally { setUploading(false) }
  }

  const loadPath = async () => {
    if (!readInputPath.trim()) return
    setAlert(null); setLoadingSource(true)
    try {
      const file = await api.getArtifactContent(readInputPath.trim())
      setSourceText(file.content)
      setReceipt({ name: file.name, path: readInputPath.trim(), size: file.size })
      setDirty(false)
    } catch (cause) { setAlert(errorMessage(cause)) }
    finally { setLoadingSource(false) }
  }

  const saveKey = async () => {
    if (!keyDraft || provider === 'auto') return
    setAlert(null); setKeyStatus('')
    try {
      await api.saveKey(provider, keyDraft)
      setKeyDraft(''); setKeyStatus('Provider key saved.')
    } catch (cause) { setAlert(errorMessage(cause)) }
  }

  const runTranslation = async () => {
    if (!receipt || dirty || execute.busy) return
    setAlert(null); setProofError(null)
    const snapshot = { ...params, input_path: receipt.path }
    const completed = await execute.run(snapshot)
    if (!completed) return
    resultParams.current = snapshot
    setResultSource(String(snapshot.input_path))
    setResult(completed)
    setSection('proof')
  }

  const onDrop = (event: DragEvent<HTMLElement>) => {
    if (!Array.from(event.dataTransfer.types).includes('Files')) return
    event.preventDefault(); void loadFile(event.dataTransfer.files[0])
  }

  const languageControl = (key: 'source_lang' | 'target_lang') => {
    const field = schema[key]
    return <label className="txt-field" data-param-key={key}>
      <span>{field?.title ?? key}</span>
      <select value={String(params[key] ?? field?.default ?? '')} onChange={(event) => set(key, event.target.value)}>
        {(field?.enum ?? []).map((option) => <option key={String(option)} value={String(option)}>{field?.enumLabels?.[String(option)] ?? LANG_NAMES[String(option)] ?? String(option)}</option>)}
      </select>
    </label>
  }

  const pathChange = (event: ChangeEvent<HTMLInputElement>) => {
    set('input_path', event.target.value)
    setReceipt(null)
    setDirty(false)
  }
  const activeProvider = providers.find((item) => item.id === provider)
  const hasProof = Boolean(result && sourceProof && translatedProof)
  const pairs = hasProof ? pairGalleyText(sourceProof, translatedProof) : []
  const runData = result?.data ?? {}
  const downloadHref = artifact ? `/api/artifacts/content?path=${encodeURIComponent(artifact.path)}` : ''

  return <main className="txt-root txt-workspace" onDragOver={(event) => { if (Array.from(event.dataTransfer.types).includes('Files')) event.preventDefault() }} onDrop={onDrop}>
    <header className="txt-workspace__masthead">
      <Link to="/" className="txt-index"><ArrowLeft size={14}/>Index</Link>
      <span className="txt-workspace__wordmark">The Translation Galley</span>
      <button type="button" className="txt-return" onClick={() => navigate(`/t/${manifest.id}`)}>About this tool <ArrowRight size={14}/></button>
    </header>
    <nav className="txt-sequence" aria-label="Translation workflow">
      {(['source', 'language', 'proof'] as const).map((name, index) => <button key={name} type="button" className={`txt-sequence__step${section === name ? ' is-current' : ''}`} onClick={() => setSection(name)}><b>0{index + 1}</b><span>{name === 'source' ? 'Edit source' : name === 'language' ? 'Set language' : 'Read proof'}</span></button>)}
    </nav>

    {alert && <p className="txt-alert" role="alert">{alert}<button type="button" aria-label="Dismiss error" onClick={() => setAlert(null)}>×</button></p>}
    {stale && <p className="txt-stale" role="status">The proof reflects earlier source or settings. Upload and translate again to refresh it.</p>}

    <section hidden={section !== 'source'} className="txt-stage txt-stage--source" aria-labelledby="txt-source-heading">
      <div className="txt-stage__intro"><p className="txt-kicker">01 / SOURCE TEXT</p><h1 id="txt-source-heading">Set the copy.</h1><p>Open a text file or write directly in the editor. Upload your final edits before moving on.</p></div>
      <div className="txt-source-grid">
        <div className="txt-source-editor">
          <div className="txt-editor__bar"><label htmlFor="txt-source-buffer">Working text</label><span>{sourceText.length.toLocaleString()} characters</span></div>
          <textarea id="txt-source-buffer" value={sourceText} onChange={(event) => { setSourceText(event.target.value); setDirty(true) }} placeholder="Write or paste the text to translate…" spellCheck="false"/>
          <div className="txt-editor__foot"><span>{dirty ? 'Edits need an upload receipt' : receipt ? 'Source copy is uploaded' : 'No uploaded source yet'}</span><button type="button" className="txt-button txt-button--dark" onClick={() => void uploadEditedSource()} disabled={uploading || !sourceText.trim()}><Save size={14}/>{uploading ? 'Uploading…' : dirty ? 'Upload edited source' : 'Upload source'}</button></div>
        </div>
        <aside className="txt-source-meta">
          <div className="txt-column-title"><span>FILE / INPUT</span><span>18—01</span></div>
          <label className="txt-field txt-field--path" data-param-key="input_path"><span>{schema.input_path?.title ?? 'Source file path'}</span><input value={readInputPath} onChange={pathChange} placeholder="Upload a file or paste a path"/><small>{schema.input_path?.description}</small></label>
          <div className="txt-file-actions"><button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}><FileUp size={15}/>{uploading ? 'Uploading…' : 'Choose file'}</button><button type="button" onClick={() => void loadPath()} disabled={loadingSource || !readInputPath.trim()}>{loadingSource ? 'Loading…' : 'Load path'}</button><input ref={fileRef} className="txt-visually-hidden" type="file" accept=".txt,.md,.csv,.json,text/plain,text/markdown,application/json" aria-label="Choose a plain-text document" onChange={(event) => { void loadFile(event.target.files?.[0]); event.currentTarget.value = '' }}/></div>
          <div className={`txt-receipt${receipt ? ' is-ready' : ''}`} aria-live="polite"><span className="txt-receipt__mark"/>{receipt ? <><b>{receipt.name}</b><code>{receipt.path}</code><small>{receipt.size.toLocaleString()} bytes · uploaded</small></> : <><b>Awaiting source receipt</b><small>Upload a file or editor changes to create the input artifact.</small></>}</div>
          <button type="button" className="txt-button txt-button--next" onClick={() => setSection('language')} disabled={!receipt || dirty}>Set language and model <ArrowRight size={15}/></button>
        </aside>
      </div>
    </section>

    <section hidden={section !== 'language'} className="txt-stage txt-stage--language" aria-labelledby="txt-language-heading">
      <div className="txt-stage__intro"><p className="txt-kicker">02 / TRANSLATION ROUTE</p><h1 id="txt-language-heading">Choose the voice.</h1><p>The uploaded source receipt stays attached while you select a language and model.</p></div>
      <div className="txt-route-grid">
        <div className="txt-route-fields"><div className="txt-route-pair">{languageControl('source_lang')}{languageControl('target_lang')}</div>
          <label className="txt-field" data-param-key="provider"><span>{schema.provider?.title ?? 'Provider'}</span><select value={provider} onChange={(event) => { set('provider', event.target.value); set('model', 'auto'); setKeyDraft(''); setKeyStatus('') }}><option value="auto">{schema.provider?.enumLabels?.auto ?? 'Auto'}</option>{providers.filter((item) => item.id !== 'auto').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><small>{activeProvider?.description ?? 'Choose an available translation provider.'}</small></label>
          <label className="txt-field" data-param-key="model"><span>{schema.model?.title ?? 'Model'}</span><select value={String(params.model ?? 'auto')} onChange={(event) => set('model', event.target.value)}><option value="auto">Auto</option>{models.map((model) => <option key={model} value={model}>{model}</option>)}</select><small>{modelSource ? `Models reported by ${modelSource}.` : schema.model?.description}</small></label>
          {provider !== 'auto' && <div className="txt-key-control"><label className="txt-field" htmlFor="txt-provider-key"><span>Provider key</span><input id="txt-provider-key" type="password" autoComplete="new-password" value={keyDraft} onChange={(event) => { setKeyDraft(event.target.value); setKeyStatus('') }} placeholder={`Key for ${activeProvider?.name ?? provider}`}/></label><button type="button" onClick={() => void saveKey()} disabled={!keyDraft}><Save size={14}/>Save key</button>{keyStatus && <small role="status">{keyStatus}</small>}</div>}
        </div>
        <aside className="txt-route-aside"><div className="txt-column-title"><span>SUBMITTED SOURCE</span><span>01</span></div><b>{receipt?.name ?? 'No source uploaded'}</b><code>{receipt?.path ?? 'Upload a document in the source stage.'}</code><button type="button" className="txt-button txt-button--next" onClick={() => setSection('source')}><ArrowLeft size={15}/>Back to source</button><button type="button" className="txt-button txt-button--run" onClick={() => void runTranslation()} disabled={!receipt || dirty || execute.busy || !deps.ready}><Send size={14}/>{execute.busy ? `Translating · ${execute.state.elapsedSeconds.toFixed(1)}s` : 'Translate document'}</button></aside>
      </div>
    </section>

    <section hidden={section !== 'proof'} className="txt-stage txt-stage--proof" aria-labelledby="txt-proof-heading">
      <div className="txt-stage__intro txt-stage__intro--proof"><p className="txt-kicker">03 / RETURNED ARTIFACTS</p><h1 id="txt-proof-heading">Read the proof.</h1><p>{artifact ? <>Source: <code>{resultSource}</code> · Output: <code>{artifact.name}</code></> : 'Run a translation to compare its returned source and output.'}</p></div>
      {result?.status === 'failed' && <p className="txt-alert" role="alert">{result.error}</p>}
      {proofError && <p className="txt-alert" role="alert">{proofError}</p>}
      {stale && <p className="txt-stale" role="status">This proof is from an earlier source or language selection.</p>}
      {readingProof && <p className="txt-proof-empty" role="status">Reading source and translation artifacts…</p>}
      {!result && <p className="txt-proof-empty">The marked-up galley appears after a translation run.</p>}
      {result && !readingProof && !proofError && !hasProof && <p className="txt-proof-empty">No text artifact was returned for this run.</p>}
      {hasProof && <>
        {(runData.provider || runData.model || runData.target_lang || typeof runData.artifacts_count === 'number') && <div className="txt-run-receipt" aria-label="Translation run result">{runData.provider && <span>{String(runData.provider)}{runData.model ? ` / ${String(runData.model)}` : ''}</span>}{runData.target_lang && <span>Target {String(runData.target_lang)}</span>}{typeof runData.artifacts_count === 'number' && <span>{runData.artifacts_count} artifact{runData.artifacts_count === 1 ? '' : 's'}</span>}</div>}
        <div className="txt-proof-tools"><span>{pairs.length} sentence pairs</span><div className="txt-proof-switch" role="group" aria-label="Proof layout"><button type="button" aria-pressed={proofView === 'paired'} onClick={() => setProofView('paired')}>Paired</button><button type="button" aria-pressed={proofView === 'source'} onClick={() => setProofView('source')}>Source</button><button type="button" aria-pressed={proofView === 'translation'} onClick={() => setProofView('translation')}>Translation</button></div>{artifact && <a href={downloadHref} download={artifact.name}>Download returned file ↗</a>}</div>
        <div className={`txt-galley txt-galley--${proofView}`}>
          <div className="txt-galley__head"><span>ORIGINAL · {String(params.source_lang ?? 'auto')}</span><span>TRANSLATION · {String(params.target_lang ?? '')}</span></div>
          {pairs.map((pair) => <article className={`txt-galley__pair${pair.changed ? ' is-changed' : ''}`} key={pair.index}><span className="txt-galley__number">{String(pair.index).padStart(2, '0')}</span><p className="txt-galley__source">{pair.source || <i>No matching source sentence.</i>}</p><p className="txt-galley__translation">{pair.translation || <i>No matching translation.</i>}</p></article>)}
        </div>
      </>}
      <div className="txt-proof-footer"><button type="button" className="txt-button txt-button--next" onClick={() => setSection('language')}><ArrowLeft size={15}/>Adjust translation</button><button type="button" className="txt-button txt-button--dark" onClick={() => setSection('source')}><RotateCcw size={14}/>Edit source</button></div>
    </section>
    <footer className="txt-dependency"><DependencyGate toolId={manifest.id} state={deps}/></footer>
  </main>
}
