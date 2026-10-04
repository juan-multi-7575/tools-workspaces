import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Upload } from 'lucide-react'
import { api, errorMessage } from '../../lib/api'
import type { ToolManifest } from '../../lib/api'
import { IMAGEMAGICK_ID, type FieldSpec } from './imagemagickManifest'

export interface ImageMagickHeroProps {
  manifest: ToolManifest
}

/**
 * The intro state: a full-viewport page that says what the tool does, shows the
 * geometry the site is built around, and offers exactly two ways in.
 */
export default function ImageMagickHero({ manifest }: ImageMagickHeroProps) {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const schema = (manifest.parameters_schema ?? {}) as Record<string, FieldSpec>
  const format = String(schema.format?.default ?? '')
  const quality = String(schema.quality?.default ?? '')
  const resize = String(schema.resize?.default ?? '')

  const chooseImage = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      const uploaded = await api.uploadFile(file)
      // The file is on the server now; the workspace reads the path from here.
      navigate('/t/imagemagick/workspace', { state: { inputPath: uploaded.path } })
    } catch (cause: unknown) {
      setUploadError(errorMessage(cause))
      setUploading(false)
    }
  }

  return (
    <div className="im-root">
      <header className="im-bar">
        <button type="button" className="im-bar__home" onClick={() => navigate('/')}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M8.5 2.5 4 7l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          All tools
        </button>
        <span className="im-bar__mark">
          <span className="im-bar__dot" aria-hidden="true" />
          {manifest.name}
        </span>
        <span className="im-bar__id">{manifest.id}</span>
      </header>

      <main className="im-hero">
        <div>
          <h1 className="im-hero__title">
            Convert an image
            <br />
            between formats
            <br />
            and sizes.
          </h1>
          <p className="im-hero__lede">
            {manifest.description} Point it at an image on this machine, choose a target format,
            a quality and a geometry, and it writes one real file into the artifact index.
          </p>

          <div className="im-hero__actions">
            <button
              type="button"
              className="im-btn im-btn--solid"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="im-ico im-spin" width={16} height={16} aria-hidden="true" />
              ) : (
                <Upload className="im-ico" width={16} height={16} aria-hidden="true" />
              )}
              {uploading ? 'Uploading to this machine…' : 'Choose an image'}
            </button>
            <button
              type="button"
              className="im-btn im-btn--outline"
              onClick={() => navigate('/t/imagemagick/workspace')}
            >
              Open an empty workspace
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="im-sr"
              aria-label="Choose an image file to convert"
              onChange={(event) => {
                void chooseImage(event.target.files?.[0])
                event.target.value = ''
              }}
            />
          </div>

          {uploadError && (
            <p className="im-field__error" role="alert">
              {uploadError}
            </p>
          )}

          <p className="im-hero__note">
            Both panes stay blank until a real file is chosen — no placeholder image is drawn
            where a missing one should be.
          </p>
        </div>

        <div className="im-stack" aria-hidden="true">
          <div className="im-panel im-panel--back">
            <p className="im-panel__label">Manifest defaults</p>
            <div className="im-panel__rows">
              <p className="im-panel__row">
                <span>format</span>
                <span>{format}</span>
              </p>
              <p className="im-panel__row">
                <span>quality</span>
                <span>{quality}</span>
              </p>
              <p className="im-panel__row">
                <span>input_path</span>
                <span>{schema.input_path?.title}</span>
              </p>
            </div>
          </div>

          <div className="im-panel im-panel--mid">
            <p className="im-panel__label">Before / after</p>
            <div className="im-mini">
              <span className="im-mini__frame" />
              <span className="im-mini__span">→</span>
              <span className="im-mini__frame im-mini__frame--out" />
            </div>
          </div>

          <div className="im-panel im-panel--front">
            <p className="im-panel__label">Resize geometry</p>
            <p className={`im-geo${resize ? '' : ' im-geo--empty'}`}>
              {resize || schema.resize?.placeholder || '800x600'}
            </p>
          </div>
        </div>
      </main>

      <footer className="im-dock" style={{ borderTop: '1px solid var(--im-hair)' }}>
        <div className="im-dock__row">
          <p className="im-hero__note" style={{ margin: 0 }}>
            {IMAGEMAGICK_ID} · {manifest.input_kinds.join(', ')} in → {manifest.output_kinds.join(', ')} out
          </p>
        </div>
      </footer>
    </div>
  )
}