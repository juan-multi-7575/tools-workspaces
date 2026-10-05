import { useRef, useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Upload } from 'lucide-react'
import { api, errorMessage } from '../../lib/api'
import type { ToolManifest } from '../../lib/api'
import { GEOMETRY_EXAMPLE, type FieldSpec } from './imagemagickManifest'

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
   * Only the keys the manifest really presets, so the panel says what a first run
   * will do rather than printing `(empty)` beside two of them. The two that have
   * no default are described in the panel's own foot, in plain words.
   */
  const preset = (Object.keys(schema) as (keyof typeof schema)[])
    .map((key) => [schema[key]?.title ?? key, schema[key]?.default] as const)
    .filter(([, value]) => value !== undefined && value !== '')

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
      {/*
        No identity strip and no home button here, exactly as the reference hero
        has none: its two actions are the whole of the page. The way back to the
        index lives in the workspace, which is where the brief puts it.
      */}
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
            {manifest.description} Pick a format, a quality and a size, then convert one file at
            a time.
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
            <p className="im-panel__label">Out of the box</p>
            <div className="im-panel__rows">
              {preset.map(([title, value]) => (
                <p className="im-panel__row" key={title}>
                  <span>{title}</span>
                  <span>{String(value)}</span>
                </p>
              ))}
            </div>
            <p className="im-panel__foot">
              You pick the file. With no geometry the output keeps the source size.
            </p>
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
            <p className="im-panel__label">Geometry string</p>
            <p className="im-geo">{GEOMETRY_EXAMPLE.geometry}</p>
            <p className="im-panel__foot">
              on a {GEOMETRY_EXAMPLE.from} source that comes back {GEOMETRY_EXAMPLE.to} — the
              ratio is kept, not squeezed
            </p>
          </div>
        </div>
      </main>

      </div>
  )
}