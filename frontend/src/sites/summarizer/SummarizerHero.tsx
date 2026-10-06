import { useRef, useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, BookOpen, FileUp } from 'lucide-react'
import { api, errorMessage, type ToolManifest } from '../../lib/api'
import { validateSummarizerFile } from './summarizerState'

export interface SummarizerHeroProps {
  manifest: ToolManifest
}

export function SummarizerHero({ manifest }: SummarizerHeroProps) {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const upload = async (file?: File) => {
    if (!file) return
    setError(null)
    setUploading(true)
    try {
      const validationError = await validateSummarizerFile(file)
      if (validationError) throw new Error(validationError)
      const uploaded = await api.uploadFile(file)
      navigate('/t/summarizer/workspace', { state: { inputPath: uploaded.path } })
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setUploading(false)
    }
  }

  const onDrop = (event: DragEvent<HTMLElement>) => {
    if (!Array.from(event.dataTransfer.types).includes('Files')) return
    event.preventDefault()
    void upload(event.dataTransfer.files[0])
  }

  return <main className="sum-root sum-hero" onDragOver={(event) => { if (Array.from(event.dataTransfer.types).includes('Files')) event.preventDefault() }} onDrop={onDrop}>
    <header className="sum-hero__masthead"><span className="sum-mark" aria-hidden="true"><BookOpen size={17}/></span><span>Reading desk</span><span className="sum-hero__tool">{manifest.id}</span></header>
    <section className="sum-hero__body">
      <div className="sum-hero__copy">
        <p className="sum-eyebrow">A close reading, made navigable</p>
        <h1>Find the lines<br/>that carry the whole.</h1>
        <p className="sum-hero__lede">{manifest.description}</p>
        <div className="sum-hero__actions">
          <button type="button" className="sum-button sum-button--dark" onClick={() => navigate('/t/summarizer/workspace')}><ArrowRight size={16}/>Start with text</button>
          <button type="button" className="sum-button sum-button--light" onClick={() => fileRef.current?.click()} disabled={uploading}><FileUp size={16}/>{uploading ? 'Uploading…' : 'Choose a source file'}</button>
          <input ref={fileRef} className="sum-visually-hidden" type="file" accept=".txt,.md,.srt,.vtt,text/plain,text/markdown" aria-label="Choose a UTF-8 text source file" onChange={(event) => { void upload(event.target.files?.[0]); event.currentTarget.value = '' }}/>
        </div>
        {error && <p className="sum-error" role="alert">{error}</p>}
      </div>
      <div className="sum-hero__folio" aria-hidden="true">
        <span className="sum-hero__folio-label">MARGIN / NOTES</span>
        <div className="sum-hero__folio-rule"/>
        <span className="sum-hero__folio-number">01</span>
        <p>Source<br/>in context.</p>
        <div className="sum-hero__folio-mark">—</div>
        <span className="sum-hero__folio-foot">READ · SELECT · RETURN</span>
      </div>
    </section>
    <footer className="sum-hero__foot"><span>Summarizer</span><span>Text or document · your settings · returned takeaways</span></footer>
  </main>
}

export default SummarizerHero
