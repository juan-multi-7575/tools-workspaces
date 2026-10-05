import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, resolveUrl, type ToolManifest } from '../../lib/api'
import { useToolExecute } from '../../hooks/useToolExecute'
import { useToolDeps } from '../../hooks/useToolDeps'
import DependencyGate from '../../components/deps/DependencyGate'
import { createRunGeneration } from './runGeneration'

type FieldMap = Record<string, unknown>
type Capture = { label: string; path: string; fields: FieldMap }
type FieldStatus = 'present' | 'removed' | 'changed' | 'added' | 'unverified'
type FieldRow = { key: string; before?: unknown; after?: unknown; status: FieldStatus; privacy: string }
interface FieldSpec { title?: string; description?: string; enum?: (string | number)[]; default?: unknown }

const privacyTag = (key: string) => /gps|geotag|latitude|longitude|altitude|location/i.test(key) ? 'GPS / location'
  : /make|model|lens|serial|firmware|camera|device/i.test(key) ? 'Camera / device'
    : /artist|author|owner|copyright|creator|credit|username|person|subject|comment/i.test(key) ? 'Personal'
      : /date|time|created|modified/i.test(key) ? 'Date / time' : ''
const textValue = (value: unknown) => typeof value === 'string' ? value : JSON.stringify(value)
const fieldsFrom = (data: unknown): FieldMap => data && typeof data === 'object' && !Array.isArray(data) ? data as FieldMap : {}

export default function ExifScrubberWorkspace({ manifest, initialInputPath }: { manifest: ToolManifest; initialInputPath?: string }) {
  const navigate = useNavigate()
  const schema = (manifest.parameters_schema ?? {}) as Record<string, FieldSpec>
  const execute = useToolExecute('exif_scrubber')
  const inspect = useToolExecute('exif_scrubber')
  const deps = useToolDeps('exif_scrubber')
  const fileRef = useRef<HTMLInputElement>(null)
  const runGeneration = useRef(createRunGeneration())
  const [params, setParams] = useState<Record<string, unknown>>({
    input_path: initialInputPath ?? schema.input_path?.default ?? '',
    action: schema.action?.default ?? 'scrub',
  })
  const [before, setBefore] = useState<Capture | null>(null)
  const [after, setAfter] = useState<Capture | null>(null)
  const [cleanPath, setCleanPath] = useState('')
  const [filter, setFilter] = useState('')
  const [flaggedOnly, setFlaggedOnly] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [runError, setRunError] = useState('')
  const inputPath = String(params.input_path ?? '')
  const action = String(params.action ?? 'scrub')
  const setKey = (key: string, value: unknown) => setParams((current) => ({ ...current, [key]: value }))
  const invalidateRun = () => {
    runGeneration.current.invalidate()
    if (execute.busy) execute.cancel()
    else execute.reset()
    if (inspect.busy) inspect.cancel()
    else inspect.reset()
    setBefore(null); setAfter(null); setCleanPath(''); setRunError(''); setUploadError('')
  }
  const options = schema.action?.enum?.map(String) ?? ['scrub', 'inspect']
  const busy = execute.busy || inspect.busy

  const upload = async (file?: File) => {
    if (!file) return
    invalidateRun()
    setUploadError('')
    const uploadGeneration = runGeneration.current.start()
    try {
      const uploaded = await api.uploadFile(file)
      if (!runGeneration.current.isCurrent(uploadGeneration)) return
      setKey('input_path', uploaded.path)
    } catch (cause) {
      if (runGeneration.current.isCurrent(uploadGeneration)) setUploadError(cause instanceof Error ? cause.message : String(cause))
    }
  }
  const capture = async (path: string, label: string, generation: number) => {
    const result = await inspect.run({ ...params, input_path: path, action: 'inspect' })
    if (!runGeneration.current.isCurrent(generation)) return null
    if (!result || result.status !== 'completed') {
      setRunError(result?.error ?? '')
      return null
    }
    return { label, path, fields: fieldsFrom(result.data) } satisfies Capture
  }
  const run = async () => {
    const generation = runGeneration.current.start()
    setRunError('')
    setBefore(null); setAfter(null); setCleanPath('')
    if (action === 'inspect') {
      const original = await capture(inputPath, 'Original', generation)
      if (original && runGeneration.current.isCurrent(generation)) setBefore(original)
      return
    }
    const original = await capture(inputPath, 'Original', generation)
    if (!runGeneration.current.isCurrent(generation)) return
    if (!original) return
    setBefore(original)
    const scrubResult = await execute.run({ ...params, input_path: inputPath, action: 'scrub' })
    if (!runGeneration.current.isCurrent(generation)) return
    if (!scrubResult || scrubResult.status !== 'completed') {
      setRunError(scrubResult?.error ?? '')
      return
    }
    const output = scrubResult.artifacts[0]?.path
    if (!output) return
    setCleanPath(output)
    const cleaned = await capture(output, 'Scrubbed copy', generation)
    if (cleaned && runGeneration.current.isCurrent(generation)) setAfter(cleaned)
  }
  const rows = useMemo(() => {
    const keys = new Set([...Object.keys(before?.fields ?? {}), ...Object.keys(after?.fields ?? {})])
    const query = filter.trim().toLowerCase()
    return [...keys].map((key): FieldRow => {
      const b = before?.fields[key]
      const a = after?.fields[key]
      const status: FieldStatus = !after ? 'unverified' : b === undefined ? 'added' : a === undefined ? 'removed' : textValue(a) === textValue(b) ? 'present' : 'changed'
      return { key, before: b, after: a, status, privacy: privacyTag(key) }
    }).filter((row) => !flaggedOnly || Boolean(row.privacy))
      .filter((row) => !query || `${row.key} ${textValue(row.before ?? '')} ${textValue(row.after ?? '')}`.toLowerCase().includes(query))
      .sort((a, b) => a.key.localeCompare(b.key))
  }, [before, after, filter, flaggedOnly])
  const error = runError || uploadError
  const artifactUrl = cleanPath ? resolveUrl(`/api/artifacts/content?path=${encodeURIComponent(cleanPath)}`) : ''

  return (
    <div className="exif-site exif-workspace">
      <header className="exif-head"><a href="/">All tools</a><span>{manifest.name}</span><span>{manifest.id}</span></header>
      <main className="exif-main">
        <h1>Metadata ledger</h1>
        <p>{manifest.description}</p>
        <section className="exif-controls" aria-label="Metadata controls">
          <div data-param-key="input_path" className="exif-input-field">
            <label htmlFor="exif-path">{schema.input_path?.title ?? 'Input file'}</label>
            {schema.input_path?.description && <p>{schema.input_path.description}</p>}
            <div className="exif-file-line" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void upload(event.dataTransfer.files?.[0]) }}>
              <input id="exif-path" type="text" value={inputPath} onPaste={(event) => { const pasted = event.clipboardData.getData('text'); if (pasted) { invalidateRun(); setKey('input_path', pasted) } }} onChange={(event) => { invalidateRun(); setKey('input_path', event.target.value) }} placeholder="/path/to/image.jpg" />
              <button type="button" onClick={() => fileRef.current?.click()}>Browse…</button>
              <input ref={fileRef} className="exif-sr" type="file" accept="image/*,video/*" aria-label="Upload input media" onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = '' }} />
            </div>
          </div>
          <fieldset data-param-key="action" className="exif-action">
            <legend>{schema.action?.title ?? 'Operation'}</legend>
            {options.map((option) => <label key={option}><input type="radio" name="exif-action" value={option} checked={action === option} onChange={() => { invalidateRun(); setKey('action', option) }} /> {option}</label>)}
          </fieldset>
          <button type="button" onClick={() => void run()} disabled={busy || !deps.ready}>{busy ? 'Working…' : `Run ${action}`}</button>
          {busy && <span>{(execute.busy ? execute.state.elapsedSeconds : inspect.state.elapsedSeconds).toFixed(1)}s measured</span>}
        </section>
        {error && <p className="exif-error" role="alert">{error}</p>}
        {cleanPath && <p className="exif-clean">Clean copy: <a href={artifactUrl} download={cleanPath.split('/').pop()}>Download {cleanPath.split('/').pop()}</a></p>}
        <div className="exif-filter"><label>Search fields <input type="search" value={filter} onChange={(event) => setFilter(event.target.value)} /></label><label><input type="checkbox" checked={flaggedOnly} onChange={(event) => setFlaggedOnly(event.target.checked)} /> Privacy-relevant only</label></div>
        {before && <section className="exif-ledger" aria-label="Exif metadata">
          <header><h2>{after ? 'Before and after scrub' : 'Fields returned by inspect'}</h2><span>{rows.length} visible fields · {before.path.split('/').pop()}</span></header>
          <div className="exif-table-wrap"><table><thead><tr><th scope="col">Field</th><th scope="col">Before</th>{after && <th scope="col">After</th>}<th scope="col">Class</th><th scope="col">Result</th></tr></thead><tbody>
            {rows.map((row) => <tr key={row.key} data-status={row.status}><th scope="row">{row.key}</th><td>{row.before === undefined ? '—' : textValue(row.before)}</td>{after && <td>{row.after === undefined ? '— absent —' : textValue(row.after)}</td>}<td>{row.privacy || '—'}</td><td>{row.status === 'removed' ? 'removed' : row.status === 'unverified' ? 'awaiting re-inspection' : row.status}</td></tr>)}
            {rows.length === 0 && <tr><td colSpan={after ? 5 : 4}>{filter || flaggedOnly ? 'No fields match.' : 'The inspect payload contains no fields.'}</td></tr>}
          </tbody></table></div>
          {after && <p>Comparison uses the two completed inspect payloads shown above. A field is marked removed only when absent from the scrubbed file’s inspect result.</p>}
        </section>}
      </main>
      <footer className="exif-foot"><button type="button" onClick={() => navigate('/')}>Return to all tools</button><DependencyGate toolId="exif_scrubber" state={deps} /></footer>
    </div>
  )
}
