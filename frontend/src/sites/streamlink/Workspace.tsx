import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { errorMessage, resolveUrl, type ToolManifest } from '../../lib/api'
import { initialParamsFromManifest, useToolExecute } from '../../hooks/useToolExecute'
import { useToolDeps } from '../../hooks/useToolDeps'
import DependencyGate from '../../components/deps/DependencyGate'
import ToolResultPanel from '../../components/tools/ToolResultPanel'
import type { ToolRunPhase } from '../../lib/toolPageTypes'
interface Capture { name: string; path: string; url: string; bytes: number }
export function StatusBoard({ phase, verified, error }: { phase: ToolRunPhase; verified: boolean; error: string | null }) {
  const failed = phase === 'failed' || (phase === 'completed' && !!error)
  const label = failed ? 'OFF AIR' : phase === 'completed' ? verified ? 'CAPTURED' : 'VERIFYING' : phase === 'executing' ? 'CAPTURING' : phase === 'cancelled' ? 'STOPPED' : 'STANDBY'
  const fallbackFailed = failed && !/streamlink timed out|url is required|Failed to fetch|NetworkError|artifact|returned file|recording is empty/i.test(error ?? '')
  return <section className="sl-board" data-failed={failed}><h1>{label}</h1>
    {fallbackFailed && <p>Both the capture and the yt-dlp fallback failed.</p>}
    {failed && !fallbackFailed && <p>The capture did not produce a saved recording.</p>}
    {phase === 'idle' && <p>Enter a stream URL to begin recording.</p>}
    {error && <pre role="alert">{error}</pre>}
  </section>
}
export default function Workspace({ manifest, initialInputPath }: { manifest: ToolManifest; initialInputPath?: string }) {
  const execute = useToolExecute('streamlink')
  const deps = useToolDeps('streamlink')
  const [params, setParams] = useState(() => initialParamsFromManifest(manifest, { url: initialInputPath ?? '' }))
  const [submitted, setSubmitted] = useState('')
  const [history, setHistory] = useState<Capture[]>([])
  const urls = useRef<string[]>([])
  const [verified, setVerified] = useState(false)
  const [saving, setSaving] = useState(false)
  const [unpreserved, setUnpreserved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => () => urls.current.forEach(URL.revokeObjectURL), [])
  const signature = JSON.stringify(params)
  const setKey = (key: string, value: unknown) => setParams(previous => ({ ...previous, [key]: value }))
  const run = async () => {
    setError(null); setVerified(false); setSubmitted(signature)
    const result = await execute.run(params)
    if (result?.status !== 'completed') return
    setSaving(true); setUnpreserved(true)
    try {
      if (!result.artifacts.length) throw new Error('No recording artifact was returned.')
      const captures: Capture[] = []
      for (const artifact of result.artifacts) {
        const response = await fetch(resolveUrl(`/api/artifacts/content?path=${encodeURIComponent(artifact.path)}`))
        if (!response.ok) throw new Error(`The returned artifact could not be read: ${await response.text()}`)
        const blob = await response.blob()
        if (!blob.size) throw new Error('The returned recording is empty.')
        const url = URL.createObjectURL(blob); urls.current.push(url)
        captures.push({ ...artifact, url, bytes: blob.size })
      }
      setHistory(previous => [...captures, ...previous]); setVerified(true); setUnpreserved(false)
    } catch (cause) { setError(errorMessage(cause)) } finally { setSaving(false) }
  }
  const phase = error ? 'failed' : execute.state.phase
  return <div className="sl-root"><header className="sl-header"><Link to="/">All tools</Link><span>Streamlink / Live stream capturer</span></header>
    <main className="sl-work" onDragOver={e => { if (e.dataTransfer.types.includes('text/plain') || e.dataTransfer.types.includes('text/uri-list')) e.preventDefault() }} onDrop={e => { const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain'); if (url) { e.preventDefault(); setKey('url', url.trim()) } }}>
      <StatusBoard phase={phase} verified={verified} error={error ?? execute.state.error} />
      {execute.state.result && signature !== submitted && <p className="sl-stale" role="status">URL changed. Capture again for this source.</p>}
      <section className="sl-controls"><h2>Capture controls</h2>{Object.entries(manifest.parameters_schema).map(([key, spec]) => <label key={key} htmlFor={`sl-${key}`}>{(spec as { title?: string }).title ?? (key === 'url' ? 'Stream URL' : key)}<input id={`sl-${key}`} data-param-key={key} value={String(params[key] ?? '')} onChange={e => setKey(key, e.target.value)} placeholder="Paste a stream URL" /></label>)}
        <p>The best available stream is tried first, then the worst. If capture fails, yt-dlp is tried.</p><p>Each capture writes stream.mp4. Save your download before leaving; repeat runs replace the file on disk.</p>
      </section>
      {execute.state.phase !== 'idle' && <div className="sl-report"><ToolResultPanel toolId="streamlink" toolName="Streamlink" state={{ ...execute.state, phase: execute.state.phase === 'completed' && !verified && !error ? 'executing' : phase, error: null, result: null }} /></div>}
      <section className="sl-artifacts"><h2>Saved recordings</h2>{!history.length && <p>No recording saved yet.</p>}{history.map((capture, index) => <article key={capture.url}><h3>{capture.name}</h3><p>{capture.path}</p><span>{capture.bytes.toLocaleString()} bytes</span><a href={capture.url} download={`${index + 1}-${capture.name}`}>Download recording</a></article>)}</section>
    </main><footer className="sl-dock" data-tool-gate-region="streamlink"><DependencyGate toolId="streamlink" state={deps} accent="#FF4D00" /><button disabled={!deps.ready || execute.busy || saving || unpreserved || !String(params.url).trim()} onClick={() => void run()}>{execute.busy ? `${execute.state.elapsedSeconds.toFixed(1)}s elapsed` : saving ? 'Saving recording…' : 'Capture stream'}</button></footer>
  </div>
}
