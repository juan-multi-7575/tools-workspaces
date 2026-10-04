import { useRef, useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Upload } from 'lucide-react'
import { api, errorMessage } from '../../lib/api'
import type { ToolManifest } from '../../lib/api'
import type { FieldSpec } from './imagemagickManifest'

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

  /*
   * The manifest's own defaults, labelled with the manifest's own titles. A
   * default that is the empty string is shown as `(empty)` rather than replaced
   * with a plausible-looking value — the geometry really does start unset.
   */
  const resize = String(schema.resize?.default ?? '')
  const defaults: [string, string][] = (Object.keys(schema) as (keyof typeof schema)[]).map((key) => {
    const value = schema[key]?.default
    return [
      schema[key]?.title ?? key,
      value === undefined || value === '' ? '(empty)' : String(value),
    ]
  })

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

  const dropped = (event: DragEvent) => {
    // Only a file drag; a text selection dragged in must not open a picker.
    if (!Array.from(event.dataTransfer.types).includes('Files')) return
    event.preventDefault()
    void chooseImage(event.dataTransfer.files?.[0])
  }

  return (
    <div
      className="im-root"
      onDragOver={(event) => {
        if (Array.from(event.dataTransfer.types).includes('Files')) event.preventDefault()
      }}
      onDrop={dropped}
    >
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
            {manifest.description} Point it at an image on this machine, choose a target format, a
            quality and a geometry, and it writes the converted file to the artifact index.
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
        </div>

        <div className="im-stack" aria-hidden="true">
          <div className="im-panel im-panel--back">
            <p className="im-panel__label">Default settings</p>
            <div className="im-panel__rows">
              {defaults.map(([key, value]) => (
                <p className="im-panel__row" key={key}>
                  <span>{key}</span>
                  <span>{value}</span>
                </p>
              ))}
            </div>
          </div>

          <div className="im-panel im-panel--mid">
            <p className="im-panel__label">Before / after</p>
            <div className="im-stack__pair">
              <span className="im-mini__label">input</span>
              <span className="im-mini__frame" />
              <span className="im-mini__label">output</span>
              <span className="im-mini__frame im-mini__frame--out" />
            </div>
          </div>

          <div className="im-panel im-panel--front">
            <p className="im-panel__label">Resize geometry</p>
            {resize ? (
              <p className="im-geo">{resize}</p>
            ) : (
              <>
                <p className="im-geo im-geo--empty">(empty)</p>
                <p className="im-panel__foot">
                  starts unset, so a run keeps the source dimensions — type one in the workspace
                </p>
              </>
            )}
          </div>
        </div>
      </main>

      </div>
  )
}