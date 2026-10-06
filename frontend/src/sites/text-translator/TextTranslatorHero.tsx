import { useRef, useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowUpRight, FileText } from 'lucide-react'
import { api, errorMessage, type ToolManifest } from '../../lib/api'

export function TextTranslatorHero({ manifest }: { manifest: ToolManifest }) {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const upload = async (file?: File) => {
    if (!file) return
    setError(null)
    setBusy(true)
    try {
      const saved = await api.uploadFile(file)
      navigate(`/t/${manifest.id}/workspace`, { state: { inputPath: saved.path } })
    } catch (cause) { setError(errorMessage(cause)) }
    finally { setBusy(false) }
  }
  const onDrop = (event: DragEvent<HTMLElement>) => {
    if (!Array.from(event.dataTransfer.types).includes('Files')) return
    event.preventDefault()
    void upload(event.dataTransfer.files[0])
  }
  return <main className="txt-root txt-hero" onDragOver={(event) => { if (Array.from(event.dataTransfer.types).includes('Files')) event.preventDefault() }} onDrop={onDrop}>
    <header className="txt-hero__masthead"><a href="/" className="txt-index">Index <span>↗</span></a><span className="txt-hero__publication">Translation / 018</span><span className="txt-hero__id">{manifest.id}</span></header>
    <section className="txt-hero__body">
      <div className="txt-hero__title"><p className="txt-kicker">DOCUMENTS · LANGUAGES · PROOF</p><h1>Meaning,<br/><i>line by line.</i></h1></div>
      <div className="txt-hero__aside"><p>{manifest.description}</p><div className="txt-hero__actions">
        <button type="button" className="txt-action txt-action--primary" onClick={() => navigate(`/t/${manifest.id}/workspace`)}><ArrowUpRight size={17}/>Open the galley</button>
        <button type="button" className="txt-action txt-action--secondary" onClick={() => fileRef.current?.click()} disabled={busy}><FileText size={16}/>{busy ? 'Uploading…' : 'Choose a text file'}</button>
        <input ref={fileRef} className="txt-visually-hidden" type="file" accept=".txt,.md,.csv,.json,text/plain,text/markdown,application/json" aria-label="Choose a plain-text document" onChange={(event) => { void upload(event.target.files?.[0]); event.currentTarget.value = '' }}/>
      </div>{error && <p className="txt-error-message" role="alert">{error}</p>}</div>
    </section>
    <div className="txt-hero__folio" aria-hidden="true"><span>EDITORIAL TRANSLATION</span><span>01 — SOURCE</span><span>02 — LANGUAGE</span><span>03 — PROOF</span></div>
  </main>
}
