import { useEffect, useRef, useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, FileText, LoaderCircle, Upload, X } from 'lucide-react'
import { api, errorMessage, resolveUrl, type ToolManifest } from '../../lib/api'
import { useToolExecute } from '../../hooks/useToolExecute'
import { useToolDeps } from '../../hooks/useToolDeps'
import DependencyGate from '../../components/deps/DependencyGate'
import { initialParamsFromManifest } from '../../hooks/useToolExecute'
import type { ToolExecuteResult } from '../../lib/toolPageTypes'
import { artifactPreviewKey, retainCompletedRun, summarizerParamsChanged, summarizerRunParams, validateSummarizerFile, type CompletedRun } from './summarizerState'

interface FieldSpec {
  title?: string
  description?: string
  default?: unknown
  minimum?: number
  maximum?: number
  enum?: unknown[]
  placeholder?: string
}

type SourceMode = 'text' | 'file'

export interface SummarizerWorkspaceProps {
  manifest: ToolManifest
  initialInputPath?: string
}

export interface SummarizerResultProps {
  result: ToolExecuteResult
  stale: boolean
  runIdentity: number
}

export function SummarizerResult({ result, stale, runIdentity }: SummarizerResultProps) {
  const [preview, setPreview] = useState<{ key: string; state: 'loading' | 'ready' | 'error'; content?: string; error?: string } | null>(null)
  const artifact = result.artifacts[0]
  const previewKey = artifact?.path ? artifactPreviewKey(artifact.path, runIdentity) : null
  const data = result.status === 'completed' ? result.data : null
  const takeaways = Array.isArray(data?.takeaways)
    ? data.takeaways.filter((item: unknown): item is string => typeof item === 'string')
    : []
  const bulletCount = typeof data?.bullet_count === 'number' ? data.bullet_count : null
  const title = typeof data?.title === 'string' && data.title ? data.title : 'Returned takeaways'

  useEffect(() => {
    if (!artifact?.path) {
      setPreview(null)
      return
    }
    let active = true
    const key = artifactPreviewKey(artifact.path, runIdentity)
    setPreview({ key, state: 'loading' })
    api.getArtifactContent(artifact.path).then((response) => {
      if (active) setPreview({ key, state: 'ready', content: response.content })
    }).catch((cause) => {
      if (active) setPreview({ key, state: 'error', error: errorMessage(cause) })
    })
    return () => { active = false }
  }, [artifact?.path, runIdentity])

  return <section className="sum-result" aria-label="Returned summary" aria-live="polite">
    <header className="sum-result__head">
      <div><p className="sum-eyebrow">02 / Returned notes</p><h2>{title}</h2></div>
      <div className="sum-result__badges">
        {bulletCount !== null && <span>{bulletCount} {bulletCount === 1 ? 'point' : 'points'}</span>}
        {stale && <span className="sum-result__stale" role="status">Settings changed · rerun to update</span>}
      </div>
    </header>
    {takeaways.length ? <ol className="sum-takeaways">
      {takeaways.map((line, index) => <li key={`${index}-${line}`}><span className="sum-takeaways__index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><p><span className="sum-visually-hidden">Takeaway {index + 1}: </span>{line}</p></li>)}
    </ol> : <p className="sum-empty-result">No takeaways were returned by the backend.</p>}
    {artifact && <section className="sum-artifact" aria-label="Output artifact preview">
      <div className="sum-artifact__head"><div><FileText size={15}/><strong>{artifact.name}</strong></div><a href={resolveUrl(`/api/artifacts/content?path=${encodeURIComponent(artifact.path)}`)} download={artifact.name}>Download artifact</a></div>
      {preview?.key === previewKey && preview.state === 'loading' && <p className="sum-artifact__message" role="status">Loading artifact preview…</p>}
      {preview?.key === previewKey && preview.state === 'error' && <p className="sum-artifact__message sum-artifact__message--error" role="alert">Artifact preview unavailable: {preview.error}</p>}
      {preview?.key === previewKey && preview.state === 'ready' && <pre className="sum-artifact__content">{preview.content}</pre>}
    </section>}
  </section>
}

export function SummarizerWorkspace({ manifest, initialInputPath }: SummarizerWorkspaceProps) {
  const navigate = useNavigate()
  const execute = useToolExecute('summarizer')
  const deps = useToolDeps('summarizer')
  const inputRef = useRef<HTMLInputElement>(null)
  const completedIdentity = useRef(0)
  const schema = (manifest.parameters_schema ?? {}) as Record<string, FieldSpec>
  const [params, setParams] = useState<Record<string, unknown>>(() => initialParamsFromManifest(manifest, initialInputPath ? { input_path: initialInputPath } : {}))
  const [sourceMode, setSourceMode] = useState<SourceMode>(initialInputPath ? 'file' : 'text')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [completed, setCompleted] = useState<CompletedRun | null>(null)

  const setParam = (key: string, value: unknown) => setParams((previous) => ({ ...previous, [key]: value }))
  const text = String(params.text ?? '')
  const inputPath = String(params.input_path ?? '')
  const maxBullets = Number(params.max_bullets ?? 5)
  const submission = summarizerRunParams(params, sourceMode)
  const stale = completed ? summarizerParamsChanged(completed.params, submission) : false
  const canRun = sourceMode === 'text' ? text.trim().length > 0 : inputPath.trim().length > 0
  const currentError = uploadError ?? (execute.state.phase === 'failed' ? execute.state.error : null)

  const upload = async (file?: File) => {
    if (!file) return
    setUploadError(null)
    setUploading(true)
    try {
      const validationError = await validateSummarizerFile(file)
      if (validationError) throw new Error(validationError)
      const uploaded = await api.uploadFile(file)
      setParam('input_path', uploaded.path)
      setSourceMode('file')
    } catch (cause) {
      setUploadError(errorMessage(cause))
    } finally {
      setUploading(false)
    }
  }

  const onDrop = (event: DragEvent<HTMLElement>) => {
    if (!Array.from(event.dataTransfer.types).includes('Files')) return
    event.preventDefault()
    void upload(event.dataTransfer.files[0])
  }

  const run = async () => {
    setUploadError(null)
    const sentParams = summarizerRunParams(params, sourceMode)
    const result = await execute.run(sentParams)
    if (result?.status === 'completed') completedIdentity.current += 1
    setCompleted((previous) => retainCompletedRun(previous, result, sentParams, completedIdentity.current))
  }

  const rangeMin = schema.max_bullets?.minimum ?? 1
  const rangeMax = schema.max_bullets?.maximum ?? 20

  return <main className="sum-root sum-workspace" onDragOver={(event) => { if (Array.from(event.dataTransfer.types).includes('Files')) event.preventDefault() }} onDrop={onDrop}>
    <header className="sum-workspace__bar">
      <button type="button" className="sum-home" onClick={() => navigate('/')}><ArrowLeft size={15}/>All tools</button>
      <div className="sum-workspace__brand"><span className="sum-mark" aria-hidden="true"><FileText size={15}/></span><strong>Reading desk</strong><span>{manifest.id}</span></div>
      <span className="sum-workspace__state">{execute.busy ? 'Reading source' : completed ? 'Last run retained' : 'Ready for a source'}</span>
    </header>

    <div className="sum-workspace__main">
      <section className="sum-source" aria-labelledby="sum-source-title">
        <div className="sum-section-head"><div><p className="sum-eyebrow">01 / Source</p><h1 id="sum-source-title">Bring a text into focus.</h1></div><div className="sum-mode" role="group" aria-label="Source mode"><button type="button" aria-pressed={sourceMode === 'text'} onClick={() => setSourceMode('text')}>Text</button><button type="button" aria-pressed={sourceMode === 'file'} onClick={() => setSourceMode('file')}>File</button></div></div>

        {currentError && <p className="sum-error" role="alert">{currentError}</p>}

        <div className="sum-source__paper">
          <div className="sum-source__title-row"><span>{sourceMode === 'text' ? 'PASTE OR TYPE' : 'FILE SOURCE'}</span>{sourceMode === 'text' && <span>{text.length.toLocaleString()} characters</span>}</div>
          <div data-param-key="text" className="sum-field sum-field--text">
            <label className="sum-visually-hidden" htmlFor="sum-text">{schema.text?.title ?? 'text'}</label>
            <textarea id="sum-text" value={text} onChange={(event) => { setParam('text', event.target.value); setSourceMode('text') }} disabled={execute.busy} placeholder={schema.text?.placeholder ?? ''} rows={17}/>
          </div>
          {sourceMode === 'file' && <div data-param-key="input_path" className="sum-field sum-field--file">
            <label htmlFor="sum-input-path">{schema.input_path?.title ?? 'input_path'}</label>
            <div className="sum-file-row"><input id="sum-input-path" value={inputPath} onChange={(event) => { setParam('input_path', event.target.value); setSourceMode('file') }} placeholder="/path/to/document.txt" disabled={execute.busy}/><button type="button" aria-label="Choose a source file" onClick={() => inputRef.current?.click()} disabled={uploading || execute.busy}><Upload size={15}/>{uploading ? 'Uploading…' : 'Browse'}</button>{inputPath && <button type="button" className="sum-icon-button" aria-label="Clear file path" onClick={() => setParam('input_path', '')}><X size={15}/></button>}</div>
            <p>{schema.input_path?.description}</p>
            <input ref={inputRef} className="sum-visually-hidden" type="file" accept=".txt,.md,.srt,.vtt,text/plain,text/markdown" aria-label="Choose a UTF-8 text source file" onChange={(event) => { void upload(event.currentTarget.files?.[0]); event.currentTarget.value = '' }}/>
            <p className="sum-source__precedence">The selected source mode determines which source field is sent.</p>
          </div>}
        </div>
      </section>

      <aside className="sum-controls" aria-label="Output settings">
        <div className="sum-controls__heading"><p className="sum-eyebrow">Output / Settings</p><h2>Shape the notes.</h2></div>
        <div data-param-key="max_bullets" className="sum-control">
          <label htmlFor="sum-max-bullets">{schema.max_bullets?.title ?? 'max_bullets'} <output htmlFor="sum-max-bullets">{Number.isFinite(maxBullets) ? maxBullets : rangeMin}</output></label>
          <input id="sum-max-bullets" type="range" min={rangeMin} max={rangeMax} step="1" value={Number.isFinite(maxBullets) ? maxBullets : rangeMin} onChange={(event) => setParam('max_bullets', Number(event.target.value))} disabled={execute.busy}/>
          <p>{schema.max_bullets?.description}</p>
        </div>
        <div data-param-key="format" className="sum-control">
          <span className="sum-control__label">{schema.format?.title ?? 'format'}</span>
          <div className="sum-format" aria-label={schema.format?.title ?? 'Output format'}>
            <span className="sum-format__supported">Markdown</span>
            <button type="button" disabled title="Plain output is unavailable">Plain — unavailable</button>
          </div>
        </div>
        <button type="button" className="sum-button sum-button--dark sum-run" onClick={() => void run()} disabled={!canRun || execute.busy || uploading || !deps.ready}>
          {execute.busy ? <><LoaderCircle className="sum-spin" size={16}/>Reading…</> : 'Read and summarize'}
        </button>
        {!deps.ready && <p className="sum-run__hint">The run control becomes available after the dependency check.</p>}
      </aside>

      <section className="sum-output" aria-label="Summary result">
        <p className="sum-eyebrow">02 / Marginalia</p>
        {completed ? <SummarizerResult result={completed.result} stale={stale} runIdentity={completed.identity}/> : <div className="sum-output__empty"><span aria-hidden="true">—</span><p>Returned takeaways will appear here.</p></div>}
      </section>
    </div>

    <footer className="sum-dependency" aria-label="Dependency status"><DependencyGate toolId="summarizer" state={deps}/></footer>
  </main>
}

export default SummarizerWorkspace
