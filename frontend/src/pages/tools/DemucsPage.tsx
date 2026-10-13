import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Download,
  FileArchive,
  FolderTree,
  Layers,
  Loader2,
  PackageCheck,
  Play,
  RotateCcw,
  Stamp,
} from 'lucide-react'
import ToolPageShell from '../../components/tools/ToolPageShell'
import ToolResultPanel from '../../components/tools/ToolResultPanel'
import UniversalFileInput from '../../components/common/UniversalFileInput'
import { api, resolveUrl } from '../../lib/api'
import { useToolExecute } from '../../hooks/useToolExecute'
import DependencyGate from '../../components/deps/DependencyGate'
import { useToolDeps } from '../../hooks/useToolDeps'
import type { ToolPageProps } from '../../lib/toolPageTypes'

/**
 * Demucs stem separation — archive / result panel.
 *
 * Visual identity: an archival dossier. Paper sheet, ledger rules, rubber
 * stamps for the run's condition.
 *
 * Truth contract: the backend does NOT hand back four separate stem files.
 * It runs `demucs --out <dir>`, then zips everything the run produced into a
 * single `stems.zip` (backend/app/tools/mediainfo_tool.py:275-283) and returns
 * exactly one artifact. This page shows that one archive and says so plainly
 * rather than faking a four-lane mixer.
 */

const PAPER = 'bg-[#faf7f0]'
const INK = 'text-[#2b2622]'
const RULE = 'border-[#ddd3c0]'
const MUTED = 'text-[#7a7067]'

function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined) return 'size not indexed yet'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`
}

export default function DemucsPage({
  manifest,
  initialParams,
  initialInputPath,
  onComplete,
  onSendToTool,
}: ToolPageProps) {
  const execute = useToolExecute('demucs')
  const deps = useToolDeps('demucs')
  const schema = manifest.parameters_schema as Record<string, { title?: string; description?: string }>
  const [params, setParams] = useState<Record<string, unknown>>(() =>
    initialInputPath ? { ...initialParams, input_path: initialInputPath } : initialParams,
  )
  const [indexedSizes, setIndexedSizes] = useState<Record<string, number>>({})

  const inputPath = String(params.input_path ?? '')
  const phase = execute.state.phase

  // Real byte sizes come from the backend's own artifact index — never a guess.
  useEffect(() => {
    if (phase !== 'completed') return
    let active = true
    api
      .getRecentArtifacts()
      .then((res) => { if (active) setIndexedSizes(Object.fromEntries(res.artifacts.map((a) => [a.path, a.size]))) })
      .catch(() => { if (active) setIndexedSizes({}) })
    return () => { active = false }
  }, [phase, execute.state.result])

  const archive = useMemo(() => {
    if (execute.state.result?.status !== 'completed') return null
    return execute.state.result.artifacts.find((artifact) => artifact.path) ?? null
  }, [execute.state.result])

  const extraArtifacts = execute.state.result?.artifacts.length ?? 0

  const run = async () => {
    const result = await execute.run(params)
    if (result?.status === 'completed') onComplete?.(result, params)
  }

  const stamp =
    phase === 'completed'
      ? { label: 'archived', ring: 'border-success text-success bg-[#e7f2e9]' }
      : phase === 'failed'
        ? { label: 'not archived', ring: 'border-accent-contrast text-accent-contrast bg-[#fbeceb]' }
        : phase === 'executing'
          ? { label: 'processing', ring: 'border-brand-caramel text-brand-caramel bg-[#f7efe2]' }
          : phase === 'cancelled'
            ? { label: 'aborted', ring: 'border-[#7a7067] text-[#7a7067] bg-[#f1ede4]' }
            : { label: 'no record', ring: 'border-[#c9c0ae] text-[#9c948a] bg-transparent' }

  return (
    <ToolPageShell
      manifest={manifest}
      gate={<DependencyGate toolId="demucs" state={deps} />}
      headerActions={
        <span data-run-status={phase} className={`inline-flex -rotate-3 items-center gap-1.5 rounded border-2 px-2.5 py-1 font-mono text-[12px] uppercase tracking-[0.22em] ${stamp.ring}`}>
          <Stamp className="size-3" /> {stamp.label}
        </span>
      }
      aside={
        <div className={`sticky top-4 space-y-4 rounded-2xl border ${RULE} ${PAPER} p-4 shadow-sm ${INK}`}>
          <p className="flex items-center gap-1.5 font-mono text-[12px] uppercase tracking-[0.28em] text-brand-caramel-text">
            <Layers className="size-3" /> separation record
          </p>

          <dl className="space-y-1 font-mono text-xs">
            {[
              ['tool', manifest.id],
              ['phase', phase],
              ['reported status', execute.state.result?.status ?? '—'],
              ['measured elapsed', `${execute.state.elapsedSeconds.toFixed(1)}s`],
              ['backend duration', execute.state.result?.durationSeconds == null ? '—' : `${execute.state.result.durationSeconds.toFixed(1)}s`],
              ['artifacts returned', execute.state.result?.artifacts.length ?? 0],
              ['source bytes', formatBytes(inputPath ? indexedSizes[inputPath] : undefined)],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-2 border-b border-dashed border-[#e2d8c6] pb-1">
                <dt className={MUTED}>{label}</dt>
                <dd className="max-w-[11rem] truncate font-bold">{value}</dd>
              </div>
            ))}
          </dl>

          <p className="font-mono text-[12px] leading-relaxed text-brand-caramel-text">
            Only measured wall-clock seconds are shown. Demucs itself reports per-model progress on its own stderr,
            which this API does not forward, so no percentage is invented here.
          </p>

          <button
            type="button"
            onClick={() => void run()}
            disabled={execute.busy || !inputPath || !deps.ready}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-espresso px-3 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-brand-cream-light disabled:opacity-50"
          >
            {execute.busy ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5 fill-current" />}
            {execute.busy ? `separating · ${execute.state.elapsedSeconds.toFixed(1)}s` : 'separate stems'}
          </button>
          <button
            type="button"
            onClick={() => { execute.reset(); setIndexedSizes({}) }}
            disabled={execute.busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#c9c0ae] px-3 py-2 font-mono text-xs text-brand-caramel-text hover:border-brand-espresso disabled:opacity-40"
          >
            <RotateCcw className="size-3.5" /> void this record
          </button>

          {execute.state.error && (
            <div role="alert" className="rounded-xl border-2 border-accent-contrast bg-[#fbeceb] p-3">
              <p className="flex items-center gap-1.5 font-mono text-[12px] uppercase tracking-wider text-accent-contrast">
                <AlertTriangle className="size-3" /> demucs reported
              </p>
              <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-[#5c1d1d]">
                {execute.state.error}
              </pre>
              <p className="mt-2 border-t border-[#e8cfcd] pt-2 font-mono text-[12px] leading-snug text-[#8a4a48]">
                A message of <code>demucs not installed</code> means the CLI is missing on the backend host, so nothing
                was separated. Install it and run again — this page never substitutes a placeholder set of stems.
              </p>
            </div>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {/* ── DOSSIER SHEET ──────────────────────────────────────────────────── */}
        <section className={`rounded-2xl border ${RULE} ${PAPER} p-5 shadow-sm ${INK}`}>
          <header className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-[#2b2622] pb-3">
            <div>
              <h2 className="font-mono text-[12px] uppercase tracking-[0.3em] text-brand-caramel-text">separation order</h2>
              <p className="mt-1 font-mono text-lg font-bold leading-tight">Demucs stem extraction</p>
            </div>
            <div className="text-right font-mono text-[12px] text-brand-caramel-text">
              <p>tool · {manifest.id}</p>
              <p>manifest keys · {Object.keys(schema).join(', ')}</p>
            </div>
          </header>

          <div data-param-key="input_path" className="mt-4 space-y-2">
            <label htmlFor="demucs-input" className="block font-mono text-[12px] uppercase tracking-[0.18em] text-brand-caramel-text">
              {schema.input_path?.title ?? 'input_path'} — the mix to separate
            </label>
            <UniversalFileInput
              value={inputPath}
              onChange={(path) => setParams((prev) => ({ ...prev, input_path: path ?? '' }))}
              placeholder="/absolute/path/to/song.wav"
              accept="audio/*,video/*"
            />
            {schema.input_path?.description && (
              <p className="font-mono text-[12px] leading-snug text-brand-caramel-text">{schema.input_path.description}</p>
            )}
          </div>
        </section>

        {/* ── ARCHIVE ────────────────────────────────────────────────────────── */}
        {phase === 'idle' && (
          <section className={`rounded-2xl border-2 border-dashed ${RULE} ${PAPER} px-4 py-14 text-center`}>
            <FolderTree className="mx-auto size-8 text-[#c9c0ae]" />
            <p className="mt-2 font-mono text-xs text-brand-caramel-text">
              No separation has been run. Choose a source above and the archive the backend really produces will be
              filed here.
            </p>
          </section>
        )}

        {phase === 'executing' && (
          <section className={`rounded-2xl border ${RULE} ${PAPER} px-4 py-12 text-center ${INK}`}>
            <Loader2 className="mx-auto size-6 animate-spin text-brand-caramel" />
            <p className="mt-2 font-mono text-xs text-brand-caramel-text">
              demucs is running on the backend. {execute.state.elapsedSeconds.toFixed(1)}s measured so far.
            </p>
          </section>
        )}

        {archive && (
          <section className="overflow-hidden rounded-2xl border-2 border-brand-espresso bg-brand-cream-light">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-sage bg-brand-espresso px-4 py-2.5">
              <h2 className="flex items-center gap-2 font-mono text-[12px] font-bold uppercase tracking-[0.24em] text-brand-cream-light">
                <PackageCheck className="size-4 text-success" /> archived result
              </h2>
              <span className="font-mono text-[12px] text-brand-cream-dark">
                completed in {execute.state.result?.durationSeconds?.toFixed(1) ?? `${execute.state.elapsedSeconds.toFixed(1)}s`}
              </span>
            </header>

            <div className="space-y-4 p-4">
              <article className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-sage bg-surface-white p-4">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-mono text-sm font-bold text-brand-espresso">
                    <FileArchive className="size-4 text-brand-caramel" /> {archive.name}
                  </p>
                  <p className="mt-0.5 break-all font-mono text-[12px] text-brand-caramel-text">{archive.path}</p>
                  <p className="mt-0.5 font-mono text-[12px] text-brand-caramel-text">
                    kind: {archive.kind ?? 'not reported'} · size: {formatBytes(indexedSizes[archive.path])}
                  </p>
                </div>
                <a
                  href={resolveUrl(`/api/artifacts/content?path=${encodeURIComponent(archive.path)}`)}
                  download={archive.name}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-caramel px-3.5 py-2 font-mono text-xs font-bold uppercase tracking-wider text-brand-cream-light hover:bg-brand-caramel-hover"
                >
                  <Download className="size-3.5" /> download the archive
                </a>
              </article>

              <div className="rounded-xl border border-brand-sage bg-brand-cream-dark/40 p-3.5">
                <h3 className="flex items-center gap-1.5 font-mono text-[12px] uppercase tracking-[0.2em] text-brand-espresso">
                  <FolderTree className="size-3" /> what is inside
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-brand-espresso">
                  The backend returns <span className="font-bold">{extraArtifacts} artifact</span>
                  {extraArtifacts === 1 ? '' : 's'} for this run
                  {extraArtifacts === 1 ? ` — ${archive.name}` : ''}. Demucs writes its four stem tracks into a folder
                  tree, and the tool zips that tree into a single file, so vocals, drums, bass and other are{' '}
                  <span className="font-bold">inside the archive rather than listed as separate artifacts</span>.
                </p>
                <p className="mt-2 text-xs leading-relaxed text-brand-caramel-text">
                  This page deliberately does not unarchive the zip in the browser or draw four fake stem lanes: the API
                  exposes the archive as one file, and anything more specific than that would be invented. Download it
                  and open it with any archive tool.
                </p>
              </div>

              {extraArtifacts > 1 && (
                <ul className="space-y-1">
                  {execute.state.result?.artifacts.map((artifact) => (
                    <li key={artifact.path}>
                      <a
                        href={resolveUrl(`/api/artifacts/content?path=${encodeURIComponent(artifact.path)}`)}
                        download={artifact.name}
                        className="flex items-center justify-between gap-2 rounded-lg border border-brand-sage bg-surface-white px-3 py-2 font-mono text-[12px] text-brand-espresso hover:bg-brand-cream"
                      >
                        <span className="truncate">{artifact.name}</span>
                        <span className="shrink-0 text-brand-caramel-text">{formatBytes(indexedSizes[artifact.path])}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}

        {execute.state.result?.status === 'completed' && !archive && (
          <section className={`rounded-2xl border ${RULE} ${PAPER} px-4 py-4 font-mono text-xs text-brand-caramel-text`}>
            The run reported <span className="font-bold text-brand-espresso">completed</span> but returned no artifact
            path, so there is no archive to file or download.
          </section>
        )}

        {execute.state.phase !== 'idle' && (
          <div className={`rounded-2xl border ${RULE} ${PAPER} p-3`}>
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