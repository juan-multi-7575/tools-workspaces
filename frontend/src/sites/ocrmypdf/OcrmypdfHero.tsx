import { useRef, useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload } from 'lucide-react'
import { api, errorMessage } from '../../lib/api'
import type { ToolManifest } from '../../lib/api'

export default function OcrmypdfHero({ manifest }: { manifest: ToolManifest }) {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const upload = async (file?: File) => {
    if (!file) return
    setBusy(true); setError('')
    try { const result = await api.uploadFile(file); navigate('/t/ocrmypdf/workspace', { state: { inputPath: result.path } }) }
    catch (cause) { setError(errorMessage(cause)); setBusy(false) }
  }
  const onDrop = (event: DragEvent) => { if (Array.from(event.dataTransfer.types).includes('Files')) { event.preventDefault(); void upload(event.dataTransfer.files[0]) } }
  return <main className="om-hero" onDragOver={(event) => { if (Array.from(event.dataTransfer.types).includes('Files')) event.preventDefault() }} onDrop={onDrop}>
    <div className="om-hero__copy"><p className="om-kicker">DOCUMENT CONSERVATION · 01</p><h1 className="om-wordmark">OCR<br/>myPDF</h1><p className="om-description">{manifest.description}</p><div className="om-actions">
      <button className="om-button om-button--cyan" type="button" onClick={() => fileRef.current?.click()} disabled={busy}><Upload size={17}/>{busy ? 'Uploading…' : 'Choose a PDF'}</button>
      <button className="om-button" type="button" onClick={() => navigate('/t/ocrmypdf/workspace')}>Open an empty workspace</button>
      <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden aria-label="Choose a PDF" onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = '' }}/>
    </div>{error && <p className="om-error-text" role="alert">{error}</p>}</div>
    <div className="om-hero__exhibit" aria-hidden="true"><div className="om-paper"><span>EXHIBIT A</span><i/><i/><i/><i/><i/><i/><i/><b>TEXT LAYER</b></div><div className="om-exhibit-caption">SCAN → SEARCHABLE DOCUMENT</div></div>
  </main>
}
