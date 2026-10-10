import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api, errorMessage, resolveUrl, type ToolManifest } from '../../lib/api'
import { useToolExecute, initialParamsFromManifest } from '../../hooks/useToolExecute'
import { useToolDeps } from '../../hooks/useToolDeps'
import DependencyGate from '../../components/deps/DependencyGate'

interface FieldSpec { title?: string; description?: string; type?: string; enum?: (string | number)[] }
type LocationState = { inputPath?: string } | null

export default function PdfToolsWorkspace({ manifest }: { manifest: ToolManifest }) {
  const schema = manifest.parameters_schema as Record<string, FieldSpec>
  const location = useLocation()
  const navigate = useNavigate()
  const passedPath = (location.state as LocationState)?.inputPath
  const [params, setParams] = useState(() => initialParamsFromManifest(manifest, passedPath ? { input_path: passedPath } : {}))
  const [query, setQuery] = useState('')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const picker = useRef<HTMLInputElement>(null)
  const execute = useToolExecute('pdf_tools')
  const deps = useToolDeps('pdf_tools')
  const inputPath = String(params.input_path ?? '')
  const action = String(params.action ?? '')
  const actions = schema.action?.enum?.map(String) ?? []
  const result = execute.state.result
  const completed = execute.state.phase === 'completed' && result?.status === 'completed'
  const text = completed && action === 'extract_text' ? result.outputText ?? '' : null
  const count = completed && result?.data && 'character_count' in result.data ? result.data.character_count : undefined
  const info = completed && action === 'inspect_info' && result?.data ? result.data : null
  const rows = useMemo(() => info ? Object.entries(info).sort(([a], [b]) => a.localeCompare(b)) : [], [info])
  const needle = query.trim().toLowerCase()
  const visibleText = text === null ? null : needle ? text.split('\n').filter((line) => line.toLowerCase().includes(needle)).join('\n') : text
  const setParam = (key: string, value: unknown) => {
    setParams((prev) => ({ ...prev, [key]: value }))
    if (key === 'input_path' || key === 'action') execute.reset()
  }
  const upload = async (file: File) => {
    setUploadError(null)
    try {
      const uploaded = await api.uploadFile(file)
      if (!uploaded?.path) throw new Error('Upload response did not include a file path.')
      setParam('input_path', uploaded.path)
    } catch (cause) { setUploadError(errorMessage(cause)) }
  }
  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) void upload(file)
    event.target.value = ''
  }
  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault(); setDragging(false)
    const file = event.dataTransfer.files?.[0]
    if (file) void upload(file)
  }
  const run = () => { if (deps.ready && !execute.busy) void execute.run(params) }
  const artifact = completed ? result.artifacts[0] : undefined

  return (
    <main className="pdfs-root pdfs-workspace">
      <header className="pdfs-masthead">
        <a href="/" className="pdfs-home" onClick={(event) => { event.preventDefault(); navigate('/') }}>← All tools</a>
        <span className="pdfs-masthead-name">PDF Utilities</span>
        <span className="pdfs-edition">DOCUMENTS / 013</span>
      </header>
      <div className="pdfs-workarea">
        <div className="pdfs-title-row"><div><p className="pdfs-kicker">TEXT &amp; PAGE UTILITIES</p><h1>Read the document.</h1></div><span className="pdfs-red-index">NO. 13</span></div>
        <section className={`pdfs-source ${dragging ? 'is-dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
          <div className="pdfs-section-head"><h2>01 <span>Source PDF</span></h2><button type="button" className="pdfs-text-button" onClick={() => picker.current?.click()}>Browse file</button></div>
          <p className="pdfs-field-description">{schema.input_path?.description}</p>
          <label className="pdfs-input-label" htmlFor="pdfs-input-path">{schema.input_path?.title ?? 'Input PDF File'}</label>
          <input id="pdfs-input-path" data-param-key="input_path" className="pdfs-path" type="text" value={inputPath} onChange={(event) => setParam('input_path', event.target.value)} placeholder="Paste a local PDF path or choose a file" />
          <input ref={picker} className="pdfs-hidden" type="file" accept="application/pdf,.pdf" onChange={onPick} />
          {uploadError && <pre className="pdfs-error" role="alert">{uploadError}</pre>}
        </section>
        <section className="pdfs-action-section">
          <div className="pdfs-section-head"><h2>02 <span>{schema.action?.title ?? 'Action'}</span></h2><button type="button" className="pdfs-run" disabled={!deps.ready || execute.busy} onClick={run}>{execute.busy ? `${execute.state.elapsedSeconds.toFixed(1)}s` : 'Run action'} <span aria-hidden="true">↗</span></button></div>
          <div className="pdfs-switch" data-param-key="action" role="group" aria-label={schema.action?.title ?? 'Action'}>
            {actions.map((option) => <button type="button" key={option} aria-pressed={action === option} onClick={() => setParam('action', option)}>{option.replace('_', ' ')}</button>)}
          </div>
        </section>
        {execute.state.error && <pre className="pdfs-error pdfs-run-error" role="alert">{execute.state.error}</pre>}
        {action === 'extract_text' ? (
          <section className="pdfs-output">
            <div className="pdfs-section-head pdfs-output-head"><h2>03 <span>Extracted text</span></h2><div className="pdfs-output-tools">{completed && <span className="pdfs-count">{String(count)} characters</span>}{artifact && <a href={resolveUrl(`/api/artifacts/content?path=${encodeURIComponent(artifact.path)}`)} download={artifact.name}>Download text ↗</a>}</div></div>
            <label className="pdfs-search-label" htmlFor="pdfs-search">Find in document</label><input id="pdfs-search" type="search" className="pdfs-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search full extracted text" />
            <div className="pdfs-reader" aria-live="polite">{visibleText === null ? <p>{execute.busy ? `Extracting… ${execute.state.elapsedSeconds.toFixed(1)} seconds` : 'Extracted text will appear here.'}</p> : visibleText ? <pre>{visibleText}</pre> : <p>{needle ? 'No matching lines.' : 'The extracted text is empty.'}</p>}</div>
          </section>
        ) : action === 'inspect_info' ? (
          <section className="pdfs-output">
            <div className="pdfs-section-head pdfs-output-head"><h2>03 <span>PDF information</span></h2>{artifact && <a href={resolveUrl(`/api/artifacts/content?path=${encodeURIComponent(artifact.path)}`)} download={artifact.name}>Download JSON ↗</a>}</div>
            {completed && rows.length === 0 ? <p className="pdfs-empty-info">No metadata fields were returned.</p> : <dl className="pdfs-info-table">{completed ? rows.map(([key, value]) => <div className="pdfs-info-row" key={key}><dt>{key.replace(/_/g, ' ')}</dt><dd>{String(value)}</dd></div>) : <p className="pdfs-reader-note">Returned pdfinfo fields will appear here.</p>}</dl>}
          </section>
        ) : null}
      </div>
      <aside className="pdfs-dependency-dock" data-tool-gate-region="pdf_tools"><DependencyGate toolId="pdf_tools" state={deps} accent="#C8102E" /></aside>
    </main>
  )
}
