import { useRef, useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, errorMessage } from '../../lib/api'
import type { ToolManifest } from '../../lib/api'
import { DECLARED_STEMS, DEMUCS_COMMAND, DEMUCS_ID, STEMS_ARCHIVE_NAME } from './demucsModel'

export interface DemucsHeroProps {
  manifest: ToolManifest
}

/**
 * The intro state: a full-viewport page that says what the tool does and offers
 * exactly two ways in.
 *
 * The plate on the right is a printed catalogue entry. Its list is the four
 * stems named in the manifest's own description — what the tool separates in
 * general — and its second half is the file a completed run actually returns:
 * one archive, `stems.zip`, with the separated stems inside it. Neither half is
 * a result from this machine, and the page says so.
 */
export default function DemucsHero({ manifest }: DemucsHeroProps) {
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
      navigate('/t/demucs/workspace', { state: { inputPath: uploaded.path } })
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
      className="dm-root dm-hero-page"
      onDragOver={(event) => {
        if (Array.from(event.dataTransfer.types).includes('Files')) event.preventDefault()
      }}
      onDrop={dropped}
    >
      <main className="dm-hero">
        <div className="dm-hero__inner">
          <div className="dm-hero__lead">
            <p className="dm-eyebrow">{DEMUCS_ID}</p>

            <h1 className="dm-hero__title">
              One finished mix.
              <br />
              <em>Its sources, apart.</em>
            </h1>

            <p className="dm-lede">{manifest.description}</p>

            <div className="dm-hero__actions">
              <button
                type="button"
                className="dm-btn dm-btn--solid"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? 'Uploading to this machine…' : 'Choose a file'}
              </button>
              <button
                type="button"
                className="dm-btn dm-btn--line"
                onClick={() => navigate('/t/demucs/workspace')}
              >
                Open an empty workspace
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="audio/*,video/*"
                className="dm-sr"
                aria-label="Choose an audio or video file to separate"
                onChange={(event) => {
                  void chooseFile(event.target.files?.[0])
                  event.target.value = ''
                }}
              />
            </div>

            {uploadError && (
              <p className="dm-error" role="alert">
                {uploadError}
              </p>
            )}
          </div>

          <figure className="dm-plate">
            <figcaption className="dm-plate__caption">
              What the tool separates, in general
            </figcaption>

            <ol className="dm-plate__stems">
              {DECLARED_STEMS.map((stem, position) => (
                <li className="dm-plate__stem" key={stem}>
                  <span className="dm-plate__stem-index">
                    {String(position + 1).padStart(2, '0')}
                  </span>
                  <span className="dm-plate__stem-name">{stem}</span>
                </li>
              ))}
            </ol>

            <p className="dm-plate__note">
              These four are named in this tool&rsquo;s own description. They are what the
              separator works on in general — not files a run on this machine returned. A
              completed run hands back <strong>{STEMS_ARCHIVE_NAME}</strong> and one only: the
              separated stems are inside that archive, not beside it.
            </p>

            <p className="dm-plate__command">
              <span className="dm-plate__command-label">The command it runs</span>
              {DEMUCS_COMMAND}
            </p>
          </figure>
        </div>

        <footer className="dm-hero__foot">
          <p>
            <span className="dm-hero__foot-label">On this machine</span>
            separation runs locally through the <code>demucs</code> command, which the workspace&rsquo;s
            dependency gate checks for before a run is allowed. That install is deliberately
            opt-in and large — the gate asks twice before it begins, and says plainly what
            the download weighs.
          </p>
        </footer>
      </main>
    </div>
  )
}
