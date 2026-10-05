import { useRef, useState, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, errorMessage, type ToolManifest } from '../../lib/api'

export default function PdfToolsHero({ manifest }: { manifest: ToolManifest }) {
  const navigate = useNavigate()
  const picker = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const choose = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setBusy(true); setError(null)
    try {
      const uploaded = await api.uploadFile(file)
      if (!uploaded?.path) throw new Error('Upload response did not include a file path.')
      navigate('/t/pdf_tools/workspace', { state: { inputPath: uploaded.path } })
    } catch (cause) { setError(errorMessage(cause)) } finally { setBusy(false); event.target.value = '' }
  }
  return (
    <main className="pdfs-root pdfs-hero">
      <p className="pdfs-kicker">DOCUMENT DESK <span>·</span> 01</p>
      <h1 className="pdfs-wordmark">PDF<br /><em>Utilities</em></h1>
      <p className="pdfs-hero-copy">{manifest.description}</p>
      <div className="pdfs-hero-actions">
        <button className="pdfs-button pdfs-button--red" type="button" onClick={() => picker.current?.click()} disabled={busy}>
          {busy ? 'Uploading…' : 'Choose a PDF'}
        </button>
        <button className="pdfs-button" type="button" onClick={() => navigate('/t/pdf_tools/workspace')}>Open the workspace</button>
        <input ref={picker} type="file" accept="application/pdf,.pdf" hidden onChange={choose} />
      </div>
      {error && <pre className="pdfs-error" role="alert">{error}</pre>}
      <div className="pdfs-hero-foot"><span>EXTRACT TEXT / INSPECT INFO</span><span>PDF · POPPLER</span></div>
    </main>
  )
}
