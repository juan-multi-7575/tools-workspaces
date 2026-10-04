import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, ImageDown, Loader2, Ruler, UploadCloud } from 'lucide-react'
import { api, resolveUrl } from '../../lib/api'
import type { ToolManifest } from '../../lib/api'
import { useToolExecute } from '../../hooks/useToolExecute'
import { useToolDeps } from '../../hooks/useToolDeps'
import DependencyGate from '../../components/deps/DependencyGate'
import ToolResultPanel from '../../components/tools/ToolResultPanel'
import { formatBytes } from '../../lib/depsApi'
import {
  GEOMETRY_KEY,
  GEOMETRY_PRESETS,
  IMAGEMAGICK_ID,
  type FieldSpec,
} from './imagemagickManifest'

/** Kinds the artifact index labels as images. Anything else is not offered. */
const IMAGE_KINDS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tif', 'tiff', 'avif', 'svg'])

interface ArtifactIndexEntry {
  name: string
  path: string
  size: number
}

function contentUrl(path: string): string {
  return resolveUrl(`/api/artifacts/content?path=${encodeURIComponent(path)}`)
}

export interface ImageMagickWorkspaceProps {
  manifest: ToolManifest
  /** A path the hero already uploaded, carried across in the router state. */
  initialInputPath?: string
}

/**
 * The working state: a broad before/after canvas, a tool rail floating over it,
 * and a trailing action bar that sits outside the scrolling area — so the
 * dependency gate's install control is on screen by construction, not by luck.
 */
export default function ImageMagickWorkspace({ manifest, initialInputPath }: ImageMagickWorkspaceProps) {
  const navigate = useNavigate()
  const execute = useToolExecute(IMAGEMAGICK_ID)
  const deps = useToolDeps(IMAGEMAGICK_ID)
  const fileRef = useRef<HTMLInputElement>(null)

  const schema = (manifest.parameters_schema ?? {}) as Record<string, FieldSpec>
  const [params, setParams] = useState<Record<string, unknown>>(() => ({
    format: schema.format?.default ?? '',
    quality: schema.quality?.default ?? 85,
    resize: schema.resize?.default ?? '',
    input_path: initialInputPath ?? schema.input_path?.default ?? '',
  }))
  const [recent, setRecent] = useState<ArtifactIndexEntry[]>([])
  const [index, setIndex] = useState<Record<string, number>>({})
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const setKey = useCallback(
    (key: string, value: unknown) => setParams((previous) => ({ ...previous, [key]: value })),
    [],
  )

  const inputPath = String(params.input_path ?? '')
  const resize = String(params.resize ?? '')
  const quality = Number(params.quality ?? 0)
  const formatOptions = useMemo(
    () => (schema.format?.enum ?? []).map(String),
    [schema.format?.enum],
  )

  // The artifact index is the only source of real image sizes and real paths.
  const refreshIndex = useCallback(async (signal?: AbortSignal) => {
    const response = await api.getRecentArtifacts()
    if (signal?.aborted) return
    setRecent(response.artifacts.filter((entry) => IMAGE_KINDS.has(entry.kind.toLowerCase())))
    setIndex(Object.fromEntries(response.artifacts.map((entry) => [entry.path, entry.size])))
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    refreshIndex(controller.signal).catch((cause: unknown) => {
      if (!controller.signal.aborted) {
        setUploadError(
          `Could not read the artifact index: ${cause instanceof Error ? cause.message : String(cause)}`,
        )
      }
    })
    return () => controller.abort()
  }, [refreshIndex])

  const upload = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      const uploaded = await api.uploadFile(file)
      setKey('input_path', uploaded.path)
    } catch (cause: unknown) {
      setUploadError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setUploading(false)
    }
  }

  const output = execute.state.result?.status === 'completed' ? execute.state.result.artifacts[0] : undefined
  const outputFormat = output?.name?.split('.').pop() ?? null

  const run = async () => {
    const result = await execute.run(params)
    if (result?.status === 'completed') {
      // Sizes come from the backend's own index, written a moment ago.
      refreshIndex().catch(() => undefined)
    }
  }

  const clear = () => {
    execute.reset()
    setKey('input_path', '')
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

      <div className="im-stage">
        <aside className="im-rail" aria-label="Conversion tools">
          <p className="im-rail__title">
            <Ruler className="im-ico" width={13} height={13} aria-hidden="true" />
            Tool rail
          </p>

          <div className="im-rail__body">
            <div className="im-field" data-param-key="format">
              <span className="im-field__label" id="im-format-label">
                <span>
                  {schema.format?.title ?? 'format'} <span className="im-field__key">format</span>
                </span>
              </span>
              <div className="im-seg" role="group" aria-labelledby="im-format-label">
                {formatOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className="im-seg__opt"
                    aria-pressed={String(params.format ?? '') === option}
                    onClick={() => setKey('format', option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
              <p className="im-field__hint">
                Passed to the backend as the target extension. One of the {formatOptions.length} values
                the manifest declares.
              </p>
            </div>

            <div className="im-field" data-param-key="quality">
              <label className="im-field__label" htmlFor="im-quality">
                <span>
                  {schema.quality?.title ?? 'quality'}{' '}
                  <span className="im-field__key">quality</span>
                </span>
                <span className="im-value">{Number.isFinite(quality) ? quality : '—'}</span>
              </label>
              <input
                id="im-quality"
                className="im-range"
                type="range"
                min={1}
                max={100}
                step={1}
                value={Number.isFinite(quality) ? quality : 85}
                onChange={(event) => setKey('quality', Number(event.target.value))}
              />
              <p className="im-field__hint">
                Ignored by PNG, honoured by JPEG and WebP — that is the encoder&apos;s own rule, not
                this page&apos;s.
              </p>
            </div>

            <div className="im-field" data-param-key="input_path">
              <span className="im-field__label" id="im-source-label">
                <span>
                  {schema.input_path?.title ?? 'input_path'}{' '}
                  <span className="im-field__key">input_path</span>
                </span>
              </span>

              <div
                className="im-drop"
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
                <span>
                  {uploading ? 'Uploading to this machine…' : 'Drop an image, or click to browse'}
                </span>
                <span className="im-field__key">uploaded for real — no stub files</span>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="im-sr"
                aria-label="Upload an image file to convert"
                onChange={(event) => {
                  void upload(event.target.files?.[0])
                  event.target.value = ''
                }}
              />

              <label className="im-sr" htmlFor="im-input">
                Path to the input image on this machine
              </label>
              <input
                id="im-input"
                className="im-input"
                type="text"
                value={inputPath}
                placeholder={schema.input_path?.description ?? '/absolute/path/photo.jpg'}
                onChange={(event) => setKey('input_path', event.target.value)}
              />

              {recent.length > 0 && (
                <>
                  <label className="im-sr" htmlFor="im-recent">
                    Images already in the artifact index
                  </label>
                  <select
                    id="im-recent"
                    className="im-input"
                    value=""
                    onChange={(event) => event.target.value && setKey('input_path', event.target.value)}
                  >
                    <option value="">— pick an image the backend already has —</option>
                    {recent.map((entry) => (
                      <option key={entry.path} value={entry.path}>
                        {entry.name} · {formatBytes(entry.size)}
                      </option>
                    ))}
                  </select>
                </>
              )}

              {uploadError && (
                <p className="im-field__error" role="alert">
                  {uploadError}
                </p>
              )}
            </div>
          </div>
        </aside>

        <main className="im-canvas">
          <div className="im-canvas__grid">
            <figure className="im-pane" style={{ margin: 0 }}>
              <figcaption className="im-pane__head">
                <span>Input</span>
                <span className="im-pane__badge">
                  {inputPath ? inputPath.split('.').pop()?.toUpperCase() ?? 'FILE' : 'EMPTY'}
                </span>
              </figcaption>
              <div className="im-pane__surface">
                {inputPath ? (
                  <img className="im-pane__image" src={contentUrl(inputPath)} alt="The image this conversion will read" />
                ) : (
                  <div className="im-empty">
                    <p className="im-empty__marks" aria-hidden="true">
                      <span className="im-empty__mark" />
                      <span className="im-empty__mark" />
                      <span className="im-empty__mark im-empty__mark--accent" />
                      <span className="im-empty__mark" />
                    </p>
                    <p className="im-empty__title">No image chosen yet.</p>
                    <p className="im-empty__body">
                      Pick a file with <strong>Choose an image</strong> on the intro page, drop one on
                      this rail, or type a path this machine can read.
                    </p>
                    <p className="im-empty__why">
                      The pane is empty on purpose. The backend reads{' '}
                      <code>input_path</code> off disk and returns a failure if it is missing, so
                      nothing is drawn here that the backend has not actually been handed.
                    </p>
                  </div>
                )}
              </div>
              <dl className="im-pane__foot">
                <dt>name</dt>
                <dd>{inputPath ? inputPath.split('/').pop() : '—'}</dd>
                <dt>size</dt>
                <dd>
                  {inputPath && index[inputPath] !== undefined
                    ? formatBytes(index[inputPath])
                    : inputPath
                      ? 'not in the artifact index'
                      : '—'}
                </dd>
              </dl>
            </figure>

            <figure className="im-pane" style={{ margin: 0 }}>
              <figcaption className="im-pane__head">
                <span>Output</span>
                {outputFormat && <span className="im-pane__badge im-pane__badge--accent">{outputFormat.toUpperCase()}</span>}
              </figcaption>
              <div className="im-pane__surface">
                {output ? (
                  <img className="im-pane__image" src={contentUrl(output.path)} alt={`The ${outputFormat ?? ''} file the backend just wrote`} />
                ) : (
                  <div className="im-empty">
                    <p className="im-empty__marks" aria-hidden="true">
                      <span className="im-empty__mark" />
                      <span className="im-empty__mark im-empty__mark--accent" />
                      <span className="im-empty__mark" />
                      <span className="im-empty__mark" />
                    </p>
                    <p className="im-empty__title">
                      {execute.state.phase === 'idle' ? 'Nothing converted yet.' : 'No output file to show.'}
                    </p>
                    <p className="im-empty__body">
                      {execute.state.phase === 'idle'
                        ? 'Set a format, a quality and a geometry, then press Convert. One file is written per run.'
                        : 'The backend reported no artifact for this run. The full report is below the canvas.'}
                    </p>
                    <p className="im-empty__why">
                      {resize ? (
                        <>
                          This pane will load <code>{outputFormat ?? String(params.format ?? '')}</code> at
                          geometry <code>{resize}</code>, straight from the artifact index.
                        </>
                      ) : (
                        <>
                          <code>resize</code> is empty, so the output keeps the source dimensions.
                          Type a geometry below to change that.
                        </>
                      )}
                    </p>
                  </div>
                )}
              </div>
              <dl className="im-pane__foot">
                <dt>name</dt>
                <dd>{output?.name ?? '—'}</dd>
                <dt>size</dt>
                <dd>{output && index[output.path] !== undefined ? formatBytes(index[output.path]) : '—'}</dd>
                {output && (
                  <>
                    <dt>open</dt>
                    <dd>
                      <a
                        href={contentUrl(output.path)}
                        download={output.name}
                        style={{ color: 'inherit', textDecoration: 'underline' }}
                      >
                        <Download className="im-ico" width={12} height={12} aria-hidden="true" /> {output.name}
                      </a>
                    </dd>
                  </>
                )}
              </dl>
            </figure>
          </div>

          {execute.state.phase !== 'idle' && (
            <div className="im-report">
              <ToolResultPanel
                state={execute.state}
                toolId={IMAGEMAGICK_ID}
                toolName={manifest.name}
                onRerun={execute.reset}
              />
            </div>
          )}
        </main>
      </div>

      <footer className="im-dock" data-tool-gate-region={IMAGEMAGICK_ID}>
        <div className="im-dock__gate">
          <DependencyGate toolId={IMAGEMAGICK_ID} state={deps} accent="#0D99FF" />
        </div>

        <div className="im-dock__row">
          <div className="im-field im-dock__source">
            <span className="im-field__label">
              <span>
                Source <span className="im-field__key">input_path</span>
              </span>
              <span className="im-value">
                {inputPath && index[inputPath] !== undefined ? formatBytes(index[inputPath]) : '—'}
              </span>
            </span>
            <p className="im-dock__path">{inputPath || 'No image chosen — set one on the tool rail.'}</p>
          </div>

          <div className="im-field im-dock__geo" data-param-key="resize">
            <label className="im-field__label" htmlFor="im-resize">
              <span>
                {schema.resize?.title ?? 'resize'} <span className="im-field__key">resize</span>
              </span>
              <span className="im-value">{resize || 'source size kept'}</span>
            </label>
            <input
              id="im-resize"
              className="im-geo-input"
              type="text"
              inputMode="text"
              value={resize}
              placeholder={schema.resize?.placeholder ?? '800x600'}
              onChange={(event) => setKey('resize', event.target.value)}
            />
            <div className="im-chips">
              {GEOMETRY_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  className="im-chip"
                  aria-pressed={resize === preset.value}
                  onClick={() => setKey('resize', resize === preset.value ? '' : preset.value)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="im-dock__run">
            <button
              type="button"
              className="im-btn im-btn--accent im-run"
              onClick={() => void run()}
              disabled={execute.busy || !deps.ready}
            >
              {execute.busy ? (
                <Loader2 className="im-ico im-spin" width={16} height={16} aria-hidden="true" />
              ) : (
                <ImageDown className="im-ico" width={16} height={16} aria-hidden="true" />
              )}
              {execute.busy ? 'Converting…' : 'Convert'}
            </button>
            <button type="button" className="im-btn im-btn--outline" onClick={clear} disabled={execute.busy}>
              <UploadCloud className="im-ico" width={16} height={16} aria-hidden="true" />
              Clear
            </button>
            {execute.state.phase !== 'idle' && (
              <span className="im-timer">{execute.state.elapsedSeconds.toFixed(1)}s measured</span>
            )}
          </div>
        </div>

        {execute.state.error && (
          <div className="im-report__error" role="alert" style={{ marginTop: 0 }}>
            <h3>The backend reported</h3>
            <pre>{execute.state.error}</pre>
          </div>
        )}

        <details className="im-dock__key">
          <summary>What the geometry string means</summary>
          <dl className="im-pane__foot" style={{ borderTop: 0, paddingLeft: 0, paddingRight: 0 }}>
            {GEOMETRY_KEY.map(([token, meaning]) => (
              <div key={token} style={{ display: 'contents' }}>
                <dt>{token}</dt>
                <dd>{meaning}</dd>
              </div>
            ))}
          </dl>
        </details>
      </footer>
    </div>
  )
}