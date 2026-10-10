import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, errorMessage, type ToolManifest } from '../../lib/api'
import { useToolExecute } from '../../hooks/useToolExecute'
import { useToolDeps } from '../../hooks/useToolDeps'
import DependencyGate from '../../components/deps/DependencyGate'
import ToolResultPanel from '../../components/tools/ToolResultPanel'
import { formatBytes } from '../../lib/depsApi'
import {
  MODE_OUTPUTS,
  READABLE_KINDS,
  TRANSCRIBER_ID,
  artifactContentUrl,
  marginalTime,
  modeWritesSubtitles,
  readArtifactText,
  styleAffectsOutput,
  transcriptFromFiles,
  type FieldSpec,
  type Transcript,
} from './transcriberModel'
import TranscriptView from './TranscriptView'

interface ArtifactIndexEntry {
  name: string
  path: string
  kind: string
  size: number
}

export interface TranscriberWorkspaceProps {
  manifest: ToolManifest
  initialInputPath?: string
}

/**
 * The working state: a typeset transcript on a book ground, with the cue's
 * number and timecode set as marginalia in the left margin.
 *
 * Every word of the transcript comes out of a file the run wrote. The page
 * parses the `.srt` the backend produced and joins the lines the backend had
 * wrapped for a player back into the sentences they came from, so what is set
 * here is the transcription rather than the line breaks.
 */
export default function TranscriberWorkspace({ manifest, initialInputPath }: TranscriberWorkspaceProps) {
  const navigate = useNavigate()
  const execute = useToolExecute(TRANSCRIBER_ID)
  const deps = useToolDeps(TRANSCRIBER_ID)
  const fileRef = useRef<HTMLInputElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const schema = (manifest.parameters_schema ?? {}) as Record<string, FieldSpec>

  /*
   * Seeded from the manifest's own defaults, so the first run is exactly what
   * the backend would do untouched.
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
  const [transcript, setTranscript] = useState<Transcript | null>(null)
  const [transcriptError, setTranscriptError] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const [at, setAt] = useState(0)
  const [playing, setPlaying] = useState(false)

  const setKey = useCallback(
    (key: string, value: unknown) => setParams((previous) => ({ ...previous, [key]: value })),
    [],
  )

  const inputPath = String(params.input_path ?? '')
  const provider = String(params.provider ?? '')
  const model = String(params.model ?? '')
  const outputMode = String(params.output_mode ?? '')
  const subtitleStyle = String(params.subtitle_style ?? '')
  const task = String(params.task ?? '')

  const refreshIndex = useCallback(async () => {
    const response = await api.getRecentArtifacts()
    const entries = response.artifacts.filter((entry) => READABLE_KINDS.has(entry.kind.toLowerCase()))
    setRecent(entries)
    setIndex(Object.fromEntries(response.artifacts.map((entry) => [entry.path, entry.size])))
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
      setTranscript(null)
      setTranscriptError(null)
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

  const runSignature = useMemo(
    () => JSON.stringify({ input_path: inputPath, provider, model, outputMode, subtitleStyle, task }),
    [inputPath, provider, model, outputMode, subtitleStyle, task],
  )
  const [lastSignature, setLastSignature] = useState<string | null>(null)
  const stale = result?.status === 'completed' && lastSignature !== null && lastSignature !== runSignature

  /*
   * Read the transcript back out of the file the run wrote.
   *
   * The run response names the artifacts but does not carry the transcript, so
   * the page fetches the bytes and parses them. If a read fails the page says
   * so and sets nothing: a transcript assembled from the response rather than
   * from the file would be a guess wearing a result's clothes.
   */
  useEffect(() => {
    if (result?.status !== 'completed') return
    const readable = artifacts.filter(
      (artifact) => artifact.name.endsWith('.srt') || artifact.name.endsWith('.txt'),
    )
    if (readable.length === 0) {
      setTranscript(null)
      setTranscriptError(null)
      return
    }
    let active = true
    setReading(true)
    Promise.all(
      readable.map(async (artifact) => ({
        name: artifact.name,
        path: artifact.path,
        body: await readArtifactText(artifact.path),
      })),
    )
      .then((files) => {
        if (!active) return
        const { transcript: parsed, problem } = transcriptFromFiles(files)
        setTranscript(parsed)
        setTranscriptError(problem)
      })
      .catch((cause: unknown) => {
        if (!active) return
        setTranscript(null)
        setTranscriptError(
          `Could not read the files this run wrote: ${errorMessage(cause)}`,
        )
      })
      .finally(() => {
        if (active) setReading(false)
      })
    return () => {
      active = false
    }
  }, [result, artifacts])

  const run = async () => {
    setLastSignature(runSignature)
    setTranscript(null)
    setTranscriptError(null)
    await execute.run({
      input_path: inputPath.trim(),
      provider,
      model,
      output_mode: outputMode,
      subtitle_style: subtitleStyle,
      task,
    })
    refreshIndex().catch(() => undefined)
  }

  const clear = () => {
    execute.reset()
    setLastSignature(null)
    setKey('input_path', '')
    setTranscript(null)
    setTranscriptError(null)
    audioRef.current?.pause()
  }

  const canRun = inputPath.trim() !== '' && !execute.busy && deps.ready

  /*
   * The cue under the playhead. This is what connects the audio to the page:
   * it is read off the element's own `currentTime`, not off a timer.
   */
  const activeCue =
    transcript?.kind === 'cues'
      ? transcript.cues.find((cue) => at >= cue.start && at < cue.end)?.number ?? null
      : null

  const pillKeys = new Set(['provider', 'output_mode', 'subtitle_style', 'task'])
  const otherKeys = Object.keys(schema).filter((key) => !pillKeys.has(key))
  const outputs = MODE_OUTPUTS[outputMode]

  return (
    <div
      className="tc-root"
      onPaste={(event) => {
        const text = event.clipboardData.getData('text').trim()
        if (!text) return
        event.preventDefault()
        setKey('input_path', text)
        setTranscript(null)
      }}
    >
      <header className="tc-bar">
        <button type="button" className="tc-bar__home" onClick={() => navigate('/')}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
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
        <span className="tc-bar__mark">
          <span className="tc-bar__rule" aria-hidden="true" />
          {manifest.name}
        </span>
        <span className="tc-bar__id">{TRANSCRIBER_ID}</span>
      </header>

      <div className="tc-stage">
        <main className="tc-main">
          {/* The source, as a slim inline transport rather than a panel. */}
          <section className="tc-source" aria-label="Source audio">
            <div className="tc-source__id">
              <span className="tc-label">Source</span>
              <span className="tc-source__name" title={inputPath}>
                {inputPath ? inputPath.split('/').pop() : 'no file chosen'}
              </span>
              {index[inputPath] !== undefined && (
                <span className="tc-source__size ap-mono">{formatBytes(index[inputPath])}</span>
              )}
            </div>
            <div className="tc-source__transport">
              <button
                type="button"
                className="tc-btn tc-btn--small"
                disabled={!inputPath}
                onClick={() => {
                  const audio = audioRef.current
                  if (!audio) return
                  if (audio.paused) void audio.play().catch((cause: unknown) => setTranscriptError(errorMessage(cause)))
                  else audio.pause()
                }}
              >
                {playing ? 'Pause' : 'Play'}
              </button>
              <span className="tc-source__clock ap-mono" aria-live="off">
                {marginalTime(at)}
              </span>
              {inputPath && (
                <audio
                  ref={audioRef}
                  className="tc-sr"
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

          {transcriptError && (
            <p className="tc-notice" role="alert">
              {transcriptError}
            </p>
          )}

          {reading && !transcript && <p className="tc-notice">Reading the file the run wrote…</p>}

          <TranscriptView transcript={transcript} activeCue={activeCue} />

          {!transcript && !transcriptError && !reading && (
            <div className="tc-empty">
              <p className="tc-empty__title">
                {inputPath ? 'No transcript set yet.' : 'Nothing to set yet.'}
              </p>
              <p className="tc-empty__body">
                {inputPath
                  ? 'Run the transcription and the words come back here, set as they were spoken, with each cue numbered in the margin.'
                  : 'Choose a file on the intro page, drop one onto this page, or type a path this machine can read, then run it.'}
              </p>
            </div>
          )}

          {execute.state.phase !== 'idle' && (
            <div className="tc-report">
              <ToolResultPanel
                state={execute.state}
                toolId={TRANSCRIBER_ID}
                toolName={manifest.name}
                onRerun={execute.reset}
              />
            </div>
          )}
        </main>

        <aside className="tc-rail" aria-label="Transcription settings">
          <div className="tc-rail__inner">
            <div className="tc-field" data-param-key="input_path">
              <span className="tc-label" title="input_path">
                Source file
              </span>
              <input
                id="tc-source"
                className="tc-input"
                type="text"
                value={inputPath}
                placeholder="/absolute/path/speech.wav"
                aria-label="Path to the file to transcribe on this machine"
                onChange={(event) => setKey('input_path', event.target.value)}
              />
              <div
                className="tc-drop"
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
                className="tc-sr"
                aria-label="Upload an audio or video file to transcribe"
                onChange={(event) => {
                  void upload(event.target.files?.[0])
                  event.target.value = ''
                }}
              />
              {recent.length > 0 && (
                <select
                  className="tc-input"
                  value=""
                  aria-label="Media already on this machine"
                  onChange={(event) => {
                    if (event.target.value) {
                      setKey('input_path', event.target.value)
                      setTranscript(null)
                    }
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
                <p className="tc-error" role="alert">
                  {uploadError}
                </p>
              )}
            </div>

            <div className="tc-field" data-param-key="provider">
              <span className="tc-label" id="tc-provider-label" title="provider">
                {schema.provider?.title ?? 'Provider'}
              </span>
              <div className="tc-pills tc-pills--wrap" role="group" aria-labelledby="tc-provider-label">
                {(schema.provider?.enum ?? []).map((option) => {
                  const value = String(option)
                  return (
                    <button
                      key={value}
                      type="button"
                      className="tc-pill"
                      aria-pressed={provider === value}
                      onClick={() => setKey('provider', value)}
                    >
                      {value}
                    </button>
                  )
                })}
              </div>
              <p className="tc-hint">
                {provider === 'auto'
                  ? 'The tool tries them in order and reports back only when every one of them has failed, so no run names the provider that answered.'
                  : (schema.provider?.description ?? '')}
              </p>
            </div>

            <div className="tc-field" data-param-key="output_mode">
              <span className="tc-label" id="tc-mode-label" title="output_mode">
                {schema.output_mode?.title ?? 'Output format mode'}
              </span>
              <div className="tc-pills tc-pills--wrap" role="group" aria-labelledby="tc-mode-label">
                {(schema.output_mode?.enum ?? []).map((option) => {
                  const value = String(option)
                  return (
                    <button
                      key={value}
                      type="button"
                      className="tc-pill"
                      aria-pressed={outputMode === value}
                      onClick={() => setKey('output_mode', value)}
                    >
                      {value}
                    </button>
                  )
                })}
              </div>
              <p className="tc-hint">
                {outputs
                  ? `Writes ${outputs.extensions.join(', ')} — ${outputs.label}. ${
                      modeWritesSubtitles(outputMode)
                        ? 'The transcript on this page is read back out of the .srt it writes.'
                        : 'This mode writes no subtitle file, so what is set here is the text file itself.'
                    }`
                  : (schema.output_mode?.description ?? '')}
              </p>
            </div>

            <div className="tc-field" data-param-key="subtitle_style">
              <span className="tc-label" id="tc-style-label" title="subtitle_style">
                {schema.subtitle_style?.title ?? 'Subtitle style preset'}
              </span>
              <div className="tc-pills tc-pills--wrap" role="group" aria-labelledby="tc-style-label">
                {(schema.subtitle_style?.enum ?? []).map((option) => {
                  const value = String(option)
                  return (
                    <button
                      key={value}
                      type="button"
                      className="tc-pill"
                      aria-pressed={subtitleStyle === value}
                      onClick={() => setKey('subtitle_style', value)}
                    >
                      {value}
                    </button>
                  )
                })}
              </div>
              <p className="tc-hint">
                {styleAffectsOutput(outputMode)
                  ? (schema.subtitle_style?.description ?? '')
                  : 'This style sets how subtitle lines are wrapped, and this mode writes no subtitle file, so it changes nothing about this run.'}
              </p>
            </div>

            <div className="tc-field" data-param-key="task">
              <span className="tc-label" id="tc-task-label" title="task">
                {schema.task?.title ?? 'Task mode'}
              </span>
              <div className="tc-pills tc-pills--wrap" role="group" aria-labelledby="tc-task-label">
                {(schema.task?.enum ?? []).map((option) => {
                  const value = String(option)
                  return (
                    <button
                      key={value}
                      type="button"
                      className="tc-pill"
                      aria-pressed={task === value}
                      onClick={() => setKey('task', value)}
                    >
                      {schema.task?.enumLabels?.[value] ?? value}
                    </button>
                  )
                })}
              </div>
              <p className="tc-hint">{schema.task?.description ?? ''}</p>
            </div>

            {otherKeys.map((key) => {
              const spec = schema[key]
              const value = params[key]
              return (
                <div className="tc-field" data-param-key={key} key={key}>
                  <label className="tc-label" htmlFor={`tc-${key}`} title={key}>
                    {spec?.title ?? key}
                  </label>
                  {Array.isArray(spec?.enum) ? (
                    <select
                      id={`tc-${key}`}
                      className="tc-input"
                      value={String(value ?? '')}
                      onChange={(event) => setKey(key, event.target.value)}
                    >
                      {(spec?.enum ?? []).map((option) => (
                        <option key={String(option)} value={String(option)}>
                          {String(option)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={`tc-${key}`}
                      className="tc-input"
                      type="text"
                      value={String(value ?? '')}
                      onChange={(event) => setKey(key, event.target.value)}
                    />
                  )}
                  {spec?.description && <p className="tc-hint">{spec.description}</p>}
                </div>
              )
            })}

            {artifacts.length > 0 && (
              <section className="tc-files" aria-label="Files this run wrote">
                <h2 className="tc-files__title">Files this run wrote</h2>
                <ul className="tc-files__list">
                  {artifacts.map((artifact) => (
                    <li className="tc-files__row" key={artifact.path}>
                      <span className="tc-files__name">{artifact.name}</span>
                      {index[artifact.path] !== undefined && (
                        <span className="tc-files__size ap-mono">{formatBytes(index[artifact.path])}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </aside>
      </div>

      <footer className="tc-dock" data-tool-gate-region={TRANSCRIBER_ID}>
        <button
          type="button"
          className="tc-btn tc-btn--accent tc-btn--run"
          onClick={() => void run()}
          disabled={!canRun}
        >
          {execute.busy
            ? `Transcribing… ${execute.state.elapsedSeconds.toFixed(1)}s`
            : `Transcribe${task === 'translate' ? ' and translate' : ''}`}
        </button>
        <button type="button" className="tc-btn tc-btn--outline" onClick={clear} disabled={execute.busy}>
          Clear
        </button>
        <p className="tc-dock__note" role="status">
          {execute.busy
            ? `Running — ${execute.state.elapsedSeconds.toFixed(1)}s measured.`
            : stale
              ? 'The source or settings changed since that run. Its output is below and no longer matches these settings.'
              : !inputPath
                ? 'No source file yet, so there is nothing to transcribe.'
                : `${outputMode || '—'}${subtitleStyle ? ` · ${subtitleStyle} lines` : ''}${provider ? ` · ${provider}` : ''}, from ${
                    inputPath.split('/').pop()
                  }`}
        </p>
        <div className="tc-dock__gate">
          <DependencyGate toolId={TRANSCRIBER_ID} state={deps} accent="#8A5A2B" />
        </div>
      </footer>
    </div>
  )
}
