import { useEffect, useRef, useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, errorMessage } from '../../lib/api'
import type { ToolManifest } from '../../lib/api'
import { STRIP_WORD, TRIMMER_ID, fitLetters } from './trimmerModel'

/** The three stretches the band is set in: dense, pulled apart, dense. */
const BAND_RUNS = [
  { inside: false, asked: 12 },
  { inside: true, asked: 4 },
  { inside: false, asked: 12 },
]

export interface TrimmerHeroProps {
  manifest: ToolManifest
}

/**
 * The intro state: a full-viewport page that says what the tool does and offers
 * exactly two ways in. The letterform band is the argument — the selection is
 * the space between the glyphs, which is the same thing the workspace does.
 */
export default function TrimmerHero({ manifest }: TrimmerHeroProps) {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const bandRef = useRef<HTMLDivElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  /*
   * The band is set as many letters as its stretch asks for and as many as the
   * rendered width can hold. Both numbers come off the laid-out DOM, so the
   * letters stay whole at any viewport instead of overhanging their stretch.
   */
  const [fits, setFits] = useState<{ glyph: number; shares: number[] } | null>(null)

  useEffect(() => {
    const band = bandRef.current
    if (!band) return
    const measure = () => {
      const glyph = band.querySelector('.tr-band__glyph') as HTMLElement | null
      const shares = [...band.children].map((child) => (child as HTMLElement).clientWidth)
      setFits({ glyph: glyph ? glyph.offsetWidth : 0, shares })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(band)
    return () => observer.disconnect()
  }, [])

  const bandRuns = BAND_RUNS.map((run, index) => {
    const count = fits
      ? fitLetters(run.asked, fits.shares[index] ?? 0, fits.glyph)
      : run.asked
    return {
      ...run,
      letters: Array.from({ length: count }, (_, position) => STRIP_WORD[position % STRIP_WORD.length]),
    }
  })

  const chooseFile = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      const uploaded = await api.uploadFile(file)
      navigate('/t/trimmer/workspace', { state: { inputPath: uploaded.path } })
    } catch (cause: unknown) {
      setUploadError(errorMessage(cause))
      setUploading(false)
    }
  }

  const dropped = (event: DragEvent) => {
    // Only a file drag; a text selection dragged in must not open a picker.
    if (!Array.from(event.dataTransfer.types).includes('Files')) return
    event.preventDefault()
    void chooseFile(event.dataTransfer.files?.[0])
  }

  return (
    <div
      className="tr-root tr-hero-page"
      onDragOver={(event) => {
        if (Array.from(event.dataTransfer.types).includes('Files')) event.preventDefault()
      }}
      onDrop={dropped}
    >
      <main className="tr-hero">
        {/*
          The band is the design statement, not a picture of one: glyphs set
          dense on the left, pulled apart in the middle, dense again on the
          right. That middle gap is exactly what a selected region looks like.
        */}
        <div className="tr-band" ref={bandRef} aria-hidden="true">
          {bandRuns.map((run, index) => (
            <div
              className="tr-band__seg"
              key={index}
              data-inside={run.inside ? 'true' : 'false'}
              style={{ flexGrow: run.inside ? 1 : 1.5 }}
            >
              {run.letters.map((glyph, position) => (
                <span
                  className="tr-band__glyph"
                  style={{ left: `${((position + 0.5) / run.letters.length) * 100}%` }}
                  key={position}
                >
                  {glyph}
                </span>
              ))}
            </div>
          ))}
        </div>

        <div className="tr-hero__block">
          <p className="tr-hero__eyebrow">{TRIMMER_ID}</p>
          <h1 className="tr-hero__title">
            Cut exact regions
            <br />
            out of audio
            <br />
            and video.
          </h1>
          <p className="tr-lede">
            {manifest.description} Mark the parts worth keeping by pulling them apart, then write each
            one out as its own file.
          </p>

          <div className="tr-hero__actions">
            <button
              type="button"
              className="tr-btn tr-btn--accent"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? 'Uploading to this machine…' : 'Choose a file'}
            </button>
            <button
              type="button"
              className="tr-btn tr-btn--outline"
              onClick={() => navigate('/t/trimmer/workspace')}
            >
              Open an empty workspace
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="audio/*,video/*"
              className="tr-sr"
              aria-label="Choose an audio or video file to trim"
              onChange={(event) => {
                void chooseFile(event.target.files?.[0])
                event.target.value = ''
              }}
            />
          </div>

          {uploadError && (
            <p className="tr-error" role="alert">
              {uploadError}
            </p>
          )}
        </div>

        <span className="tr-dot" aria-hidden="true" />
      </main>
    </div>
  )
}