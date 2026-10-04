import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Crop,
  Download,
  ImageDown,
  Images,
  Loader2,
  Play,
  RotateCcw,
  Ruler,
  UploadCloud,
} from 'lucide-react'
import { api, resolveUrl } from '../../lib/api'
import { useToolExecute } from '../../hooks/useToolExecute'
import DependencyGate from '../../components/deps/DependencyGate'
import { useToolDeps } from '../../hooks/useToolDeps'
import ToolPageShell from '../../components/tools/ToolPageShell'
import ToolResultPanel from '../../components/tools/ToolResultPanel'
import type { ToolPageProps } from '../../lib/toolPageTypes'

interface FieldSpec {
  type?: string
  title?: string
  description?: string
  enum?: (string | number)[]
  placeholder?: string
}

const IMAGE_KINDS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tif', 'tiff', 'avif', 'svg'])

/** Geometry presets write real ImageMagick `-resize` values; nothing is estimated. */
const RESIZE_PRESETS = [
  { label: '25%', value: '25%' },
  { label: '50%', value: '50%' },
  { label: '75%', value: '75%' },
  { label: '200%', value: '200%' },
  { label: 'w 1200', value: '1200x0' },
  { label: 'h 1200', value: '0x1200' },
  { label: 'Fit 800', value: '800x800>' },
  { label: 'Fill 800', value: '800x800^' },
]

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return 'unknown size'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`
}

function contentUrl(path: string): string {
  return resolveUrl(`/api/artifacts/content?path=${encodeURIComponent(path)}`)
}

/**
 * ImageMagick workbench — a split canvas (input | output) with a floating tool
 * rail. Every control writes one manifest key; nothing is rendered before the
 * backend has actually answered.
 */
export default function ImageMagickPage({
  manifest,
  initialParams,
  initialInputPath,
  onComplete,
  onSendToTool,
}: ToolPageProps) {
  const schema = manifest.parameters_schema as Record<string, FieldSpec>
  const execute = useToolExecute('imagemagick')
  const deps = useToolDeps('imagemagick')
  const fileRef = useRef<HTMLInputElement>(null)
  const [params, setParams] = useState<Record<string, unknown>>(() =>
    initialInputPath ? { ...initialParams, input_path: initialInputPath } : initialParams,
  )
  const [recent, setRecent] = useState<{ name: string; path: string; size: number }[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [indexSizes, setIndexSizes] = useState<Record<string, number>>({})

  const inputPath = String(params.input_path ?? '')
  const formatOptions = useMemo(() => {
    const fromSchema = schema.format?.enum
    return (fromSchema && fromSchema.length ? fromSchema : ['png', 'jpg', 'webp']).map(String)
  }, [schema.format?.enum])
  const quality = Number(params.quality ?? 85)

  const setKey = (key: string, value: unknown) => setParams((prev) => ({ ...prev, [key]: value }))

  useEffect(() => {
    let active = true
    api
      .getRecentArtifacts()
      .then((res) => {
        if (!active) return
        setRecent(res.artifacts.filter((a) => IMAGE_KINDS.has(a.kind.toLowerCase())))
      })
      .catch((err) => {
        if (active) setUploadError(`Could not list recent images: ${err instanceof Error ? err.message : String(err)}`)
      })
    return () => { active = false }
  }, [])

  // Real byte sizes come from the backend's own artifact index, never a guess.
  useEffect(() => {
    if (execute.state.phase !== 'completed') return
    let active = true
    api
      .getRecentArtifacts()
      .then((res) => {
        if (active) setIndexSizes(Object.fromEntries(res.artifacts.map((a) => [a.path, a.size])))
      })
      .catch(() => { if (active) setIndexSizes({}) })
    return () => { active = false }
  }, [execute.state.phase, execute.state.result])

  const handleUpload = async (file: File) => {
    setUploading(true)
    setUploadError(null)
    try {
      const res = await api.uploadFile(file)
      setKey('input_path', res.path)
    } catch (err) {
      setUploadError(`Upload failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setUploading(false)
    }
  }

  const output = execute.state.result?.status === 'completed' ? execute.state.result.artifacts[0] : undefined
  const outputSize = output ? indexSizes[output.path] : undefined

  const run = async () => {
    const result = await execute.run(params)
    if (result && result.status === 'completed') onComplete?.(result, params)
  }

  const stage = (
    caption: string,
    badge: string,
    path: string | undefined,
    size: number | undefined,
    downloadName?: string,
  ) => (
    <figure className="space-y-2">
      <figcaption className="flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-brand-cream-dark/60">
        <span>{caption}</span>
        <span className="rounded-sm border border-brand-cream-dark/25 px-1.5 py-0.5 text-brand-cream-dark/80">
          {badge}
        </span>
      </figcaption>
      <div className="flex min-h-64 items-center justify-center rounded-2xl border border-brand-cream-dark/20 bg-[repeating-conic-gradient(rgba(255,255,255,0.07)_0%_25%,transparent_0%_50%)] bg-[length:22px_22px] p-3">
        {path ? (
          <img
            src={contentUrl(path)}
            alt={downloadName ?? 'image'}
            className="max-h-[26rem] w-auto max-w-full rounded-lg object-contain shadow-2xl"
          />
        ) : (
          <p className="px-4 text-center font-mono text-xs text-brand-cream-dark/50">
            {caption === 'Input' ? 'Drop an image to begin.' : 'No output yet — run the tool.'}
          </p>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 font-mono text-[10px] text-brand-cream-dark/70">
        <span className="truncate">{path ? path.split('/').pop() : '—'}</span>
        <span>{size === undefined ? 'size not indexed yet' : formatBytes(size)}</span>
      </div>
      {path && downloadName && (
        <a
          href={contentUrl(path)}
          download={downloadName}
          className="inline-flex items-center gap-1.5 rounded-lg border border-brand-cream-dark/30 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-brand-cream-dark hover:bg-brand-cream-dark/10"
        >
          <Download className="size-3" /> Download {downloadName}
        </a>
      )}
    </figure>
  )

  return (
    <ToolPageShell
      manifest={manifest}
      headerActions={
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-brand-espresso px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-brand-cream-light">
          <Images className="size-3" /> before / after
        </span>
      }
      aside={
        <div className="sticky top-4 space-y-4 rounded-2xl bg-brand-espresso p-4 text-brand-cream-light shadow-xl">
          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-brand-cream-dark/60">Tool rail</p>

          <div data-param-key="format" className="space-y-2">
            <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-brand-cream-dark/70">
              <ImageDown className="size-3" /> {schema.format?.title ?? 'format'}
            </span>
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-brand-cream-dark/10 p-1">
              {formatOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setKey('format', option)}
                  className={`rounded-lg px-2 py-1.5 font-mono text-xs uppercase transition-colors ${
                    String(params.format ?? '') === option
                      ? 'bg-brand-caramel text-brand-cream-light'
                      : 'text-brand-cream-dark/70 hover:bg-brand-cream-dark/15'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div data-param-key="quality" className="space-y-2">
            <label htmlFor="im-quality" className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-brand-cream-dark/70">
              <span className="flex items-center gap-1.5"><Ruler className="size-3" /> {schema.quality?.title ?? 'quality'}</span>
              <span className="rounded-sm bg-brand-caramel px-1.5 py-0.5 text-brand-cream-light">{quality}</span>
            </label>
            <input
              id="im-quality"
              type="range"
              min={1}
              max={100}
              value={Number.isFinite(quality) ? quality : 85}
              onChange={(e) => setKey('quality', Number(e.target.value))}
              className="w-full accent-brand-caramel"
            />
            <p className="font-mono text-[10px] text-brand-cream-dark/50">Sent verbatim as <code>quality</code>; ImageMagick applies it via <code>-quality</code>.</p>
          </div>

          <div data-param-key="resize" className="space-y-2">
            <label htmlFor="im-resize" className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-brand-cream-dark/70">
              <Crop className="size-3" /> {schema.resize?.title ?? 'resize'}
            </label>
            <input
              id="im-resize"
              type="text"
              value={String(params.resize ?? '')}
              onChange={(e) => setKey('resize', e.target.value)}
              placeholder={schema.resize?.placeholder ?? 'e.g. 800x600, 50%'}
              className="w-full rounded-lg border border-brand-cream-dark/25 bg-brand-cream-dark/10 px-2.5 py-1.5 font-mono text-xs text-brand-cream-light placeholder-brand-cream-dark/40 focus:border-brand-caramel focus:outline-none"
            />
            <div className="grid grid-cols-4 gap-1">
              {RESIZE_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setKey('resize', preset.value)}
                  className="rounded-md border border-brand-cream-dark/20 px-1 py-1 font-mono text-[10px] text-brand-cream-dark/75 hover:border-brand-caramel hover:text-brand-cream-light"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <DependencyGate toolId="imagemagick" state={deps} />

          <button
            type="button"
            onClick={() => void run()}
            disabled={execute.busy || !deps.ready}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-caramel px-3 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-brand-cream-light disabled:opacity-50"
          >
            {execute.busy ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5 fill-current" />}
            {execute.busy ? `Converting · ${execute.state.elapsedSeconds.toFixed(1)}s` : 'Convert'}
          </button>
          <button
            type="button"
            onClick={() => { execute.reset(); setIndexSizes({}) }}
            disabled={execute.busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-brand-cream-dark/25 px-3 py-2 font-mono text-xs text-brand-cream-dark/80 disabled:opacity-40"
          >
            <RotateCcw className="size-3.5" /> Clear canvas
          </button>
          {execute.state.error && (
            <div role="alert" className="rounded-xl border border-accent-contrast/60 bg-accent-contrast/15 p-3">
              <p className="font-mono text-[10px] uppercase tracking-wider text-accent-contrast">Backend said</p>
              <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-brand-cream-light">{execute.state.error}</pre>
            </div>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        <div data-param-key="input_path" className="space-y-2 rounded-2xl border border-brand-sage bg-surface-white p-4">
          <label htmlFor="im-input" className="flex items-center gap-2 text-xs font-bold text-brand-espresso">
            <UploadCloud className="size-3.5 text-brand-caramel" />
            {schema.input_path?.title ?? 'input_path'}
            <span className="ml-1 rounded bg-brand-sage/30 px-1.5 py-0.5 font-mono text-[10px] text-brand-espresso">
              {schema.input_path?.description ?? 'Path to input image file (PNG, JPG, WebP, etc.).'}
            </span>
          </label>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const file = e.dataTransfer.files?.[0]
              if (file) void handleUpload(file)
            }}
            onClick={() => fileRef.current?.click()}
            className="cursor-pointer rounded-xl border-2 border-dashed border-brand-sage bg-brand-cream/40 px-3 py-2.5 text-center text-xs text-brand-caramel-text transition-colors hover:border-brand-caramel"
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleUpload(file)
              }}
            />
            {uploading ? (
              <span className="inline-flex items-center gap-1.5 font-bold text-brand-caramel">
                <Loader2 className="size-3.5 animate-spin" /> Uploading to the server…
              </span>
            ) : (
              <>Click to browse or drop an image — it is uploaded for real, no stubbing.</>
            )}
          </div>
          <input
            id="im-input"
            type="text"
            value={inputPath}
            onChange={(e) => setKey('input_path', e.target.value)}
            placeholder="Absolute path on the server, e.g. /path/to/photo.jpg"
            className="w-full rounded-xl border border-brand-sage bg-brand-cream/60 px-3 py-2 font-mono text-xs text-brand-espresso focus:border-brand-caramel focus:outline-none"
          />
          {recent.length > 0 && (
            <select
              value=""
              onChange={(e) => e.target.value && setKey('input_path', e.target.value)}
              className="w-full rounded-xl border border-brand-sage bg-brand-cream-dark/40 px-3 py-2 font-mono text-xs text-brand-espresso focus:border-brand-caramel focus:outline-none"
            >
              <option value="">— pick a real image the backend already has —</option>
              {recent.map((a) => (
                <option key={a.path} value={a.path}>[{a.name.split('.').pop()}] {a.name} · {formatBytes(a.size)}</option>
              ))}
            </select>
          )}
          {uploadError && (
            <p role="alert" className="rounded-lg bg-accent-contrast/10 px-2.5 py-1.5 text-xs text-accent-contrast">{uploadError}</p>
          )}
        </div>

        <div className="grid gap-4 rounded-2xl bg-brand-espresso p-4 sm:grid-cols-2">
          {stage('Input', String(params.format ?? 'webp').toUpperCase(), inputPath || undefined, recent.find((a) => a.path === inputPath)?.size)}
          {stage('Output', (output?.name?.split('.').pop() ?? '—').toUpperCase(), output?.path, outputSize, output?.name)}
        </div>

        {execute.state.phase !== 'idle' && (
          <ToolResultPanel
            state={execute.state}
            toolId="imagemagick"
            toolName={manifest.name}
            onRerun={execute.reset}
            onSendToTool={onSendToTool}
          />
        )}
        <p className="font-mono text-[10px] text-brand-caramel-text">
          {Object.keys(schema).length} manifest keys on this page: {Object.keys(schema).join(', ')}
        </p>
      </div>
    </ToolPageShell>
  )
}
