import { useMemo, useState } from 'react'
import {
  Crosshair,
  Eye,
  FileWarning,
  Loader2,
  MapPin,
  Play,
  ScanSearch,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import { resolveUrl } from '../../lib/api'
import { useToolExecute } from '../../hooks/useToolExecute'
import DependencyGate from '../../components/deps/DependencyGate'
import { useToolDeps } from '../../hooks/useToolDeps'
import ToolPageShell from '../../components/tools/ToolPageShell'
import ToolResultPanel from '../../components/tools/ToolResultPanel'
import UniversalFileInput from '../../components/common/UniversalFileInput'
import type { ToolPageProps, UseToolExecute } from '../../lib/toolPageTypes'

interface FieldSpec {
  title?: string
  description?: string
  enum?: (string | number)[]
}

type Action = 'inspect' | 'scrub'
type DiffState = 'unchanged' | 'changed' | 'removed' | 'added'
type Privacy = 'gps' | 'camera' | 'personal' | 'time' | 'device' | 'plain'

interface Capture {
  label: string
  path: string
  fields: Record<string, string>
}

const PRIVACY_RULES: { kind: Privacy; label: string; match: RegExp }[] = [
  { kind: 'gps', label: 'Location', match: /^gps|geotag|latitud|longitud|altitude|location/i },
  { kind: 'camera', label: 'Camera', match: /make|model|lens|serial|firmware|ownername|body/i },
  { kind: 'personal', label: 'Personal', match: /artist|author|owner|copyright|creator|credit|username|person|subject|title|comment/i },
  { kind: 'time', label: 'Timestamp', match: /date|time|created|modified|datetime/i },
  { kind: 'device', label: 'Device', match: /software|hostcomputer|device|encoding|engine|os\b/i },
]

const PRIVACY_TONE: Record<Privacy, string> = {
  gps: 'border-accent-contrast/60 bg-accent-contrast/15 text-accent-contrast',
  camera: 'border-brand-caramel/50 bg-brand-caramel-muted text-brand-caramel-text',
  personal: 'border-brand-caramel/40 bg-brand-sage/30 text-brand-espresso',
  time: 'border-brand-sage bg-brand-cream-dark text-brand-caramel-text',
  device: 'border-brand-sage bg-brand-cream-dark text-brand-caramel-text',
  plain: 'border-brand-sage bg-brand-cream-dark/50 text-brand-caramel-text',
}

const DIFF_TONE: Record<DiffState, string> = {
  unchanged: 'text-brand-caramel-text',
  changed: 'font-bold text-accent-contrast',
  removed: 'font-bold text-accent-contrast line-through',
  added: 'font-bold text-success',
}

function classify(key: string): { kind: Privacy; label: string } {
  for (const rule of PRIVACY_RULES) if (rule.match.test(key)) return { kind: rule.kind, label: rule.label }
  return { kind: 'plain', label: 'Other' }
}

function flatten(data: unknown): Record<string, string> {
  if (!data || typeof data !== 'object') return {}
  return Object.fromEntries(
    Object.entries(data as Record<string, unknown>).map(([k, v]) => [k, v === null ? '' : String(v)]),
  )
}

/**
 * EXIF privacy console. `inspect` renders the metadata exiftool really returned;
 * the scrub diff is computed only from two completed inspect payloads — a field
 * is never called "removed" without a real second read of the cleaned file.
 */
export default function ExifScrubberPage({
  manifest,
  initialParams,
  initialInputPath,
  onComplete,
  onSendToTool,
}: ToolPageProps) {
  const schema = manifest.parameters_schema as Record<string, FieldSpec>
  const action = useToolExecute('exif_scrubber')
  const deps = useToolDeps('exif_scrubber')
  const verify = useToolExecute('exif_scrubber')

  const [params, setParams] = useState<Record<string, unknown>>(() =>
    initialInputPath ? { ...initialParams, input_path: initialInputPath } : initialParams,
  )
  const [mode, setMode] = useState<Action>(() => (String(params.action) === 'inspect' ? 'inspect' : 'scrub'))
  const [before, setBefore] = useState<Capture | null>(null)
  const [after, setAfter] = useState<Capture | null>(null)
  const [scrubbed, setScrubbed] = useState<Capture | null>(null)
  const [filter, setFilter] = useState('')
  const [flaggedOnly, setFlaggedOnly] = useState(false)

  const inputPath = String(params.input_path ?? '')
  const setKey = (key: string, value: unknown) => setParams((prev) => ({ ...prev, [key]: value }))
  const options = useMemo(
    () => (schema.action?.enum?.length ? schema.action.enum.map(String) : ['scrub', 'inspect']),
    [schema.action?.enum],
  )

  const inspectCapture = async (path: string, label: string, source: UseToolExecute) => {
    const result = await source.run({ input_path: path, action: 'inspect' })
    if (!result || result.status !== 'completed') return null
    return { capture: { label, path, fields: flatten(result.data) } as Capture, result }
  }

  const runInspect = async () => {
    const inspected = await inspectCapture(inputPath, 'Original', action)
    if (!inspected) return
    setBefore(inspected.capture)
    setAfter(null)
    setScrubbed(null)
    onComplete?.(inspected.result, params)
  }

  const runScrub = async () => {
    const scrubResult = await action.run({ input_path: inputPath, action: 'scrub' })
    if (!scrubResult || scrubResult.status !== 'completed') return
    const cleanPath = scrubResult.artifacts[0]?.path
    if (!cleanPath) return
    const scrubbedFields = scrubResult.data && typeof scrubResult.data === 'object' ? scrubResult.data : {}
    setScrubbed({
      label: 'Scrubbed copy',
      path: cleanPath,
      fields: {
        'scrub.clean_file': String(scrubbedFields.clean_file ?? cleanPath.split('/').pop() ?? ''),
        'scrub.size_bytes': String(scrubbedFields.size_bytes ?? ''),
      },
    })
    const first = await inspectCapture(inputPath, 'Original', action)
    setAfter(null)
    setBefore(first?.capture ?? null)

    const second = await inspectCapture(cleanPath, 'Scrubbed copy', verify)
    if (second) setAfter(second.capture)
    onComplete?.(scrubResult, params)
  }

  const rows = useMemo(() => {
    const keys = new Set([...Object.keys(before?.fields ?? {}), ...Object.keys(after?.fields ?? {})])
    const query = filter.trim().toLowerCase()
    const list = [...keys].map((key) => {
      const b = before?.fields[key]
      const a = after?.fields[key]
      const state: DiffState =
        after === null ? 'unchanged' : b === undefined ? 'added' : a === undefined ? 'removed' : a === b ? 'unchanged' : 'changed'
      const privacy = classify(key)
      return { key, b, a, state, privacy }
    })
    return list
      .filter((r) => (flaggedOnly ? r.privacy.kind !== 'plain' : true))
      .filter((r) => (query ? r.key.toLowerCase().includes(query) || String(r.b ?? '').toLowerCase().includes(query) : true))
      .sort((x, y) => x.key.localeCompare(y.key))
  }, [before, after, filter, flaggedOnly])

  const counts = useMemo(() => {
    const out = { changed: 0, removed: 0, added: 0, unchanged: 0 }
    for (const row of rows) out[row.state] += 1
    return out
  }, [rows])

  const run = () => (mode === 'inspect' ? runInspect() : runScrub())
  const busy = action.busy || verify.busy
  const phase = action.state.phase !== 'idle' ? action.state : verify.state
  const latestResult = action.state.result ?? verify.state.result
  const elapsed = action.state.phase !== 'idle' ? action.state.elapsedSeconds : verify.state.elapsedSeconds

  return (
    <ToolPageShell
      manifest={manifest}
      headerActions={
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-brand-espresso px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-brand-cream-light">
          <ShieldCheck className="size-3" /> audit console
        </span>
      }
    >
      <div className="space-y-4">
        <div data-param-key="input_path" className="rounded-2xl border border-brand-sage bg-surface-white p-4">
          <span className="mb-2 flex items-center gap-2 text-xs font-bold text-brand-espresso">
            <Crosshair className="size-3.5 text-brand-caramel" />
            {schema.input_path?.title ?? 'input_path'}
          </span>
          <p className="mb-2 text-xs text-brand-caramel-text">{schema.input_path?.description}</p>
          <UniversalFileInput
            value={inputPath}
            onChange={(p) => setKey('input_path', p)}
            placeholder="Select or drop the image / media whose metadata you want audited"
          />
        </div>

        <div data-param-key="action" className="rounded-2xl border border-brand-sage bg-brand-cream-dark/40 p-4">
          <div className="grid grid-cols-2 gap-2">
            {options.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={mode === option}
                onClick={() => { setMode(option as Action); setKey('action', option) }}
                className={`flex flex-col items-start gap-1 rounded-xl border-2 px-3 py-2.5 text-left transition-colors ${
                  mode === option
                    ? 'border-brand-espresso bg-brand-espresso text-brand-cream-light'
                    : 'border-brand-sage bg-surface-white text-brand-espresso hover:border-brand-caramel'
                }`}
              >
                <span className="font-mono text-sm font-bold uppercase tracking-wider">{option}</span>
                <span className="text-[11px] opacity-80">
                  {option === 'inspect'
                    ? 'Run exiftool -j and render the real metadata'
                    : 'exiftool -all= to a clean copy, then re-inspect it'}
                </span>
              </button>
            ))}
          </div>
          <DependencyGate toolId="exif_scrubber" state={deps} />

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void run()}
              disabled={busy || !deps.ready}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-espresso px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-brand-cream-light disabled:opacity-50"
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : mode === 'inspect' ? <ScanSearch className="size-3.5" /> : <Trash2 className="size-3.5" />}
              {busy ? `Running · ${elapsed.toFixed(1)}s measured` : `Run ${mode}`}
            </button>
            {verify.busy && <span className="font-mono text-[11px] text-brand-caramel-text">re-inspecting the cleaned file with exiftool…</span>}
          </div>
        </div>

        {phase.error && (
          <div role="alert" className="rounded-2xl border-2 border-accent-contrast/50 bg-accent-contrast/10 p-4">
            <p className="mb-1 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-accent-contrast">
              <FileWarning className="size-3.5" /> The backend reported — verbatim
            </p>
            <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-brand-espresso">{phase.error}</pre>
          </div>
        )}

        {scrubbed && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-success/40 bg-success-soft/50 p-3.5">
            <ShieldCheck className="size-4 text-success" />
            <span className="font-mono text-xs text-brand-espresso">
              exiftool wrote a clean copy: {scrubbed.path.split('/').pop()} ({scrubbed.fields['scrub.size_bytes']} bytes, from the run payload)
            </span>
            <a
              href={resolveUrl(`/api/artifacts/content?path=${encodeURIComponent(scrubbed.path)}`)}
              download={scrubbed.path.split('/').pop() ?? 'clean'}
              className="rounded-lg border border-brand-sage bg-surface-white px-2.5 py-1 font-mono text-[11px] text-brand-espresso"
            >
              download clean copy
            </a>
          </div>
        )}

        {before && (
          <section className="space-y-3">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.2em] text-brand-espresso">
                <Eye className="size-4 text-brand-caramel" /> Metadata returned by exiftool
              </h2>
              <span className="font-mono text-[11px] text-brand-caramel-text">
                {Object.keys(before.fields).length} fields · source {before.path.split('/').pop()}
              </span>
            </header>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter by tag or value…"
                aria-label="Filter metadata fields"
                className="min-w-56 flex-1 rounded-lg border border-brand-sage bg-surface-white px-3 py-1.5 font-mono text-xs text-brand-espresso focus:border-brand-caramel focus:outline-none"
              />
              <label className="inline-flex items-center gap-1.5 rounded-lg border border-brand-sage bg-brand-cream-dark/50 px-2.5 py-1.5 text-[11px] font-bold text-brand-espresso">
                <input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} className="accent-brand-caramel" />
                privacy-relevant only
              </label>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-brand-sage bg-brand-espresso">
              <table className="w-full text-left font-mono text-xs">
                <thead className="bg-brand-espresso-muted text-[10px] uppercase tracking-[0.18em] text-brand-cream-dark/70">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-bold">Tag</th>
                    <th scope="col" className="px-3 py-2 font-bold">Value</th>
                    <th scope="col" className="px-3 py-2 font-bold">Class</th>
                    {after && <th scope="col" className="px-3 py-2 font-bold">After scrub</th>}
                    <th scope="col" className="px-3 py-2 font-bold">Delta</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.key} className="border-t border-brand-cream-dark/10 align-top">
                      <td className="px-3 py-1.5 text-brand-cream-light">{row.key}</td>
                      <td className="max-w-md break-words px-3 py-1.5 text-brand-cream-dark/85">{row.b ?? '—'}</td>
                      <td className="px-3 py-1.5">
                        <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${PRIVACY_TONE[row.privacy.kind]}`}>
                          {row.privacy.kind === 'gps' && <MapPin className="size-2.5" />}
                          {row.privacy.label}
                        </span>
                      </td>
                      {after && <td className="max-w-md break-words px-3 py-1.5 text-brand-cream-dark/85">{row.a ?? '— absent —'}</td>}
                      <td className={`px-3 py-1.5 ${after ? DIFF_TONE[row.state] : 'text-brand-cream-dark/50'}`}>
                        {after ? row.state : 'not diffed'}
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-4 text-brand-cream-dark/60">
                        {Object.keys(before.fields).length === 0
                          ? 'exiftool returned an empty JSON object — this file carries no tags it reports.'
                          : 'No field matches the current filter.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-brand-caramel-text">
              <Play className="size-3" />
              {after ? (
                <>
                  <span>Diff computed from two real inspect payloads:</span>
                  <span className="text-success">{counts.unchanged} unchanged</span>
                  <span className="text-accent-contrast">{counts.removed} removed</span>
                  <span className="text-accent-contrast">{counts.changed} changed</span>
                  <span className="text-success">{counts.added} added</span>
                </>
              ) : (
                <span>
                  Diff view is inactive: only the original inspect has completed. Run <strong>scrub</strong> to produce a clean
                  copy and re-inspect it — no field is assumed removed without that second read.
                </span>
              )}
            </div>
          </section>
        )}

        {latestResult && (
          <ToolResultPanel
            state={{ ...phase, result: latestResult }}
            toolId="exif_scrubber"
            toolName={manifest.name}
            onRerun={() => void run()}
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
