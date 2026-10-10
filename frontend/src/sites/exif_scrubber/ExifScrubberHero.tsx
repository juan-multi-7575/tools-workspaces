import { useRef, useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, errorMessage, type ToolManifest } from '../../lib/api'

export default function ExifScrubberHero({ manifest }: { manifest: ToolManifest }) {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const choose = async (file?: File) => {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const uploaded = await api.uploadFile(file)
      navigate('/t/exif_scrubber/workspace', { state: { inputPath: uploaded.path } })
    } catch (cause) {
      setError(errorMessage(cause))
      setBusy(false)
    }
  }
  const drop = (event: DragEvent) => {
    if (!Array.from(event.dataTransfer.types).includes('Files')) return
    event.preventDefault()
    void choose(event.dataTransfer.files?.[0])
  }

  return (
    <main className="exif-site exif-hero" onDragOver={(event) => { if (Array.from(event.dataTransfer.types).includes('Files')) event.preventDefault() }} onDrop={drop}>
      <h1>{manifest.name}</h1>
      <p>{manifest.description}</p>
      <ul>
        <li><button type="button" onClick={() => fileRef.current?.click()} disabled={busy}>{busy ? 'Uploading…' : 'Choose a media file'}</button></li>
        <li><button type="button" onClick={() => navigate('/t/exif_scrubber/workspace')}>Open the workspace</button></li>
      </ul>
      <input ref={fileRef} className="exif-sr" type="file" accept="image/*,video/*" aria-label="Choose media file" onChange={(event) => { void choose(event.target.files?.[0]); event.target.value = '' }} />
      {error && <p role="alert">{error}</p>}
    </main>
  )
}
