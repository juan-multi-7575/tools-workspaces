import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, errorMessage, type ToolManifest } from '../../lib/api'
export default function Hero({ manifest }: { manifest: ToolManifest }) {
  const navigate = useNavigate()
  const picker = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const upload = async (file?: File) => {
    if (!file) return
    setBusy(true); setError(null)
    try { const value = await api.uploadFile(file); navigate('/t/sox/workspace', { state: { inputPath: value.path } }) }
    catch (cause) { setError(errorMessage(cause)); setBusy(false) }
  }
  return <div className="sox-root" onDragOver={e => { if (e.dataTransfer.types.includes('Files')) e.preventDefault() }} onDrop={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); void upload(e.dataTransfer.files[0]) } }}>
    <main className="sox-hero">
      <h1>Sound.<br />Through a chain.</h1>
      <p>{manifest.description}</p>
      <code className="sox-command">{'sox <input> <effect tokens> <output>'}</code>
      <div className="sox-actions"><button disabled={busy} onClick={() => picker.current?.click()}>{busy ? 'Uploading…' : 'Choose audio'}</button><button onClick={() => navigate('/t/sox/workspace')}>Open an empty workspace</button></div>
      <input ref={picker} type="file" accept="audio/*" hidden aria-label="Choose audio file" onChange={e => { void upload(e.target.files?.[0]); e.target.value = '' }} />
      {error && <pre role="alert">{error}</pre>}
    </main>
  </div>
}
