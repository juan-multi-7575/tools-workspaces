import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  CircleDot,
  Download,
  FileCode2,
  Loader2,
  Play,
  Square,
  Terminal,
  Timer,
} from 'lucide-react'
import ToolPageShell from '../../components/tools/ToolPageShell'
import ToolResultPanel from '../../components/tools/ToolResultPanel'
import { resolveUrl } from '../../lib/api'
import { useToolExecute } from '../../hooks/useToolExecute'
import type { ToolPageProps } from '../../lib/toolPageTypes'

interface FieldSpec {
  type?: string
  title?: string
  description?: string
  enum?: (string | number)[]
  default?: unknown
}

const LANGUAGES = [
  { id: 'python', ext: 'py', prompt: '~', accent: 'text-amber-300' },
  { id: 'bash', ext: 'sh', prompt: '$', accent: 'text-emerald-300' },
] as const

/**
 * Script runner — a full-bleed dark terminal. The editor starts empty: this
 * tool executes arbitrary user code, and shipping a pre-filled script would be
 * a stub. The backend requires `code`, so running with an empty buffer returns
 * its own message, which is rendered verbatim.
 *
 * Note: the manifest declares exactly four parameters (`language`, `code`,
 * `custom_args`, `timeout`) and `ScriptRunnerTool.execute` reads only those —
 * it has no script-file path input, so none is offered here.
 */
export default function ScriptRunnerPage({
  manifest,
  initialParams,
  onComplete,
  onSendToTool,
}: ToolPageProps) {
  const schema = useMemo(
    () => (manifest.parameters_schema ?? {}) as Record<string, FieldSpec>,
    [manifest.parameters_schema],
  )
  const execute = useToolExecute('script_runner')
  const [params, setParams] = useState<Record<string, unknown>>({ ...initialParams })
  const [scrollTop, setScrollTop] = useState(0)

  const setKey = (key: string, value: unknown) => setParams((prev) => ({ ...prev, [key]: value }))

  const language = String(params.language ?? schema.language?.default ?? 'python')
  const code = typeof params.code === 'string' ? params.code : ''
  const customArgs = typeof params.custom_args === 'string' ? params.custom_args : ''
  const timeoutRaw = Number(params.timeout ?? 300)
  const timeout = Number.isFinite(timeoutRaw) ? timeoutRaw : 300
  const languages = (schema.language?.enum ?? ['python', 'bash']).map(String)

  const result = execute.state.result
  const completed = result?.status === 'completed'
  const data = result?.data ?? null

  // Only real, verified values are ever read off the response.
  const stdout = completed && data && typeof data.stdout === 'string' ? data.stdout : null
  const stderr = completed && data && typeof data.stderr === 'string' ? data.stderr : null
  const exitCode = completed && data && typeof data.exit_code === 'number' ? data.exit_code : null
  const failed = execute.state.result?.status === 'failed'

  const lineNumbers = useMemo(() => {
    const count = code.split('\n').length
    return Array.from({ length: Math.max(count, 1) }, (_, i) => i + 1)
  }, [code])

  const canRun = code.trim().length > 0

  const run = async () => {
    const res = await execute.run({ ...params, language, code, custom_args: customArgs, timeout })
    if (res?.status === 'completed') onComplete?.(res, params)
  }

  const activeLang = LANGUAGES.find((entry) => entry.id === language) ?? LANGUAGES[0]

  return (
    <ToolPageShell
      manifest={manifest}
      headerActions={
        <span className="inline-flex items-center gap-1.5 rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-300">
          <Terminal className="size-3" /> terminal
        </span>
      }
    >
      <div className="-mx-4 -mt-6 sm:-mx-8">
        <div className="overflow-hidden rounded-t-xl border-x border-t border-neutral-800 bg-neutral-950 text-neutral-200">
          {/* ── TERMINAL CHROME ───────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-3 border-b border-neutral-800 bg-neutral-900 px-4 py-2">
            <div className="flex gap-1.5">
              <span className="size-2.5 rounded-full bg-red-500/70" />
              <span className="size-2.5 rounded-full bg-amber-500/70" />
              <span className="size-2.5 rounded-full bg-emerald-500/70" />
            </div>
            <span className="font-mono text-[11px] text-neutral-500">
              {manifest.id} — session {String(manifest.id).slice(0, 8)}
            </span>

            <div data-param-key="language" className="ml-auto flex overflow-hidden rounded border border-neutral-700">
              {languages.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setKey('language', option)}
                  disabled={execute.busy}
                  aria-pressed={language === option}
                  className={`px-3 py-1 font-mono text-[11px] transition-colors ${
                    language === option
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-neutral-900 text-neutral-500 hover:text-neutral-300'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          {/* ── COMMAND LINE ──────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2 border-b border-neutral-800 bg-neutral-900/60 px-4 py-2.5">
            <span className={`font-mono text-sm ${activeLang.accent}`}>{activeLang.prompt}</span>

            <div data-param-key="custom_args" className="flex min-w-[180px] flex-1 items-center gap-2">
              <label htmlFor="sr-args" className="font-mono text-[11px] text-neutral-500">
                args
              </label>
              <input
                id="sr-args"
                type="text"
                value={customArgs}
                onChange={(e) => setKey('custom_args', e.target.value)}
                disabled={execute.busy}
                placeholder="(none)"
                className="min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-950 px-2 py-1 font-mono text-xs text-neutral-200 placeholder:text-neutral-700 focus:border-emerald-500/60 focus:outline-none"
              />
            </div>

            <div data-param-key="timeout" className="flex items-center gap-2">
              <label htmlFor="sr-timeout" className="flex items-center gap-1 font-mono text-[11px] text-neutral-500">
                <Timer className="size-3" /> timeout
              </label>
              <input
                id="sr-timeout"
                type="number"
                min={1}
                max={3600}
                value={timeout}
                onChange={(e) => setKey('timeout', Number(e.target.value))}
                disabled={execute.busy}
                className="w-20 rounded border border-neutral-800 bg-neutral-950 px-2 py-1 font-mono text-xs text-neutral-200 focus:border-emerald-500/60 focus:outline-none"
              />
              <span className="font-mono text-[11px] text-neutral-600">s</span>
            </div>

            {execute.busy ? (
              <button
                type="button"
                onClick={execute.cancel}
                className="inline-flex items-center gap-1.5 rounded bg-red-500/20 px-3 py-1.5 font-mono text-[11px] font-bold text-red-300 hover:bg-red-500/30"
              >
                <Square className="size-3" /> cancel
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void run()}
                disabled={!canRun}
                className="inline-flex items-center gap-1.5 rounded bg-emerald-500/20 px-3 py-1.5 font-mono text-[11px] font-bold text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-30"
              >
                <Play className="size-3" /> run
              </button>
            )}
          </div>

          {/* ── EDITOR ───────────────────────────────────────────────── */}
          <div data-param-key="code" className="flex">
            <div className="select-none border-r border-neutral-800 bg-neutral-900/40 px-2 py-3 text-right font-mono text-xs leading-[1.6] text-neutral-700">
              <div style={{ transform: `translateY(${-scrollTop}px)` }}>
                {lineNumbers.map((n) => (
                  <div key={n}>{n}</div>
                ))}
              </div>
            </div>
            <textarea
              value={code}
              onChange={(e) => setKey('code', e.target.value)}
              onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
              disabled={execute.busy}
              spellCheck={false}
              rows={16}
              placeholder={`# write your ${language} here — the editor starts empty`}
              aria-label={schema.code?.title ?? 'code'}
              className="min-h-[380px] w-full resize-y bg-neutral-950 px-3 py-3 font-mono text-xs leading-[1.6] text-neutral-100 placeholder:text-neutral-700 focus:outline-none"
            />
          </div>

          {/* ── OUTPUT ───────────────────────────────────────────────── */}
          <div className="border-t border-neutral-800">
            <div className="flex flex-wrap items-center gap-3 bg-neutral-900/60 px-4 py-2 font-mono text-[11px]">
              <span className="text-neutral-500">output</span>
              {execute.state.phase === 'executing' && (
                <span className="flex items-center gap-1.5 text-amber-300">
                  <Loader2 className="size-3 animate-spin" /> executing — {execute.state.elapsedSeconds.toFixed(1)}s measured
                </span>
              )}
              {completed && (
                <span
                  className={`inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 font-bold ${
                    exitCode === 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
                  }`}
                >
                  <CircleDot className="size-3" /> exit_code {exitCode ?? '—'}
                </span>
              )}
              {failed && (
                <span className="inline-flex items-center gap-1.5 rounded bg-red-500/20 px-1.5 py-0.5 font-bold text-red-300">
                  <CircleDot className="size-3" /> FAILED
                </span>
              )}
              {execute.state.phase === 'idle' && <span className="text-neutral-700">nothing executed yet</span>}
            </div>

            {failed && (
              <div className="border-t border-red-500/30 bg-red-950/40 px-4 py-3">
                <p className="mb-1.5 flex items-center gap-1.5 font-mono text-[11px] font-bold text-red-300">
                  <AlertTriangle className="size-3.5" /> Run failed — backend text verbatim
                </p>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-red-100">
                  {execute.state.error ?? 'The backend reported a failure with no message.'}
                </pre>
              </div>
            )}

            {completed && (
              <div className="grid gap-px bg-neutral-800 sm:grid-cols-2">
                <div className="bg-neutral-950 px-4 py-3">
                  <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-600">stdout</p>
                  <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-neutral-200">
                    {stdout ?? ''}
                  </pre>
                </div>
                <div className="bg-neutral-950 px-4 py-3">
                  <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-600">stderr</p>
                  <pre
                    className={`max-h-72 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed ${
                      stderr ? 'text-red-300' : 'text-neutral-600'
                    }`}
                  >
                    {stderr ?? ''}
                  </pre>
                </div>
              </div>
            )}
          </div>

          {result?.artifacts.length ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-neutral-800 bg-neutral-900/40 px-4 py-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-600">files written</span>
              {result.artifacts.map((file) => (
                <a
                  key={file.path}
                  href={resolveUrl(`/api/artifacts/content?path=${encodeURIComponent(file.path)}`)}
                  download={file.name}
                  className="inline-flex items-center gap-1.5 rounded border border-neutral-700 px-2 py-1 font-mono text-[11px] text-neutral-300 hover:border-emerald-500/50 hover:text-emerald-300"
                >
                  <Download className="size-3" /> {file.name}
                </a>
              ))}
            </div>
          ) : null}
        </div>

        {execute.state.phase !== 'idle' && (
          <div className="rounded-b-xl border-x border-b border-neutral-800 bg-neutral-950 p-4">
            <ToolResultPanel
              state={execute.state}
              toolId="script_runner"
              toolName={manifest.name}
              onRerun={execute.reset}
              onSendToTool={onSendToTool}
            />
          </div>
        )}
      </div>

      <p className="mt-4 flex items-center gap-1.5 font-mono text-[10px] text-brand-caramel-text">
        <FileCode2 className="size-3" /> {Object.keys(schema).length} manifest keys on this page:{' '}
        {Object.keys(schema).join(', ')}
      </p>
    </ToolPageShell>
  )
}