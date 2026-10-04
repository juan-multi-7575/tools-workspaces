import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Captions,
  CheckCircle2,
  Clock3,
  Copy,
  Download,
  Equal,
  Languages,
  Loader2,
  Play,
  SplitSquareHorizontal,
} from 'lucide-react'
import ToolPageShell from '../../components/tools/ToolPageShell'
import ToolResultPanel from '../../components/tools/ToolResultPanel'
import { ToolForm } from '../../lib/toolForms'
import { api, errorMessage, resolveUrl } from '../../lib/api'
import { useToolExecute } from '../../hooks/useToolExecute'
import type { ToolPageProps } from '../../lib/toolPageTypes'

interface FieldSpec {
  type?: string
  title?: string
  description?: string
  enum?: (string | number)[]
  default?: unknown
}

/** `TranslatorForm` already binds every key this tool's manifest declares. */
const TRANSLATOR_FORM_KEYS = new Set([
  'input_path',
  'target_lang',
  'source_lang',
  'provider',
  'model',
  'batch_size',
])

interface Cue {
  index: number
  timing: string
  text: string
}

interface CueRow {
  key: string
  index: string
  start: number | null
  end: number | null
  timing: string
  original: string | null
  translated: string | null
  changed: boolean | null
}

function timecodeToSeconds(value: string): number | null {
  const match = value.trim().match(/^(\d+):(\d{1,2}):(\d{1,2})[.,](\d{1,3})$/)
  if (!match) return null
  const [, h, m, s, ms] = match
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms.padEnd(3, '0')) / 1000
}

function parseCues(content: string): Cue[] {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  if (!normalized) return []
  const cues: Cue[] = []

  for (const block of normalized.split(/\n\s*\n/)) {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean)
    if (lines.length < 2) continue

    let indexText = ''
    let timing = ''
    let body: string[] = []

    if (/^\d+$/.test(lines[0])) {
      indexText = lines[0]
      timing = lines[1]
      body = lines.slice(2)
    } else if (lines[0].includes('-->')) {
      timing = lines[0]
      body = lines.slice(1)
    } else {
      continue
    }
    if (!timing.includes('-->')) continue

    cues.push({
      index: indexText ? Number(indexText) : cues.length + 1,
      timing,
      text: body.join(' '),
    })
  }
  return cues
}

/**
 * SRT / VTT translator — a synced dual-pane cue editor. Rows are emitted from a
 * single CSS grid so the original and translated panes are guaranteed to share
 * a row rhythm. Both panes are read from REAL files via
 * `api.getArtifactContent`: the submitted input on the left, the backend's
 * returned artifact on the right.
 */
export default function SrtTranslatorPage({
  manifest,
  initialParams,
  initialInputPath,
  onComplete,
  onSendToTool,
}: ToolPageProps) {
  const schema = (manifest.parameters_schema ?? {}) as Record<string, FieldSpec>
  const execute = useToolExecute('subtitle.translate.srt')
  const [params, setParams] = useState<Record<string, unknown>>(() =>
    initialInputPath ? { ...initialParams, input_path: initialInputPath } : initialParams,
  )

  // Any manifest key the shared translator form does not bind falls back to the
  // generic schema renderer, so no declared key can go missing.
  const unhandledSchema = useMemo(() => {
    const rest: Record<string, unknown> = {}
    for (const [key, spec] of Object.entries(schema)) {
      if (!TRANSLATOR_FORM_KEYS.has(key)) rest[key] = spec
    }
    return rest
  }, [schema])

  const [original, setOriginal] = useState<{ path: string; content: string | null; error: string | null } | null>(null)
  const [translated, setTranslated] = useState<{ path: string; content: string | null; error: string | null } | null>(null)
  const [copied, setCopied] = useState(false)
  const [onlyChanged, setOnlyChanged] = useState(false)

  const inputPath = String(params.input_path ?? '')
  const targetLang = String(params.target_lang ?? 'English')
  const result = execute.state.result
  const completed = result?.status === 'completed'
  const artifact = result?.artifacts[0] ?? null

  useEffect(() => {
    if (!inputPath) {
      setOriginal(null)
      return
    }
    let active = true
    setOriginal({ path: inputPath, content: null, error: null })
    api
      .getArtifactContent(inputPath)
      .then((res) => {
        if (active) setOriginal({ path: inputPath, content: res.content, error: null })
      })
      .catch((err) => {
        if (active) setOriginal({ path: inputPath, content: null, error: errorMessage(err) || String(err) })
      })
    return () => {
      active = false
    }
  }, [inputPath])

  useEffect(() => {
    if (!completed || !artifact) {
      if (!artifact) setTranslated(null)
      return
    }
    let active = true
    setTranslated({ path: artifact.path, content: null, error: null })
    api
      .getArtifactContent(artifact.path)
      .then((res) => {
        if (active) setTranslated({ path: artifact.path, content: res.content, error: null })
      })
      .catch((err) => {
        if (active) setTranslated({ path: artifact.path, content: null, error: errorMessage(err) || String(err) })
      })
    return () => {
      active = false
    }
  }, [completed, artifact])

  const rows = useMemo<CueRow[]>(() => {
    if (!completed || original?.content == null || translated?.content == null) return []
    const left = parseCues(original.content)
    const right = parseCues(translated.content)
    const byIndex = new Map(right.map((cue) => [cue.index, cue]))
    return left.map((cue, position) => {
      const match = byIndex.get(cue.index)
      return {
        key: `cue-${cue.index}-${position}`,
        index: String(cue.index),
        start: timecodeToSeconds(cue.timing.split('-->')[0] ?? ''),
        end: timecodeToSeconds(cue.timing.split('-->')[1] ?? ''),
        timing: cue.timing,
        original: cue.text,
        translated: match ? match.text : null,
        // "changed" is only ever true when both real strings exist and differ.
        changed: match ? match.text !== cue.text : null,
      }
    })
  }, [completed, original, translated])

  const visibleRows = onlyChanged ? rows.filter((row) => row.changed) : rows
  const changedCount = rows.filter((row) => row.changed === true).length

  const timeline = useMemo(() => {
    const spans = rows
      .map((row) => ({ row, start: row.start, end: row.end }))
      .filter((entry): entry is { row: CueRow; start: number; end: number } => entry.start !== null && entry.end !== null)
    const span = spans.length ? Math.max(...spans.map((entry) => entry.end)) : 0
    return { spans, span }
  }, [rows])

  const canRun = inputPath.trim().length > 0

  const run = async () => {
    const res = await execute.run(params)
    if (res?.status === 'completed') onComplete?.(res, params)
  }

  return (
    <ToolPageShell
      manifest={manifest}
      headerActions={
        <span className="inline-flex items-center gap-1.5 rounded-md bg-brand-espresso px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-brand-cream-light">
          <SplitSquareHorizontal className="size-3" /> dual-pane cues
        </span>
      }
      aside={
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => void run()}
            disabled={execute.busy || !canRun}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-espresso px-3 py-2.5 text-xs font-bold text-brand-cream-light transition-colors hover:bg-brand-caramel disabled:opacity-40"
          >
            {execute.busy ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
            {execute.busy ? `Translating · ${execute.state.elapsedSeconds.toFixed(1)}s` : `Translate cues → ${targetLang}`}
          </button>

          <dl className="space-y-1 border-t border-brand-sage pt-3 font-mono text-[11px] text-brand-caramel-text">
            <div className="flex justify-between">
              <dt>phase</dt>
              <dd className="font-bold text-brand-espresso">{execute.state.phase}</dd>
            </div>
            <div className="flex justify-between">
              <dt>measured</dt>
              <dd className="font-bold text-brand-espresso">{execute.state.elapsedSeconds.toFixed(1)}s</dd>
            </div>
            <div className="flex justify-between">
              <dt>cues aligned</dt>
              <dd className="font-bold text-brand-espresso">{rows.length}</dd>
            </div>
            <div className="flex justify-between">
              <dt>cues changed</dt>
              <dd className="font-bold text-brand-espresso">{completed ? changedCount : '—'}</dd>
            </div>
          </dl>

          <label className="flex items-center gap-2 border-t border-brand-sage pt-3 font-mono text-[11px] text-brand-caramel-text">
            <input
              type="checkbox"
              checked={onlyChanged}
              onChange={(e) => setOnlyChanged(e.target.checked)}
              disabled={rows.length === 0}
              className="size-3.5 accent-brand-caramel"
            />
            Show only changed cues
          </label>

          {Object.keys(unhandledSchema).length > 0 && (
            <ToolForm
              toolId="subtitle.translate.srt"
              schema={unhandledSchema}
              value={params}
              onChange={setParams}
              disabled={execute.busy}
            />
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {execute.state.error && (
          <div role="alert" className="rounded-lg border border-accent-contrast/50 bg-accent-contrast/10 p-3">
            <p className="mb-1 flex items-center gap-1.5 text-xs font-bold text-accent-contrast">
              <AlertTriangle className="size-3.5" /> The backend reported:
            </p>
            <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-brand-espresso">
              {execute.state.error}
            </pre>
          </div>
        )}

        <section className="rounded-xl border border-brand-sage bg-surface-white p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-brand-espresso">
            <Languages className="size-4 text-brand-caramel" /> Translation settings
          </h2>
          <ToolForm
            toolId="subtitle.translate.srt"
            schema={schema as Record<string, unknown>}
            value={params}
            onChange={setParams}
            disabled={execute.busy}
          />
        </section>

        {/* ── CUE TIMELINE (real timestamps only) ────────────────────────── */}
        {timeline.spans.length > 0 && (
          <section className="rounded-xl border border-brand-sage bg-brand-cream-dark/40 p-4">
            <h3 className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-brand-caramel-text">
              <Clock3 className="size-3" /> cue timeline · {timeline.span.toFixed(2)}s of real cues
            </h3>
            <div className="flex h-16 items-end gap-[2px]">
              {timeline.spans.map(({ row, start, end }) => (
                <div
                  key={row.key}
                  title={`#${row.index} ${row.timing}${row.changed === true ? ' · changed' : row.changed === false ? ' · unchanged' : ''}`}
                  className={`min-w-[3px] flex-1 rounded-t-sm ${
                    row.changed === true ? 'bg-brand-caramel' : row.changed === false ? 'bg-brand-sage' : 'bg-brand-sage-muted'
                  }`}
                  style={{ height: `${Math.max(6, ((end - start) / (timeline.span || 1)) * 100)}%` }}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── SYNCED DUAL PANE ─────────────────────────────────────────── */}
        <section className="overflow-hidden rounded-xl border border-brand-sage bg-surface-white">
          <header className="grid grid-cols-2 border-b-2 border-brand-espresso bg-brand-cream-dark">
            <div className="flex items-center gap-1.5 border-r-2 border-brand-espresso px-3 py-2">
              <Captions className="size-3.5 text-brand-caramel" />
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-brand-espresso">
                original
              </span>
              {original?.path && (
                <span className="ml-auto truncate font-mono text-[10px] text-brand-caramel-text" title={original.path}>
                  {original.path.split('/').pop()}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 px-3 py-2">
              <Languages className="size-3.5 text-brand-caramel" />
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-brand-espresso">
                {targetLang.toLowerCase()}
              </span>
              {translated?.path && (
                <span className="ml-auto truncate font-mono text-[10px] text-brand-caramel-text" title={translated.path}>
                  {translated.path.split('/').pop()}
                </span>
              )}
            </div>
          </header>

          {original?.error && (
            <p className="border-b border-brand-sage px-3 py-2 font-mono text-[11px] text-accent-contrast">
              Original could not be read: {original.error}
            </p>
          )}
          {translated?.error && (
            <p className="border-b border-brand-sage px-3 py-2 font-mono text-[11px] text-accent-contrast">
              Translated artifact could not be read: {translated.error}
            </p>
          )}

          {visibleRows.length === 0 ? (
            <p className="px-4 py-10 text-center font-mono text-xs text-brand-caramel-text">
              {execute.state.phase === 'idle'
                ? 'Select a .srt or .vtt file and run. Cue rows appear only after both real files are read.'
                : execute.state.phase === 'executing'
                  ? `Translating — ${execute.state.elapsedSeconds.toFixed(1)}s measured so far.`
                  : onlyChanged
                    ? 'No cue was changed between the two real files.'
                    : 'No comparable cue rows yet.'}
            </p>
          ) : (
            <div className="divide-y divide-brand-sage/60">
              {visibleRows.map((row) => (
                <div key={row.key} className="grid grid-cols-2">
                  <div className="border-r-2 border-brand-espresso px-3 py-2">
                    <p className="mb-1 flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-brand-caramel-text">
                      <span className="rounded bg-brand-espresso px-1.5 py-0.5 font-bold text-brand-cream-light">#{row.index}</span>
                      <span>{row.timing}</span>
                    </p>
                    <p className="text-[13px] leading-relaxed text-brand-espresso">{row.original}</p>
                  </div>
                  <div className={`px-3 py-2 ${row.changed === true ? 'bg-brand-caramel/10' : ''}`}>
                    <p className="mb-1 flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-brand-caramel-text">
                      {row.changed === null ? (
                        <span className="rounded border border-accent-contrast/50 px-1.5 py-0.5 font-bold text-accent-contrast">
                          no matching cue
                        </span>
                      ) : row.changed ? (
                        <span className="rounded bg-brand-caramel px-1.5 py-0.5 font-bold text-brand-cream-light">changed</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded border border-brand-sage px-1.5 py-0.5">
                          <Equal className="size-2.5" /> identical
                        </span>
                      )}
                    </p>
                    <p className="text-[13px] leading-relaxed text-brand-espresso">
                      {row.translated ?? <span className="font-mono text-xs text-brand-caramel-text">—</span>}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {completed && rows.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-brand-sage bg-brand-cream-dark px-2 py-1 font-mono text-[11px] text-brand-espresso">
              <CheckCircle2 className="size-3 text-brand-caramel" /> {changedCount} of {rows.length} cues differ
            </span>
            {artifact && (
              <a
                href={resolveUrl(`/api/artifacts/content?path=${encodeURIComponent(artifact.path)}`)}
                download={artifact.name}
                className="inline-flex items-center gap-1.5 rounded-md border border-brand-sage bg-surface-white px-2 py-1 font-mono text-[11px] text-brand-espresso hover:border-brand-caramel"
              >
                <Download className="size-3" /> {artifact.name}
              </a>
            )}
            <button
              type="button"
              onClick={() => {
                if (!translated?.content) return
                void navigator.clipboard?.writeText(translated.content)
                setCopied(true)
              }}
              disabled={!translated?.content}
              className="inline-flex items-center gap-1.5 rounded-md border border-brand-sage bg-surface-white px-2 py-1 font-mono text-[11px] text-brand-espresso hover:border-brand-caramel disabled:opacity-40"
            >
              <Copy className="size-3" /> {copied ? 'Copied' : 'Copy artifact'}
            </button>
          </div>
        )}

        {execute.state.phase !== 'idle' && (
          <ToolResultPanel
            state={execute.state}
            toolId="subtitle.translate.srt"
            toolName={manifest.name}
            onRerun={execute.reset}
            onSendToTool={onSendToTool}
          />
        )}
      </div>
    </ToolPageShell>
  )
}