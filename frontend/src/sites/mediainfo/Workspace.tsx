import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, errorMessage, type ToolManifest } from '../../lib/api'
import { initialParamsFromManifest, useToolExecute } from '../../hooks/useToolExecute'
import { useToolDeps } from '../../hooks/useToolDeps'
import DependencyGate from '../../components/deps/DependencyGate'
import ToolResultPanel from '../../components/tools/ToolResultPanel'
interface Field { type?: string; title?: string }
interface SavedProbe { url: string; name: string; data: Record<string, unknown> }
function rows(value: unknown, prefix = ''): [string, unknown][] {
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([key, item]) => rows(item, prefix ? `${prefix}.${key}` : key))
  return [[prefix, value]]
}
function Fields({ value }: { value: unknown }) {
  return <table className="mi-table"><tbody>{rows(value).map(([key, item]) => <tr key={key}><th scope="row">{key}</th><td data-probe-key={key}>{item === null ? 'null' : String(item)}</td></tr>)}</tbody></table>
}
export function ProbeData({ data }: { data: Record<string, unknown> | null }) {
  if (!data || !Object.keys(data).length) return <p className="mi-empty">The probe returned nothing.</p>
  const groups = new Map<string, Record<string, unknown>[]>()
  if (Array.isArray(data.streams)) for (const stream of data.streams) {
    if (!stream || typeof stream !== 'object') continue
    const type = typeof stream.codec_type === 'string' ? stream.codec_type : 'Stream'
    groups.set(type, [...groups.get(type) ?? [], stream])
  }
  return <div className="mi-probe">
    {Object.hasOwn(data, 'format') && <section className="mi-summary"><h2>Format</h2><Fields value={data.format} /></section>}
    {[...groups].map(([type, streams]) => <section className="mi-streams" key={type} data-stream-type={type}><h2>{type}</h2><p className="mi-description">Stream inspection</p>{streams.map((stream, index) => <article key={index}><Fields value={stream} /></article>)}</section>)}
    {Object.entries(data).filter(([key]) => key !== 'format' && key !== 'streams').map(([key, value]) => <section key={key}><h2>{key}</h2><Fields value={value} /></section>)}
  </div>
}
export default function Workspace({ manifest, initialInputPath }: { manifest: ToolManifest; initialInputPath?: string }) {
  const execute = useToolExecute('mediainfo')
  const deps = useToolDeps('mediainfo')
  const [params, setParams] = useState(() => initialParamsFromManifest(manifest, { input_path: initialInputPath ?? '' }))
  const [submitted, setSubmitted] = useState('')
  const [saved, setSaved] = useState<SavedProbe[]>([])
  const urls = useRef<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const picker = useRef<HTMLInputElement>(null)
  useEffect(() => () => urls.current.forEach(URL.revokeObjectURL), [])
  const signature = JSON.stringify(params)
  const setKey = (key: string, value: unknown) => setParams(previous => ({ ...previous, [key]: value }))
  const upload = async (file?: File) => {
    if (!file) return
    setUploading(true); setError(null)
    try { const value = await api.uploadFile(file); setKey('input_path', value.path) } catch (cause) { setError(errorMessage(cause)) } finally { setUploading(false) }
  }
  const run = async () => {
    setError(null); setSubmitted(signature)
    const result = await execute.run(params)
    if (result?.status === 'completed') {
      const data = result.data ?? {}
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
      urls.current.push(url)
      setSaved(previous => [{ name: result.artifacts[0]?.name ?? 'probe.json', url, data }, ...previous])
    }
  }
  return <div className="mi-root"><header className="mi-header"><Link to="/">All tools</Link><span>MediaInfo</span><span>Media / Stream inspector</span></header>
    <main className="mi-work" onDragOver={e => { if (e.dataTransfer.types.includes('Files')) e.preventDefault() }} onDrop={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); void upload(e.dataTransfer.files[0]) } }}>
      <section className="mi-intake"><h1>Inspect a file.</h1><p>Choose media, drop it here, or paste its path.</p>
        <button onClick={() => picker.current?.click()} disabled={uploading}>{uploading ? 'Uploading…' : 'Choose media'}</button>
        <input ref={picker} type="file" accept="audio/*,video/*" hidden aria-label="Upload media" onChange={e => { void upload(e.target.files?.[0]); e.target.value = '' }} />
        {Object.entries(manifest.parameters_schema).map(([key, unknownSpec]) => { const spec = unknownSpec as Field; return <label key={key} htmlFor={`mi-${key}`}>{spec.title ?? key}<input id={`mi-${key}`} data-param-key={key} value={String(params[key] ?? '')} onChange={e => setKey(key, e.target.value)} placeholder="Paste an absolute file path" /></label> })}
        <p className="mi-note">Repeat probes replace the JSON file on disk. Saved reports remain downloadable until you leave this page.</p>
        {saved.length > 0 && <div className="mi-downloads"><h2>Saved reports</h2>{saved.map((probe, index) => <a key={probe.url} href={probe.url} download={`${index + 1}-${probe.name}`}>{probe.name}</a>)}</div>}
      </section>
      <section className="mi-output">
        {execute.state.result && submitted !== signature && <p role="status">Source changed. Inspect again to update the report.</p>}
        {execute.state.phase !== 'idle' && <div className="mi-report"><ToolResultPanel toolId="mediainfo" toolName="MediaInfo" state={{ ...execute.state, result: null }} /></div>}
        {error && <pre role="alert">{error}</pre>}
        {execute.state.result?.status === 'completed' ? <ProbeData data={execute.state.result.data} /> : execute.state.phase === 'idle' ? <div className="mi-empty"><h2>A closer look.</h2><p className="mi-description">The container and its streams appear here after inspection.</p></div> : null}
      </section>
    </main><footer className="mi-dock" data-tool-gate-region="mediainfo"><DependencyGate toolId="mediainfo" state={deps} accent="#1B1E23" /><button disabled={!deps.ready || execute.busy || uploading} onClick={() => void run()}>{execute.busy ? `${execute.state.elapsedSeconds.toFixed(1)}s elapsed` : 'Inspect media'}</button></footer>
  </div>
}
