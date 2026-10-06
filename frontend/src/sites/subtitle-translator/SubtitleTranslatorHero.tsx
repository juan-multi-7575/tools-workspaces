import { useRef, useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Captions, FileUp } from 'lucide-react'
import { api, errorMessage, type ToolManifest } from '../../lib/api'

export function SubtitleTranslatorHero({ manifest }: { manifest: ToolManifest }) {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const upload = async (file?: File) => {
    if (!file) return
    setError(null)
    setBusy(true)
    try {
      const ext = file.name.toLowerCase().split('.').pop()
      if (ext !== 'srt' && ext !== 'vtt') throw new Error('Choose an .srt or .vtt subtitle file.')
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
  return <main className="sub-root sub-hero" onDragOver={(event) => { if (Array.from(event.dataTransfer.types).includes('Files')) event.preventDefault() }} onDrop={onDrop}>
    <header className="sub-masthead"><a href="/" className="sub-home">← Index</a><span className="sub-brand"><Captions size={17}/> Cue ledger</span><span className="sub-tool-id">{manifest.id}</span></header>
    <section className="sub-hero__body">
      <div className="sub-hero__copy"><p className="sub-eyebrow">Subtitle translation · line by line</p><h1>Keep every cue<br/>in its place.</h1><p className="sub-lede">{manifest.description}</p>
        <div className="sub-hero__actions"><button type="button" className="sub-button sub-button--dark" onClick={() => navigate(`/t/${manifest.id}/workspace`)}><ArrowRight size={16}/>Open the cue ledger</button><button type="button" className="sub-button sub-button--light" onClick={() => fileRef.current?.click()} disabled={busy}><FileUp size={16}/>{busy ? 'Uploading…' : 'Upload subtitles'}</button><input ref={fileRef} className="sub-visually-hidden" type="file" accept=".srt,.vtt,application/x-subrip,text/vtt" aria-label="Choose an SRT or VTT subtitle file" onChange={(event) => { void upload(event.target.files?.[0]); event.currentTarget.value = '' }}/></div>
        {error && <p className="sub-error" role="alert">{error}</p>}
      </div>
      <aside className="sub-hero__folio" aria-hidden="true"><span>READING / 01</span><div className="sub-hero__rule"/><strong>01</strong><p>Original<br/>alongside<br/>translation.</p><div className="sub-hero__foot">INDEX · COMPARE · RETURN</div></aside>
    </section>
    <footer className="sub-hero__footer"><span>{manifest.name}</span><span>Source cues · returned translation · aligned timing</span></footer>
  </main>
}

export default SubtitleTranslatorHero
