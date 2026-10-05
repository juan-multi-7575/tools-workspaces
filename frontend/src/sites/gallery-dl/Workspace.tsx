import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { errorMessage, resolveUrl, type ToolManifest } from '../../lib/api'
import { initialParamsFromManifest, useToolExecute } from '../../hooks/useToolExecute'
import { useToolDeps } from '../../hooks/useToolDeps'
import DependencyGate from '../../components/deps/DependencyGate'
import ToolResultPanel from '../../components/tools/ToolResultPanel'
interface Archive { name: string; path: string; url: string; bytes: number; source?: string }
export function ArchiveFrame({ name, path, url, bytes, source }: Archive) {
  return <article className="gd-mat"><div className="gd-print"><p className="gd-kind">ZIP</p><h3>{name}</h3><p>{bytes.toLocaleString()} bytes</p><a href={url} download={name}>Download archive</a></div><div className="gd-caption">{source && <p>{source}</p>}<p>{path}</p></div></article>
}
export default function Workspace({ manifest, initialInputPath }: { manifest: ToolManifest; initialInputPath?: string }) {
  const execute = useToolExecute('gallery-dl')
  const deps = useToolDeps('gallery-dl')
  const [params, setParams] = useState(() => initialParamsFromManifest(manifest, { url: initialInputPath ?? '' }))
  const [submitted, setSubmitted] = useState('')
  const [history, setHistory] = useState<Archive[]>([])
  const urls = useRef<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [unpreserved, setUnpreserved] = useState(false)
  useEffect(() => () => urls.current.forEach(URL.revokeObjectURL), [])
  const signature = JSON.stringify(params)
  const setKey = (key: string, value: unknown) => setParams(previous => ({ ...previous, [key]: value }))
  const run = async () => {
    setError(null); setSubmitted(signature)
    const result = await execute.run(params)
    if (result?.status !== 'completed') return
    setSaving(true); setUnpreserved(true)
    try {
      if (!result.artifacts.length) throw new Error('No archive was returned.')
      const archives: Archive[] = []
      for (const artifact of result.artifacts) {
        const response = await fetch(resolveUrl(`/api/artifacts/content?path=${encodeURIComponent(artifact.path)}`))
        if (!response.ok) throw new Error(await response.text())
        const blob = await response.blob()
        if (!blob.size) throw new Error('The returned archive is empty.')
        const url = URL.createObjectURL(blob); urls.current.push(url)
        archives.push({ ...artifact, url, bytes: blob.size, source: String(params.url) })
      }
      setHistory(previous => [...archives, ...previous]); setUnpreserved(false)
    } catch (cause) { setError(errorMessage(cause)) } finally { setSaving(false) }
  }
  return <div className="gd-root"><header className="gd-header"><Link to="/">All tools</Link><span>gallery-dl</span></header>
    <main className="gd-work" onDragOver={e => { if (e.dataTransfer.types.includes('text/plain') || e.dataTransfer.types.includes('text/uri-list')) e.preventDefault() }} onDrop={e => { const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain'); if (url) { e.preventDefault(); setKey('url', url.trim()) } }}>
      <section className="gd-intake"><h1>A collection<br />starts here.</h1><p>Paste a gallery URL, then collect its images into a ZIP.</p>
        {Object.entries(manifest.parameters_schema).map(([key, spec]) => <label key={key} htmlFor={`gd-${key}`}>{(spec as { title?: string }).title ?? (key === 'url' ? 'Gallery URL' : key)}<input id={`gd-${key}`} data-param-key={key} value={String(params[key] ?? '')} onChange={e => setKey(key, e.target.value)} placeholder="Paste a gallery URL" /></label>)}
        <p className="gd-note">Each run writes gallery.zip. Save your download before leaving; repeat runs replace the archive on disk.</p>
      </section>
      <section className="gd-results"><h2>Saved collections</h2>
        {execute.state.result && submitted !== signature && <p role="status">URL changed. Collect again for this source.</p>}
        {execute.state.phase !== 'idle' && <div className="gd-report"><ToolResultPanel toolId="gallery-dl" toolName="gallery-dl" state={{ ...execute.state, phase: error ? 'failed' : saving ? 'executing' : execute.state.phase, error: error ?? execute.state.error, result: null }} /></div>}
        {!history.length && <div className="gd-mat gd-empty"><div className="gd-print"><p>No archive collected.</p><p>The ZIP download will appear here.</p></div></div>}
        <div className="gd-grid">{history.map(archive => <ArchiveFrame key={archive.url} {...archive} />)}</div>
      </section>
    </main><footer className="gd-dock" data-tool-gate-region="gallery-dl"><DependencyGate toolId="gallery-dl" state={deps} accent="#8A8A8A" /><button disabled={!deps.ready || execute.busy || saving || unpreserved || !String(params.url).trim()} onClick={() => void run()}>{execute.busy ? `${execute.state.elapsedSeconds.toFixed(1)}s elapsed` : saving ? 'Saving archive…' : 'Collect gallery'}</button></footer>
  </div>
}
