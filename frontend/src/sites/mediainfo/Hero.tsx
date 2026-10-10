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
    try { const value = await api.uploadFile(file); navigate('/t/mediainfo/workspace', { state: { inputPath: value.path } }) }
    catch (cause) { setError(errorMessage(cause)); setBusy(false) }
  }
  return <div className="mi-root" onDragOver={e => { if (e.dataTransfer.types.includes('Files')) e.preventDefault() }} onDrop={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); void upload(e.dataTransfer.files[0]) } }}>
    <main className="mi-hero">
      <h1>Know your<br /><em>media.</em></h1>
      <p>{manifest.description}</p>
      <p className="mi-description">Containers, codecs, and streams.<br />Read a file from the inside out.</p>
      <div className="mi-actions"><button disabled={busy} onClick={() => picker.current?.click()}>{busy ? 'Uploading…' : 'Choose media'}</button><button onClick={() => navigate('/t/mediainfo/workspace')}>Open an empty workspace</button></div>
      <input ref={picker} type="file" accept="audio/*,video/*" hidden aria-label="Choose media file" onChange={e => { void upload(e.target.files?.[0]); e.target.value = '' }} />
      {error && <pre role="alert">{error}</pre>}
    </main>
  </div>
}
