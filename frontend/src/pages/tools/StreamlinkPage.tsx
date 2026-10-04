import { useMemo, useState } from 'react'
import {
  Activity,
  AlertOctagon,
  Download,
  Loader2,
  RadioTower,
  RotateCcw,
  Signal,
} from 'lucide-react'
import ToolPageShell from '../../components/tools/ToolPageShell'
import ToolResultPanel from '../../components/tools/ToolResultPanel'
import { resolveUrl } from '../../lib/api'
import { useToolExecute } from '../../hooks/useToolExecute'
import DependencyGate from '../../components/deps/DependencyGate'
import { useToolDeps } from '../../hooks/useToolDeps'
import type { ToolPageProps } from '../../lib/toolPageTypes'

/**
 * Streamlink / yt-dlp live capture desk.
 *
 * Visual identity: a broadcast status board — tally lamp, big amber-on-black
 * readouts, an OFF-AIR plate that owns the screen whenever the capture fails.
 *
 * Truth contract: the backend tries the `streamlink` CLI first and silently
 * falls back to `yt-dlp` (backend/app/tools/mediainfo_tool.py:82-111). A failed
 * run therefore means *both* paths failed, and the failure text is shown
 * verbatim. "Captured" is only ever claimed when a real artifact came back.
 */

function contentUrl(path: string): string {
  return resolveUrl(`/api/artifacts/content?path=${encodeURIComponent(path)}`)
}

const TALLY: Record<string, { label: string; lamp: string; plate: string; text: string }> = {
  idle: {
    label: 'standby',
    lamp: 'bg-[#3a4148] ring-[#3a4148]',
    plate: 'border-[#2b3238] bg-[#0d1116]',
    text: 'text-[#6c7a86]',
  },
  executing: {
    label: 'on air · capturing',
    lamp: 'bg-[#f0b429] ring-[#f0b429] animate-pulse',
    plate: 'border-[#f0b429] bg-[#1a1408]',
    text: 'text-[#f0b429]',
  },
  completed: {
    label: 'captured',
    lamp: 'bg-[#3ddc84] ring-[#3ddc84]',
    plate: 'border-[#3ddc84] bg-[#08160f]',
    text: 'text-[#3ddc84]',
  },
  failed: {
    label: 'off air · capture failed',
    lamp: 'bg-[#ff3b30] ring-[#ff3b30]',
    plate: 'border-[#ff3b30] bg-[#1c0a0a]',
    text: 'text-[#ff6b63]',
  },
  cancelled: {
    label: 'aborted',
    lamp: 'bg-[#8a8f96] ring-[#8a8f96]',
    plate: 'border-[#8a8f96] bg-[#121417]',
    text: 'text-[#a8b0b8]',
  },
}

export default function StreamlinkPage({
  manifest,
  initialParams,
  onComplete,
  onSendToTool,
}: ToolPageProps) {
  const execute = useToolExecute('streamlink')
  const deps = useToolDeps('streamlink')
  const schema = manifest.parameters_schema as Record<string, { title?: string; description?: string }>
  const [params, setParams] = useState<Record<string, unknown>>(initialParams)
  const [recentUrls, setRecentUrls] = useState<string[]>([])

  const url = String(params.url ?? '')
  const phase = execute.state.phase
  const tally = TALLY[phase] ?? TALLY.idle

  // "Captured" is only ever claimed when the backend really returned a file.
  const captured = useMemo(() => {
    if (execute.state.result?.status !== 'completed') return null
    const artifact = execute.state.result.artifacts.find((entry) => entry.path)
    return artifact ?? null
  }, [execute.state.result])

  const failed = phase === 'failed' && Boolean(execute.state.error)

  const run = async () => {
    const result = await execute.run(params)
    if (url && !recentUrls.includes(url)) setRecentUrls((prev) => [url, ...prev].slice(0, 8))
    if (result?.status === 'completed' && (result.artifacts?.length ?? 0) > 0) onComplete?.(result, params)
  }

  return (
    <ToolPageShell
      manifest={manifest}
      gate={<DependencyGate toolId="streamlink" state={deps} />}
      headerActions={
        <span
          className={`inline-flex items-center gap-2 rounded-md px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.24em] ${tally.plate} ${tally.text}`}
        >
          <span className={`inline-block size-2 rounded-full ring-2 ${tally.lamp}`} aria-hidden="true" />
          {tally.label}
        </span>
      }
      aside={
        <div className="sticky top-4 space-y-4 rounded-2xl border border-[#2b3238] bg-[#0d1116] p-4 font-mono text-[#c7d1d9]">
          <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.28em] text-[#6c7a86]">
            <Signal className="size-3" /> desk meters
          </p>

          <dl className="space-y-1 text-xs">
            {[
              ['phase', phase],
              ['reported status', execute.state.result?.status ?? '—'],
              ['measured elapsed', `${execute.state.elapsedSeconds.toFixed(1)}s`],
              ['backend duration', execute.state.result?.durationSeconds == null ? '—' : `${execute.state.result.durationSeconds.toFixed(1)}s`],
              ['artifacts returned', execute.state.result?.artifacts.length ?? 0],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-2 border-b border-[#1b2127] pb-1">
                <dt className="text-[#6c7a86]">{label}</dt>
                <dd className="font-bold text-[#e6edf3]">{value}</dd>
              </div>
            ))}
          </dl>

          <p className="text-[10px] leading-relaxed text-[#6c7a86]">
            The only live figure here is measured wall-clock time from <code>Date.now()</code>. There is no progress
            percentage, because the backend does not report one for a single capture command.
          </p>

          <button
            type="button"
            onClick={execute.reset}
            disabled={execute.busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#2b3238] px-3 py-2 text-xs text-[#9aa7b2] hover:border-[#f0b429] hover:text-[#f0b429] disabled:opacity-40"
          >
            <RotateCcw className="size-3.5" /> strike the tally
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* ── PATCH BAY ──────────────────────────────────────────────────────── */}
        <section className="rounded-2xl border border-[#2b3238] bg-[#0d1116] p-4">
          <h2 className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.26em] text-[#6c7a86]">
            <RadioTower className="size-3.5 text-[#f0b429]" /> source feed
          </h2>
          <div data-param-key="url" className="mt-3 space-y-2">
            <label htmlFor="streamlink-url" className="block font-mono text-[10px] uppercase tracking-[0.18em] text-[#f0b429]">
              {schema.url?.title ?? 'url'} — live HLS/DASH stream address
            </label>

            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="streamlink-url"
                type="url"
                inputMode="url"
                value={url}
                onChange={(event) => setParams((prev) => ({ ...prev, url: event.target.value }))}
                onKeyDown={(event) => { if (event.key === 'Enter') void run() }}
                disabled={execute.busy}
                placeholder="https://example.com/live/index.m3u8"
                className="flex-1 rounded-lg border border-[#2b3238] bg-[#05070a] px-3 py-2.5 font-mono text-sm text-[#e6edf3] placeholder-[#4a545e] focus:border-[#f0b429] focus:outline-none disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => void run()}
                disabled={execute.busy || !url || !deps.ready}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-[#f0b429] px-5 py-2.5 font-mono text-xs font-bold uppercase tracking-[0.18em] text-[#0d1116] disabled:opacity-50"
              >
                {execute.busy ? <Loader2 className="size-4 animate-spin" /> : <Activity className="size-4" />}
                {execute.busy ? 'capturing' : 'go live'}
              </button>
            </div>
            <p className="font-mono text-[10px] leading-relaxed text-[#6c7a86]">
              {schema.url?.description ?? 'Direct stream URL to capture.'} Entered verbatim as the{' '}
              <code>url</code> parameter. No rewriting, no probing, no defaults.
            </p>
          </div>

          {recentUrls.length > 0 && (
            <div className="mt-3 space-y-1">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#6c7a86]">this session&apos;s attempts</p>
              <ul className="flex flex-wrap gap-1.5">
                {recentUrls.map((entry) => (
                  <li key={entry}>
                    <button
                      type="button"
                      onClick={() => setParams((prev) => ({ ...prev, url: entry }))}
                      className="max-w-[22rem] truncate rounded border border-[#2b3238] px-2 py-0.5 font-mono text-[10px] text-[#9aa7b2] hover:border-[#f0b429] hover:text-[#f0b429]"
                    >
                      {entry}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* ── TALLY / RESULT PLATE ────────────────────────────────────────────── */}
        {phase === 'idle' && (
          <section className={`flex flex-col items-center gap-2 rounded-2xl border px-4 py-14 text-center ${tally.plate}`}>
            <span className={`inline-block size-4 rounded-full ring-4 ${tally.lamp}`} aria-hidden="true" />
            <p className={`font-mono text-sm uppercase tracking-[0.24em] ${tally.text}`}>standby</p>
            <p className="max-w-md font-mono text-xs leading-relaxed text-[#6c7a86]">
              No capture has been attempted from this desk. Paste a stream address above and hit go live.
            </p>
          </section>
        )}

        {phase === 'executing' && (
          <section className={`flex flex-col items-center gap-2 rounded-2xl border px-4 py-14 text-center ${tally.plate}`}>
            <span className={`inline-block size-4 rounded-full ring-4 ${tally.lamp}`} aria-hidden="true" />
            <p className={`font-mono text-sm uppercase tracking-[0.24em] ${tally.text}`}>on air · capturing</p>
            <p className="font-mono text-xs text-[#6c7a86]">
              The capture command is running server-side. {execute.state.elapsedSeconds.toFixed(1)}s measured.
            </p>
          </section>
        )}

        {/* Failures own the screen. The backend text is shown verbatim. */}
        {failed && (
          <section role="alert" className="rounded-2xl border-2 border-[#ff3b30] bg-[#1c0a0a] p-5">
            <p className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.24em] text-[#ff6b63]">
              <AlertOctagon className="size-4" /> off air — capture failed
            </p>
            <pre className="mt-3 whitespace-pre-wrap break-words font-mono text-sm leading-relaxed text-[#ffd9d7]">
              {execute.state.error}
            </pre>
            <p className="mt-4 border-t border-[#4a1c1c] pt-3 font-mono text-[11px] leading-relaxed text-[#c98b87]">
              The backend runs the <code>streamlink</code> CLI first and falls back to <code>yt-dlp</code> when it
              produces no file. This failure text is what that fallback reported. No partial capture exists, so nothing is
              shown as captured here.
            </p>
          </section>
        )}

        {phase === 'cancelled' && (
          <section className={`rounded-2xl border px-4 py-6 text-center font-mono text-xs ${tally.plate} ${tally.text}`}>
            The capture was cancelled{execute.state.error ? `: ${execute.state.error}` : '.'}
          </section>
        )}

        {captured && (
          <section className={`rounded-2xl border ${tally.plate} p-5`}>
            <p className={`flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.24em] ${tally.text}`}>
              <span className={`inline-block size-2.5 rounded-full ring-2 ${tally.lamp}`} aria-hidden="true" />
              captured — real file returned by the backend
            </p>
            <dl className="mt-3 space-y-1 font-mono text-xs text-[#c7d1d9]">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-[#6c7a86]">name</dt>
                <dd className="font-bold">{captured.name}</dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-[#6c7a86]">path</dt>
                <dd className="break-all font-mono text-[11px]">{captured.path}</dd>
              </div>
              {captured.kind && (
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-[#6c7a86]">kind</dt>
                  <dd className="font-bold">{captured.kind}</dd>
                </div>
              )}
            </dl>
            <video
              controls
              preload="metadata"
              src={contentUrl(captured.path)}
              className="mt-4 w-full rounded-xl bg-black"
              aria-label={`Captured file ${captured.name}`}
            />
            <a
              href={contentUrl(captured.path)}
              download={captured.name}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#3ddc84] px-3 py-2 font-mono text-xs font-bold uppercase tracking-wider text-[#08160f]"
            >
              <Download className="size-3.5" /> download {captured.name}
            </a>
          </section>
        )}

        {execute.state.result?.status === 'completed' && !captured && (
          <section className="rounded-2xl border border-[#2b3238] bg-[#0d1116] px-4 py-4 font-mono text-xs text-[#9aa7b2]">
            The run reported <span className="text-[#3ddc84]">completed</span> but returned no artifact path, so there is
            no captured file to show or download.
          </section>
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