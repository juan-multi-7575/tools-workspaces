import { useRef, useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, errorMessage } from '../../lib/api'
import type { ToolManifest } from '../../lib/api'
import { AUTO_PROVIDER_ORDER, TRANSCRIBER_ID } from './transcriberModel'

export interface TranscriberHeroProps {
  manifest: ToolManifest
}

/**
 * The intro state: a full-viewport page that says what the tool does and offers
 * exactly two ways in.
 *
 * The specimen under the lede is the shape of the output, not an example of it:
 * `HH:MM:SS,mmm --> HH:MM:SS,mmm` is the line
 * `format_srt_timestamp` in `backend/app/tools/subtitles.py` writes above every
 * cue. Showing the format is a fact about the tool; showing a sentence in it
 * would be inventing a transcript.
 */
export default function TranscriberHero({ manifest }: TranscriberHeroProps) {
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
      navigate('/t/transcriber/workspace', { state: { inputPath: uploaded.path } })
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
      className="tc-root tc-hero-page"
      onDragOver={(event) => {
        if (Array.from(event.dataTransfer.types).includes('Files')) event.preventDefault()
      }}
      onDrop={dropped}
    >
      <main className="tc-hero">
        <div className="tc-hero__inner">
          <div className="tc-hero__lead">
            <p className="tc-hero__eyebrow">{TRANSCRIBER_ID}</p>

            <h1 className="tc-hero__title">
              Speech in.
              <br />
              <em>A transcript out.</em>
            </h1>

            <p className="tc-lede">{manifest.description}</p>

            <div className="tc-hero__actions">
              <button
                type="button"
                className="tc-btn tc-btn--accent"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? 'Uploading to this machine…' : 'Choose a file'}
              </button>
              <button
                type="button"
                className="tc-btn tc-btn--outline"
                onClick={() => navigate('/t/transcriber/workspace')}
              >
                Open an empty workspace
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="audio/*,video/*"
                className="tc-sr"
                aria-label="Choose an audio or video file to transcribe"
                onChange={(event) => {
                  void chooseFile(event.target.files?.[0])
                  event.target.value = ''
                }}
              />
            </div>

            {uploadError && (
              <p className="tc-error" role="alert">
                {uploadError}
              </p>
            )}
          </div>

          {/*
            The cue block, set as the backend sets it. The `cue` label is the
            only word here that is not the format itself.
          */}
          <figure className="tc-specimen">
            <figcaption className="tc-specimen__caption">One cue, as written to the .srt</figcaption>
            <pre className="tc-specimen__block" aria-label="The shape of one subtitle cue">
              <span className="tc-specimen__num">cue</span>
              {'\n'}
              <span className="tc-specimen__stamp">HH:MM:SS,mmm</span>
              {' --> '}
              <span className="tc-specimen__stamp">HH:MM:SS,mmm</span>
              {'\n'}
              <span className="tc-specimen__text">the words spoken in that span</span>
            </pre>
          </figure>
        </div>

        <footer className="tc-hero__foot">
          <p className="tc-hero__providers">
            <span className="tc-hero__providers-label">On this machine,</span> the tool needs a speech
            model it can reach — {AUTO_PROVIDER_ORDER.join(', then ')}. It works through them in that
            order and reports back only when none of them answered.
          </p>
        </footer>
      </main>
    </div>
  )
}
