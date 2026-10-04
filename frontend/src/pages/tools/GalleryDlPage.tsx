import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Download,
  Frame,
  ImageIcon,
  Images,
  Link2,
  Loader2,
  Play,
  RotateCcw,
} from 'lucide-react'
import ToolPageShell from '../../components/tools/ToolPageShell'
import ToolResultPanel from '../../components/tools/ToolResultPanel'
import { api, resolveUrl } from '../../lib/api'
import { useToolExecute } from '../../hooks/useToolExecute'
import DependencyGate from '../../components/deps/DependencyGate'
import { useToolDeps } from '../../hooks/useToolDeps'
import type { ToolPageProps } from '../../lib/toolPageTypes'

/**
 * gallery-dl — gallery wall / archive panel.
 *
 * Visual identity: a dark exhibition wall with white mat boards and thin
 * gallery labels, so the page reads as a contact sheet rather than a form.
 *
 * Truth contract: today the backend always delivers ONE `gallery.zip` — it
 * zips everything the CLI wrote (backend/app/tools/mediainfo_tool.py:229-236)
 * and returns that single artifact. The image grid below is wired to real
 * image artifacts and renders only if a run ever returns them; until then the
 * page says so instead of faking a wall of thumbnails.
 */

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|bmp|tiff?|avif|svg)$/i

function contentUrl(path: string): string {
  return resolveUrl(`/api/artifacts/content?path=${encodeURIComponent(path)}`)
}

function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined) return 'size not indexed yet'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`
}

export default function GalleryDlPage({
  manifest,
  initialParams,
  onComplete,
  onSendToTool,
}: ToolPageProps) {
  const execute = useToolExecute('gallery-dl')
  const deps = useToolDeps('gallery-dl')
  const schema = manifest.parameters_schema as Record<string, { title?: string; description?: string }>
  const [params, setParams] = useState<Record<string, unknown>>(initialParams)
  const [indexedSizes, setIndexedSizes] = useState<Record<string, number>>({})
  const [history, setHistory] = useState<string[]>([])

  const url = String(params.url ?? '')
  const phase = execute.state.phase

  useEffect(() => {
    if (phase !== 'completed') return
    let active = true
    api
      .getRecentArtifacts()
      .then((res) => { if (active) setIndexedSizes(Object.fromEntries(res.artifacts.map((a) => [a.path, a.size]))) })
      .catch(() => { if (active) setIndexedSizes({}) })
    return () => { active = false }
  }, [phase, execute.state.result])

  const artifacts = useMemo(() => execute.state.result?.artifacts ?? [], [execute.state.result])
  const archive = artifacts.find((artifact) => artifact.path) ?? null
  const images = artifacts.filter((artifact) => IMAGE_EXT.test(artifact.name))
  const failed = phase === 'failed' && Boolean(execute.state.error)

  const run = async () => {
    const result = await execute.run(params)
    if (url && !history.includes(url)) setHistory((prev) => [url, ...prev].slice(0, 6))
    if (result?.status === 'completed' && (result.artifacts?.length ?? 0) > 0) onComplete?.(result, params)
  }

  return (
    <ToolPageShell
      manifest={manifest}
      headerActions={
        <span className="inline-flex items-center gap-1.5 rounded border border-[#3d3d4c] bg-[#1c1c26] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.22em] text-[#c9cbe0]">
          <Frame className="size-3" /> gallery wall
        </span>
      }
      aside={
        <div className="sticky top-4 space-y-4 rounded-2xl border border-[#33333f] bg-[#16161e] p-4 text-[#e6e6f0]">
          <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.28em] text-[#8b8ca3]">
            <Images className="size-3" /> exhibition record
          </p>

          <dl className="space-y-1 font-mono text-xs">
            {[
              ['phase', phase],
              ['reported status', execute.state.result?.status ?? '—'],
              ['measured elapsed', `${execute.state.elapsedSeconds.toFixed(1)}s`],
              ['backend duration', execute.state.result?.durationSeconds == null ? '—' : `${execute.state.result.durationSeconds.toFixed(1)}s`],
              ['artifacts returned', artifacts.length],
              ['image artifacts', images.length],
              ['archives', archive ? 1 : 0],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-2 border-b border-[#262631] pb-1">
                <dt className="text-[#8b8ca3]">{label}</dt>
                <dd className="font-bold">{value}</dd>
              </div>
            ))}
          </dl>

          <p className="font-mono text-[10px] leading-relaxed text-[#8b8ca3]">
            gallery-dl gives no progress signal through this API, so the only figure reported is real measured elapsed
            time. No image count is estimated before the CLI has run.
          </p>

          <button
            type="button"
            onClick={execute.reset}
            disabled={execute.busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#33333f] px-3 py-2 font-mono text-xs text-[#a8a9bd] hover:border-[#c9cbe0] hover:text-[#e6e6f0] disabled:opacity-40"
          >
            <RotateCcw className="size-3.5" /> clear the wall
          </button>

          {execute.state.error && (
            <div role="alert" className="rounded-xl border border-[#7d3b3b] bg-[#2a1414] p-3">
              <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-[#ff9d9d]">
                <AlertTriangle className="size-3" /> gallery-dl reported
              </p>
              <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-[#ffd7d7]">
                {execute.state.error}
              </pre>
            </div>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {/* ── WALL LABEL / SOURCE ───────────────────────────────────────────── */}
        <section className="rounded-2xl border border-[#33333f] bg-[#1c1c26] p-4 text-[#e6e6f0]">
          <h2 className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.26em] text-[#8b8ca3]">
            <Link2 className="size-3.5 text-[#c9cbe0]" /> source address
          </h2>
          <div data-param-key="url" className="mt-3 space-y-2">
            <label htmlFor="gallery-url" className="block font-mono text-[10px] uppercase tracking-[0.18em] text-[#c9cbe0]">
              {schema.url?.title ?? 'url'} — gallery, album or image-set page
            </label>
            <DependencyGate toolId="gallery-dl" state={deps} />

            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="gallery-url"
                type="url"
                inputMode="url"
                value={url}
                onChange={(event) => setParams((prev) => ({ ...prev, url: event.target.value }))}
                onKeyDown={(event) => { if (event.key === 'Enter') void run() }}
                disabled={execute.busy}
                placeholder="https://example.com/album"
                className="flex-1 rounded-lg border border-[#33333f] bg-[#101017] px-3 py-2.5 font-mono text-sm text-[#e6e6f0] placeholder-[#55566b] focus:border-[#c9cbe0] focus:outline-none disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => void run()}
                disabled={execute.busy || !url || !deps.ready}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-[#c9cbe0] px-5 py-2.5 font-mono text-xs font-bold uppercase tracking-[0.18em] text-[#16161e] disabled:opacity-50"
              >
                {execute.busy ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                {execute.busy ? 'hanging' : 'hang the show'}
              </button>
            </div>
            <p className="font-mono text-[10px] leading-relaxed text-[#8b8ca3]">
              {schema.url?.description ?? 'Page or album URL to scrape.'} Passed verbatim as <code>url</code>. If the
              address is not one gallery-dl supports, the run fails and that message is shown here in full — no sample
              gallery is ever substituted.
            </p>
          </div>

          {history.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {history.map((entry) => (
                <li key={entry}>
                  <button
                    type="button"
                    onClick={() => setParams((prev) => ({ ...prev, url: entry }))}
                    className="max-w-[22rem] truncate rounded border border-[#33333f] px-2 py-0.5 font-mono text-[10px] text-[#a8a9bd] hover:border-[#c9cbe0] hover:text-[#e6e6f0]"
                  >
                    {entry}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── EMPTY / RUNNING ───────────────────────────────────────────────── */}
        {phase === 'idle' && (
          <section className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-[#33333f] bg-[#13131a] px-4 py-16 text-center">
            <Frame className="size-8 text-[#3d3d4c]" />
            <p className="font-mono text-xs text-[#8b8ca3]">
              The wall is bare. Enter a gallery address above and whatever gallery-dl really produced will be hung here.
            </p>
          </section>
        )}

        {phase === 'executing' && (
          <section className="flex flex-col items-center gap-2 rounded-2xl border border-[#33333f] bg-[#13131a] px-4 py-16 text-center">
            <Loader2 className="size-6 animate-spin text-[#c9cbe0]" />
            <p className="font-mono text-xs text-[#8b8ca3]">
              scraping server-side · {execute.state.elapsedSeconds.toFixed(1)}s measured so far
            </p>
          </section>
        )}

        {/* ── FAILURES ───────────────────────────────────────────────────────── */}
        {failed && (
          <section role="alert" className="rounded-2xl border-2 border-[#d05a5a] bg-[#2a1414] p-5">
            <p className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.24em] text-[#ff9d9d]">
              <AlertTriangle className="size-4" /> nothing was hung — the scrape failed
            </p>
            <pre className="mt-3 whitespace-pre-wrap break-words font-mono text-sm leading-relaxed text-[#ffd9d7]">
              {execute.state.error}
            </pre>
            <p className="mt-4 border-t border-[#4a2222] pt-3 font-mono text-[11px] leading-relaxed text-[#c98b87]">
              gallery-dl exits non-zero for an address it does not support, so the backend returns no archive at all. This
              is the tool&apos;s own stderr. No placeholder wall of images is shown for a failed run.
            </p>
          </section>
        )}

        {phase === 'cancelled' && (
          <section className="rounded-2xl border border-[#33333f] bg-[#13131a] px-4 py-5 text-center font-mono text-xs text-[#a8a9bd]">
            The scrape was cancelled{execute.state.error ? `: ${execute.state.error}` : '.'}
          </section>
        )}

        {/* ── ARCHIVE MAT ────────────────────────────────────────────────────── */}
        {archive && (
          <section className="rounded-2xl border border-[#33333f] bg-[#1c1c26] p-4">
            <h2 className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.26em] text-[#8b8ca3]">
              <Download className="size-3.5" /> delivery
            </h2>
            <figure className="mx-auto max-w-2xl">
              <div className="rounded-sm bg-[#f3f1ea] p-4 shadow-2xl">
                <div className="flex min-h-40 flex-col items-center justify-center gap-2 border border-dashed border-[#c9c4b6] px-4 py-8 text-center">
                  <Download className="size-7 text-[#8d8778]" />
                  <p className="font-mono text-sm font-bold text-[#2b2622]">{archive.name}</p>
                  <p className="break-all font-mono text-[11px] text-[#6f6a5f]">{archive.path}</p>
                  <p className="font-mono text-[11px] text-[#6f6a5f]">
                    kind: {archive.kind ?? 'not reported'} · {formatBytes(indexedSizes[archive.path])}
                  </p>
                </div>
              </div>
              <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] text-[#8b8ca3]">
                <span>the backend zips every file it scraped into this one archive</span>
                <a
                  href={contentUrl(archive.path)}
                  download={archive.name}
                  className="inline-flex items-center gap-1.5 rounded bg-[#f3f1ea] px-2.5 py-1 font-bold uppercase tracking-wider text-[#16161e] hover:bg-white"
                >
                  <Download className="size-3" /> download {archive.name}
                </a>
              </figcaption>
            </figure>
          </section>
        )}

        {/* ── IMAGE WALL (only when real image artifacts exist) ───────────────── */}
        {images.length > 0 && (
          <section className="rounded-2xl border border-[#33333f] bg-[#1c1c26] p-4">
            <h2 className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.26em] text-[#8b8ca3]">
              <ImageIcon className="size-3.5" /> image wall · {images.length} file(s)
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {images.map((image) => (
                <figure key={image.path} className="rounded-sm bg-[#f3f1ea] p-2">
                  <a href={contentUrl(image.path)} target="_blank" rel="noreferrer">
                    <img
                      src={contentUrl(image.path)}
                      alt={image.name}
                      loading="lazy"
                      className="aspect-square w-full object-cover"
                    />
                  </a>
                  <figcaption className="mt-1.5 flex items-center justify-between gap-1 font-mono text-[10px] text-[#6f6a5f]">
                    <span className="truncate" title={image.path}>{image.name}</span>
                    <a href={contentUrl(image.path)} download={image.name} aria-label={`Download ${image.name}`}>
                      <Download className="size-3" />
                    </a>
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}

        {execute.state.result?.status === 'completed' && images.length === 0 && (
          <p className="rounded-xl border border-[#33333f] bg-[#13131a] px-3 py-2.5 font-mono text-[11px] leading-relaxed text-[#a8a9bd]">
            No image files came back as separate artifacts, so there is no thumbnail wall to draw. The grid above this
            note only ever renders real image artifacts; the scraped files are inside{' '}
            {archive?.name ?? 'the returned archive'}.
          </p>
        )}

        {execute.state.result?.status === 'completed' && !archive && (
          <p className="rounded-xl border border-[#33333f] bg-[#13131a] px-3 py-2.5 font-mono text-xs text-[#a8a9bd]">
            The run reported <span className="font-bold text-[#e6e6f0]">completed</span> but returned no artifact path,
            so there is nothing to download.
          </p>
        )}

        {execute.state.phase !== 'idle' && (
          <div className="rounded-2xl bg-brand-cream-light p-3">
            <ToolResultPanel
              state={execute.state}
              toolId={manifest.id}
              toolName={manifest.name}
              onRerun={execute.reset}
              onSendToTool={onSendToTool}
            />
          </div>
        )}
      </div>
    </ToolPageShell>
  )
}