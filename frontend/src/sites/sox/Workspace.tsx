import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import WaveSurfer from 'wavesurfer.js'
import { api, errorMessage, resolveUrl, type ToolManifest } from '../../lib/api'
import { initialParamsFromManifest, useToolExecute } from '../../hooks/useToolExecute'
import { useToolDeps } from '../../hooks/useToolDeps'
import DependencyGate from '../../components/deps/DependencyGate'
import ToolResultPanel from '../../components/tools/ToolResultPanel'
interface SavedAudio { name: string; path: string; url: string; signature: string }
function Playback({ url }: { url: string }) {
  const container = useRef<HTMLDivElement>(null)
  const wave = useRef<WaveSurfer | null>(null)
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!container.current) return
    setReady(false); setError(null)
    const instance = WaveSurfer.create({ container: container.current, url, waveColor: '#FFE0BD', progressColor: '#E8A33D', height: 112, normalize: false })
    wave.current = instance
    instance.on('ready', () => setReady(true))
    instance.on('play', () => setPlaying(true)); instance.on('pause', () => setPlaying(false))
    instance.on('error', cause => setError(errorMessage(cause)))
    return () => { instance.destroy(); wave.current = null }
  }, [url])
  return <div className="sox-playback"><div ref={container} />{error ? <pre role="alert">{error}</pre> : <button disabled={!ready} onClick={() => { wave.current?.playPause().catch(cause => setError(errorMessage(cause))) }}>{!ready ? 'Loading audio…' : playing ? 'Pause' : 'Play'}</button>}</div>
}
export default function Workspace({ manifest, initialInputPath }: { manifest: ToolManifest; initialInputPath?: string }) {
  const execute = useToolExecute('sox')
  const deps = useToolDeps('sox')
  const [params, setParams] = useState(() => initialParamsFromManifest(manifest, { input_path: initialInputPath ?? '', effect: '' }))
  const [stages, setStages] = useState<string[]>([''])
  const [drag, setDrag] = useState<number | null>(null)
  const [submitted, setSubmitted] = useState('')
  const [history, setHistory] = useState<SavedAudio[]>([])
  const urls = useRef<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [unpreserved, setUnpreserved] = useState(false)
  const picker = useRef<HTMLInputElement>(null)
  useEffect(() => () => urls.current.forEach(URL.revokeObjectURL), [])
  const setKey = (key: string, value: unknown) => setParams(previous => ({ ...previous, [key]: value }))
  const changeStages = (value: string[]) => { setStages(value); setKey('effect', value.map(s => s.trim()).filter(Boolean).join(' ')) }
  const path = String(params.input_path ?? '')
  const signature = JSON.stringify(params)
  const output = submitted === signature ? execute.state.result?.artifacts[0]?.path ?? '<output>' : '<output>'
  const upload = async (file?: File) => {
    if (!file) return
    setUploading(true); setError(null)
    try { const value = await api.uploadFile(file); setKey('input_path', value.path) } catch (cause) { setError(errorMessage(cause)) } finally { setUploading(false) }
  }
  const run = async () => {
    setError(null); setSubmitted(signature)
    const result = await execute.run(params)
    if (result?.status !== 'completed') return
    setSaving(true); setUnpreserved(true)
    try {
      for (const artifact of result.artifacts) {
        const response = await fetch(resolveUrl(`/api/artifacts/content?path=${encodeURIComponent(artifact.path)}`))
        if (!response.ok) throw new Error(await response.text())
        const blob = await response.blob()
        if (!blob.size) throw new Error('The returned audio file is empty.')
        const url = URL.createObjectURL(blob); urls.current.push(url)
        setHistory(previous => [{ ...artifact, url, signature }, ...previous])
      }
      if (!result.artifacts.length) throw new Error('No audio file was returned.')
      setUnpreserved(false)
    } catch (cause) { setError(errorMessage(cause)) } finally { setSaving(false) }
  }
  return <div className="sox-root">
    <header className="sox-header"><Link to="/">All tools</Link><span>SoX / DSP effect rack</span></header>
    <div className="sox-commandbar"><code>{`sox ${path || '<input>'} ${String(params.effect) || '<effect tokens>'} ${output}`}</code><small>Executed order: <code>{`sox ${path || '<input>'} ${output} ${String(params.effect) || '<effect tokens>'}`}</code></small></div>
    <main className="sox-work" onDragOver={e => { if (e.dataTransfer.types.includes('Files')) e.preventDefault() }} onDrop={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); void upload(e.dataTransfer.files[0]) } }}>
      <section className="sox-rack"><h1>Signal chain</h1>
        <label htmlFor="sox-source">Input audio path</label><input id="sox-source" data-param-key="input_path" value={path} onChange={e => setKey('input_path', e.target.value)} placeholder="Paste an absolute path" />
        <p className="sox-note">input_path is required, although the parameter schema does not list it.</p>
        <button onClick={() => picker.current?.click()} disabled={uploading}>{uploading ? 'Uploading…' : 'Choose audio or drop it anywhere in the rack'}</button>
        <input ref={picker} type="file" accept="audio/*" hidden onChange={e => { void upload(e.target.files?.[0]); e.target.value = '' }} />
        <p className="sox-note">Use WAV input for WAV output. A repeat run replaces the file on disk; saved downloads below last until you leave this page.</p>
        <div className="sox-chain">{stages.map((stage, index) => <div className="sox-stage" key={index} draggable onDragStart={e => { setDrag(index); e.dataTransfer.setData('text/plain', String(index)) }} onDragOver={e => { if (drag !== null) e.preventDefault() }} onDrop={e => { if (drag === null) return; e.preventDefault(); e.stopPropagation(); const next = [...stages]; const [moved] = next.splice(drag, 1); next.splice(index, 0, moved); changeStages(next); setDrag(null) }} onDragEnd={() => setDrag(null)}>
          <label htmlFor={`sox-stage-${index}`}>Stage {index + 1} / drag to reorder</label>
          <input id={`sox-stage-${index}`} data-param-key="effect" value={stage} placeholder="Effect tokens, e.g. gain -3" onChange={e => changeStages(stages.map((s, i) => i === index ? e.target.value : s))} />
          <div className="sox-stage-actions"><button disabled={index === 0} onClick={() => { const next = [...stages]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; changeStages(next) }}>Move up</button><button onClick={() => changeStages(stages.length === 1 ? [''] : stages.filter((_, i) => i !== index))}>Remove stage</button></div>
          {index < stages.length - 1 && <svg className="sox-cable" viewBox="0 0 100 40" aria-hidden="true"><path d="M15 0 C15 35 85 5 85 40" fill="none" stroke="currentColor" strokeWidth="3" /></svg>}
        </div>)}</div>
        <button onClick={() => changeStages([...stages, ''])}>Add effect stage</button>
        {Object.entries(manifest.parameters_schema).filter(([key]) => key !== 'effect' && key !== 'input_path').map(([key, spec]) => <label key={key}>{(spec as { title?: string }).title ?? key}<input data-param-key={key} value={String(params[key] ?? '')} onChange={e => setKey(key, e.target.value)} /></label>)}
      </section>
      <section className="sox-output"><h2>Output</h2>
        {execute.state.result && submitted !== signature && <p role="status">Settings changed. Run again to update the result.</p>}
        {execute.state.phase !== 'idle' && <div className="sox-report"><ToolResultPanel toolId="sox" toolName="SoX" state={{ ...execute.state, result: null }} /></div>}
        {error && <pre role="alert">{error}</pre>}
        {!history.length && <p className="sox-empty">Run the chain to hear the output.</p>}
        {history.map((audio, index) => <article key={audio.url}><h3>{audio.name}</h3><p className="sox-note">{audio.path}</p>{index === 0 && <Playback url={audio.url} />}<a href={audio.url} download={`${index + 1}-${audio.name}`}>Download saved audio</a></article>)}
      </section>
    </main>
    <footer className="sox-dock" data-tool-gate-region="sox"><DependencyGate toolId="sox" state={deps} accent="#E8A33D" /><button disabled={!deps.ready || execute.busy || saving || uploading || unpreserved} onClick={() => void run()}>{execute.busy ? `${execute.state.elapsedSeconds.toFixed(1)}s elapsed` : saving ? 'Saving output…' : 'Run chain'}</button></footer>
  </div>
}
