import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, errorMessage, type ToolManifest } from '../../lib/api'
import { useToolExecute } from '../../hooks/useToolExecute'
import { useToolDeps } from '../../hooks/useToolDeps'
import DependencyGate from '../../components/deps/DependencyGate'
import ToolResultPanel from '../../components/tools/ToolResultPanel'
import { formatBytes } from '../../lib/depsApi'
import {
  ARCHIVE_LEDGER_NOTE,
  DECLARED_STEMS,
  DEMUCS_COMMAND,
  DEMUCS_ID,
  PICKABLE_SUFFIXES,
  artifactContentUrl,
  failureHeadline,
  ledgerCaption,
  ledgerEntryKind,
  playhead,
  type FieldSpec,
} from './demucsModel'

interface ArtifactIndexEntry {
  name: string
  path: string
  kind: string
  size: number
}

export interface DemucsWorkspaceProps {
  manifest: ToolManifest
  initialInputPath?: string
}

/**
 * The working state: an archival ledger on a white ground.
 *
 * Everything the page shows is a real artifact or a real backend message. The
 * ledger lists what a run returned — by name and by size read off the artifact
 * index — and each row is captioned for what its bytes actually are. That
 * caption is the whole point: a completed demucs run returns `stems.zip`, so
 * that row offers a download and says the stems are inside the file. It never
 * offers a play control for an archive, because there is nothing there to play.
 */
export default function DemucsWorkspace({ manifest, initialInputPath }: DemucsWorkspaceProps) {
  const navigate = useNavigate()
  const execute = useToolExecute(DEMUCS_ID)
  const deps = useToolDeps(DEMUCS_ID)
  const fileRef = useRef<HTMLInputElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const schema = (manifest.parameters_schema ?? {}) as Record<string, FieldSpec>

  /*
   * Seeded from the manifest's own defaults where it declares any, so the first
   * run is exactly what the backend would do untouched.
   */
  const [params, setParams] = useState<Record<string, unknown>>(() => {
    const seeded: Record<string, unknown> = {}
    for (const [key, spec] of Object.entries(schema)) {
      if (spec?.default !== undefined) seeded[key] = spec.default
    }
    seeded.input_path = initialInputPath ?? ''
    return seeded
  })

  const [recent, setRecent] = useState<ArtifactIndexEntry[]>([])
  const [index, setIndex] = useState<Record<string, number>>({})
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [at, setAt] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [playError, setPlayError] = useState<string | null>(null)

  const setKey = useCallback(
    (key: string, value: unknown) => setParams((previous) => ({ ...previous, [key]: value })),
    [],
  )

  const inputPath = String(params.input_path ?? '')

  const refreshIndex = useCallback(async () => {
    const response = await api.getRecentArtifacts()
    setIndex(Object.fromEntries(response.artifacts.map((entry) => [entry.path, entry.size])))
    setRecent(
      response.artifacts.filter((entry) => PICKABLE_SUFFIXES.has(entry.kind.toLowerCase())),
    )
  }, [])

  useEffect(() => {
    // A convenience list, not the source of truth for anything on the page.
    refreshIndex().catch(() => undefined)
  }, [refreshIndex])

  const upload = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      const uploaded = await api.uploadFile(file)
      setKey('input_path', uploaded.path)
    } catch (cause: unknown) {
      setUploadError(errorMessage(cause))
    } finally {
      setUploading(false)
    }
  }

  const result = execute.state.result
  const artifacts = useMemo(
    () => (result?.status === 'completed' ? result.artifacts : []),
    [result],
  )

  const [lastInput, setLastInput] = useState<string | null>(null)
  const stale = result?.status === 'completed' && lastInput !== null && lastInput !== inputPath

  const run = async () => {
    setLastInput(inputPath)
    await execute.run({ input_path: inputPath.trim() })
    refreshIndex().catch(() => undefined)
  }

  const clear = () => {
    execute.reset()
    setLastInput(null)
    setKey('input_path', '')
    audioRef.current?.pause()
  }

  /*
   * The run is live whenever there is a source, even while the gate reports the
   * dependency missing. That is a deliberate departure from the other tool
   * pages, and the reason is the backend's own behaviour: `demucs` is absent
   * from this machine, so the command the tool builds still runs and still
   * fails, with a message worth reading rather than a silent refusal. Gating
   * the button on `deps.ready` would hide that message behind a disabled
   * control. The dock below says what the gate found before anyone clicks.
   */
  const canRun = inputPath.trim() !== '' && !execute.busy

  const failure = execute.state.phase === 'failed' ? execute.state.error : null
  const headline = failureHeadline(failure)

  return (
    <div
      className="dm-root"
      onPaste={(event) => {
        const text = event.clipboardData.getData('text').trim()
        if (!text) return
        event.preventDefault()
        setKey('input_path', text)
      }}
    >
      <header className="dm-bar">
        <button type="button" className="dm-bar__home" onClick={() => navigate('/')}>
          <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true">
            <path
              d="M8.5 2.5 4 7l4.5 4.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          All tools
        </button>
        <span className="dm-bar__mark">
          <span className="dm-bar__rule" aria-hidden="true" />
          {manifest.name}
        </span>
        <span className="dm-bar__id">{DEMUCS_ID}</span>
      </header>

      <div className="dm-stage">
        <main className="dm-main">
          {/* The source, as a slim inline transport rather than a panel. */}
          <section className="dm-source" aria-label="Source recording">
            <div className="dm-source__id">
              <span className="dm-label">Source</span>
              <span className="dm-source__name" title={inputPath}>
                {inputPath ? inputPath.split('/').pop() : 'no file chosen'}
              </span>
              {index[inputPath] !== undefined && (
                <span className="dm-source__size">{formatBytes(index[inputPath])}</span>
              )}
            </div>
            <div className="dm-source__transport">
              <button
                type="button"
                className="dm-btn dm-btn--small"
                disabled={!inputPath}
                onClick={() => {
                  const audio = audioRef.current
                  if (!audio) return
                  if (audio.paused) {
                    setPlayError(null)
                    audio.play().catch((cause: unknown) => setPlayError(errorMessage(cause)))
                  } else {
                    audio.pause()
                  }
                }}
              >
                {playing ? 'Pause' : 'Play source'}
              </button>
              <span className="dm-source__clock" aria-live="off">
                {playhead(at)}
              </span>
              {inputPath && (
                <audio
                  ref={audioRef}
                  className="dm-sr"
                  src={artifactContentUrl(inputPath)}
                  preload="metadata"
                  onTimeUpdate={(event) => setAt(event.currentTarget.currentTime)}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onEnded={() => setPlaying(false)}
                />
              )}
            </div>
          </section>

          {playError && (
            <p className="dm-notice" role="alert">
              The source could not be played from this machine: {playError}
            </p>
          )}

          {failure && (
            <section className="dm-failure" aria-label="The run failed">
              <h2 className="dm-failure__title">Nothing was separated.</h2>
              {headline && <p className="dm-failure__headline">{headline}</p>}
              <p className="dm-failure__body">
                The backend refused the run and returned no artifacts. What it said is below,
                exactly as it sent it. The dependency gate in the bar underneath names what is
                missing from this machine.
              </p>
              <pre className="dm-failure__trace">{failure}</pre>
            </section>
          )}

          {artifacts.length > 0 && (
            <section className="dm-section" aria-label="What this run returned">
              <div className="dm-section__head">
                <h2 className="dm-section__title">What this run returned</h2>
                <span className="dm-section__meta">
                  {artifacts.length === 1 ? '1 artifact' : `${artifacts.length} artifacts`}
                </span>
              </div>

              <ol className="dm-ledger">
                {artifacts.map((artifact, position) => {
                  const kind = ledgerEntryKind(artifact.name)
                  const size = index[artifact.path]
                  const url = artifactContentUrl(artifact.path)
                  return (
                    <li className="dm-entry" key={artifact.path}>
                      <div className="dm-entry__head">
                        <span className="dm-entry__no">
                          {String(position + 1).padStart(2, '0')}
                        </span>
                        <p className="dm-entry__name">{artifact.name}</p>
                        <span className="dm-entry__size">
                          {size === undefined ? 'size not in the index' : formatBytes(size)}
                        </span>
                      </div>
                      <p className="dm-entry__caption">{ledgerCaption(artifact.name)}</p>
                      <div className="dm-entry__acts">
                        <a className="dm-entry__act" href={url} download={artifact.name}>
                          {kind === 'archive' ? 'Download the archive' : 'Download'}
                        </a>
                      </div>
                      {kind === 'archive' && (
                        <p className="dm-entry__note">{ARCHIVE_LEDGER_NOTE}</p>
                      )}
                    </li>
                  )
                })}
              </ol>

              {artifacts.some((artifact) => ledgerEntryKind(artifact.name) === 'archive') && (
                <p className="dm-hint">
                  The tool separates {DECLARED_STEMS.join(', ')} in general. That is what the
                  separator works on; it is not a list of files this run returned, and the
                  files above are the only ones it did.
                </p>
              )}
            </section>
          )}

          {!artifacts.length && !failure && (
            <div className="dm-empty">
              <p className="dm-empty__title">
                {inputPath ? 'No separation has run here yet.' : 'Nothing to separate yet.'}
              </p>
              <p className="dm-empty__body">
                {inputPath
                  ? `A finished run lists its artifacts here, each captioned for what its bytes are. The command the backend runs is ${DEMUCS_COMMAND} — there is no format, model or stem-count setting to choose.`
                  : 'Choose a file on the intro page, drop one onto this page, or type a path this machine can read, then separate it.'}
              </p>
            </div>
          )}

          {execute.state.phase !== 'idle' && (
            <div className="dm-report">
              <ToolResultPanel
                state={execute.state}
                toolId={DEMUCS_ID}
                toolName={manifest.name}
                onRerun={execute.reset}
              />
            </div>
          )}
        </main>

        <aside className="dm-rail" aria-label="Source settings">
          <div className="dm-rail__inner">
            <div className="dm-field" data-param-key="input_path">
              <label className="dm-label" htmlFor="dm-input-path" title="input_path">
                {schema.input_path?.title ?? 'Source file'}
              </label>
              <input
                id="dm-input-path"
                className="dm-input"
                type="text"
                value={inputPath}
                placeholder="/absolute/path/song.wav"
                aria-label="Path to the recording to separate on this machine"
                onChange={(event) => setKey('input_path', event.target.value)}
              />
              <div
                className="dm-drop"
                role="button"
                tabIndex={0}
                onClick={() => fileRef.current?.click()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    fileRef.current?.click()
                  }
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault()
                  void upload(event.dataTransfer.files?.[0])
                }}
              >
                {uploading ? 'Uploading…' : 'Drop a file, or click to browse'}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="audio/*,video/*"
                className="dm-sr"
                aria-label="Upload an audio or video file to separate"
                onChange={(event) => {
                  void upload(event.target.files?.[0])
                  event.target.value = ''
                }}
              />
              {recent.length > 0 && (
                <select
                  className="dm-select"
                  value=""
                  aria-label="Media already on this machine"
                  onChange={(event) => {
                    if (event.target.value) setKey('input_path', event.target.value)
                  }}
                >
                  <option value="">— media already on this machine —</option>
                  {recent.map((entry) => (
                    <option key={entry.path} value={entry.path}>
                      {entry.name} · {formatBytes(entry.size)}
                    </option>
                  ))}
                </select>
              )}
              {uploadError && (
                <p className="dm-error" role="alert">
                  {uploadError}
                </p>
              )}
              <p className="dm-field__meta">
                The only parameter this tool declares. The backend runs{' '}
                <span className="dm-mono">{DEMUCS_COMMAND}</span> and zips everything the command
                wrote into one archive.
              </p>
            </div>
          </div>
        </aside>
      </div>

      <footer className="dm-dock" data-tool-gate-region={DEMUCS_ID}>
        <button
          type="button"
          className="dm-btn dm-btn--accent dm-btn--run"
          onClick={() => void run()}
          disabled={!canRun}
        >
          {execute.busy
            ? `Separating… ${execute.state.elapsedSeconds.toFixed(1)}s`
            : 'Separate the stems'}
        </button>
        <button type="button" className="dm-btn dm-btn--line" onClick={clear} disabled={execute.busy}>
          Clear
        </button>
        <p className="dm-dock__note" role="status">
          {execute.busy
            ? `Running — ${execute.state.elapsedSeconds.toFixed(1)}s measured.`
            : stale
              ? 'The source changed since that run. Its output is above and no longer matches this file.'
              : !inputPath
                ? 'No source file yet, so there is nothing to separate.'
                : deps.ready
                  ? `Separating ${inputPath.split('/').pop()} on this machine. A finished run returns one archive.`
                  : 'The gate below reports this tool missing on this machine, so a run would fail until it is installed.'}
        </p>
        <div className="dm-dock__gate">
          <DependencyGate toolId={DEMUCS_ID} state={deps} accent="#7A6A53" />
        </div>
      </footer>
    </div>
  )
}
