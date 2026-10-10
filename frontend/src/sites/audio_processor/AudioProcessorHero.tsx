import { useRef, useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, errorMessage } from '../../lib/api'
import type { ToolManifest } from '../../lib/api'
import { AUDIO_PROCESSOR_ID } from './audioProcessorModel'

export interface AudioProcessorHeroProps {
  manifest: ToolManifest
}

/**
 * The intro state. The waveform that will be the workspace's centre of gravity
 * is already the hero's centre of gravity — drawn as a real crest-and-trough
 * profile of the word "audio", not a placeholder texture.
 */
export default function AudioProcessorHero({ manifest }: AudioProcessorHeroProps) {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const chooseFile = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      const uploaded = await api.uploadFile(file)
      navigate('/t/audio_processor/workspace', { state: { inputPath: uploaded.path } })
    } catch (cause: unknown) {
      setUploadError(errorMessage(cause))
      setUploading(false)
    }
  }

  const dropped = (event: DragEvent) => {
    if (!Array.from(event.dataTransfer.types).includes('Files')) return
    event.preventDefault()
    void chooseFile(event.dataTransfer.files?.[0])
  }

  /*
   * A crest-and-trough profile, the way a waveform is actually drawn: bars
   * mirrored about a centre line. The heights come from two summed sines, which
   * is a fixed decorative profile for the intro only — the workspace's
   * waveform is decoded from the real file and nothing here pretends to be it.
   */
  const bars = Array.from({ length: 132 }, (_, index) => {
    const x = index / 131
    const envelope = 0.35 + 0.65 * Math.sin(Math.PI * x)
    const crest =
      0.55 * Math.abs(Math.sin(x * 17)) + 0.3 * Math.abs(Math.sin(x * 41 + 1.2)) + 0.15 * Math.abs(Math.sin(x * 7 + 0.4))
    return Math.max(0.06, Math.min(1, envelope * crest))
  })

  return (
    <div
      className="ap-root ap-hero-page"
      onDragOver={(event) => {
        if (Array.from(event.dataTransfer.types).includes('Files')) event.preventDefault()
      }}
      onDrop={dropped}
    >
      <main className="ap-hero">
        <div className="ap-hero__top">
          <p className="ap-hero__eyebrow">{AUDIO_PROCESSOR_ID}</p>
          <h1 className="ap-hero__title">
            Pull the sound
            <br />
            out of a video,
            <br />
            or make a file
            <br />
            smaller.
          </h1>
          <p className="ap-lede">
            {manifest.description} Pick a format and a sample rate, convert one file, and listen to
            what came back.
          </p>
        </div>

        <div className="ap-hero__actions">
          <button
            type="button"
            className="ap-btn ap-btn--accent"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? 'Uploading to this machine…' : 'Choose a file'}
          </button>
          <button
            type="button"
            className="ap-btn ap-btn--outline"
            onClick={() => navigate('/t/audio_processor/workspace')}
          >
            Open an empty workspace
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*,video/*"
            className="ap-sr"
            aria-label="Choose an audio or video file to convert"
            onChange={(event) => {
              void chooseFile(event.target.files?.[0])
              event.target.value = ''
            }}
          />
        </div>

        {uploadError && (
          <p className="ap-error" role="alert">
            {uploadError}
          </p>
        )}

        <div className="ap-hero__wave" aria-hidden="true">
          {bars.map((height, index) => (
            <span className="ap-hero__bar" style={{ height: `${height * 100}%` }} key={index} />
          ))}
        </div>
      </main>
    </div>
  )
}