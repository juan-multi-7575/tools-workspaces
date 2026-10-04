import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Database,
  FileSearch,
  Filter,
  Loader2,
  Play,
  RotateCcw,
  ScanSearch,
} from 'lucide-react'
import ToolPageShell from '../../components/tools/ToolPageShell'
import ToolResultPanel from '../../components/tools/ToolResultPanel'
import UniversalFileInput from '../../components/common/UniversalFileInput'
import { useToolExecute } from '../../hooks/useToolExecute'
import type { ToolPageProps } from '../../lib/toolPageTypes'

/**
 * MediaInfo / ffprobe inspector.
 *
 * Visual identity: a dense technical data grid — hairline rules, monospace
 * throughout, dark slate console. Nothing is rendered unless the real payload
 * contains it: every cell below is read straight off `result.data`.
 */

type Payload = Record<string, any>

/** Streams are grouped by the codec_type the probe actually reported. */
const STREAM_TINT: Record<string, string> = {
  video: 'text-[#7cc4ff]',
  audio: 'text-[#9ae6b4]',
  subtitle: 'text-[#f7c66b]',
  data: 'text-[#d6a6ff]',
}
const STREAM_EDGE: Record<string, string> = {
  video: 'border-[#2f5d7c]',
  audio: 'border-[#2f6b47]',
  subtitle: 'border-[#7a5f24]',
  data: 'border-[#553a75]',
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function matches(term: string, key: string, value: string): boolean {
  if (!term) return true
  return key.toLowerCase().includes(term) || value.toLowerCase().includes(term)
}

/** Flattened tag maps (ffprobe's `tags` object) get their own flat rows. */
function rowsOf(record: Payload, term: string): { key: string; value: string; matched: boolean }[] {
  const rows: { key: string; value: string; matched: boolean }[] = []
  for (const [key, raw] of Object.entries(record)) {
    if (key === 'tags' && raw && typeof raw === 'object' && !Array.isArray(raw)) {
      for (const [tagKey, tagValue] of Object.entries(raw as Payload)) {
        const value = cellText(tagValue)
        rows.push({ key: `tags.${tagKey}`, value, matched: matches(term, `tags.${tagKey}`, value) })
      }
      continue
    }
    const value = cellText(raw)
    rows.push({ key, value, matched: matches(term, key, value) })
  }
  return rows
}

function FieldGrid({
  record,
  term,
  columns = 2,
}: {
  record: Payload
  term: string
  columns?: 1 | 2 | 3
}) {
  const rows = rowsOf(record, term)
  const visible = rows.filter((row) => row.matched)
  if (rows.length === 0) return null
  const columnClass = columns === 1 ? '' : columns === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3'
  return (
    <div className={`grid gap-px bg-[#232b35] ${columnClass}`}>
      {visible.map((row) => (
        <div key={row.key} className="flex flex-col gap-0.5 bg-[#12161c] px-3 py-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#5f7183]">{row.key}</span>
          <span className="break-words font-mono text-xs leading-snug text-[#d7e3ee]">
            {row.value === '' ? <em className="text-[#44525f]">empty</em> : row.value}
          </span>
        </div>
      ))}
      {visible.length < rows.length && (
        <div className="bg-[#12161c] px-3 py-2 font-mono text-[10px] text-[#5f7183]">
          {rows.length - visible.length} field(s) hidden by the filter
        </div>
      )}
    </div>
  )
}

export default function MediainfoPage({
  manifest,
  initialParams,
  initialInputPath,
  onComplete,
  onSendToTool,
}: ToolPageProps) {
  const execute = useToolExecute('mediainfo')
  const schema = manifest.parameters_schema as Record<string, { title?: string; description?: string; default?: unknown }>
  const [params, setParams] = useState<Record<string, unknown>>(() =>
    initialInputPath ? { ...initialParams, input_path: initialInputPath } : initialParams,
  )
  const [term, setTerm] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const inputPath = String(params.input_path ?? '')
  const needle = term.trim().toLowerCase()

  const data = execute.state.result?.status === 'completed' ? (execute.state.result.data as Payload | null) : null
  const format = data?.format && typeof data.format === 'object' ? (data.format as Payload) : null
  const rawStreams = Array.isArray(data?.streams) ? (data!.streams as Payload[]) : []

  const groups = useMemo(() => {
    const byType = new Map<string, Payload[]>()
    for (const stream of rawStreams) {
      const type = typeof stream?.codec_type === 'string' && stream.codec_type ? stream.codec_type : 'unknown'
      const bucket = byType.get(type)
      if (bucket) bucket.push(stream)
      else byType.set(type, [stream])
    }
    return [...byType.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [rawStreams])

  // A stream survives the filter when its codec_type or any field matches.
  const streamMatches = (stream: Payload): boolean =>
    !needle ||
    String(stream.codec_type ?? 'unknown').toLowerCase().includes(needle) ||
    rowsOf(stream, needle).some((row) => row.matched)

  const visibleGroups = groups
    .map(([type, streams]) => ({ type, streams: streams.filter(streamMatches) }))
    .filter((group) => group.streams.length > 0)

  const totalStreams = rawStreams.length
  const shownStreams = visibleGroups.reduce((sum, group) => sum + group.streams.length, 0)

  const run = async () => {
    const result = await execute.run(params)
    if (result?.status === 'completed') onComplete?.(result, params)
  }

  const toggle = (key: string) => setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }))

  return (
    <ToolPageShell
      manifest={manifest}
      headerActions={
        <span className="inline-flex items-center gap-1.5 rounded-md bg-[#12161c] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.22em] text-[#7cc4ff]">
          <Database className="size-3" /> probe grid
        </span>
      }
      aside={
        <div className="sticky top-4 space-y-4 rounded-2xl border border-[#232b35] bg-[#12161c] p-4 font-mono text-[#d7e3ee]">
          <p className="text-[10px] uppercase tracking-[0.28em] text-[#5f7183]">Probe status</p>

          <dl className="space-y-1 text-xs">
            {[
              ['phase', execute.state.phase],
              ['http status', execute.state.result?.status ?? '—'],
              ['elapsed', `${execute.state.elapsedSeconds.toFixed(1)}s`],
              ['backend duration', execute.state.result?.durationSeconds == null ? '—' : `${execute.state.result.durationSeconds.toFixed(1)}s`],
              ['format keys', format ? Object.keys(format).length : 0],
              ['streams', totalStreams],
              ['streams shown', shownStreams],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-2 border-b border-[#1c242e] pb-1">
                <dt className="text-[#5f7183]">{label}</dt>
                <dd className="font-bold text-[#d7e3ee]">{value}</dd>
              </div>
            ))}
          </dl>

          <div data-param-key="input_path" className="space-y-2">
            <label htmlFor="mediainfo-path" className="block text-[10px] uppercase tracking-[0.18em] text-[#7cc4ff]">
              {schema.input_path?.title ?? 'input_path'}
            </label>
            <UniversalFileInput
              value={inputPath}
              onChange={(path) => setParams((prev) => ({ ...prev, input_path: path ?? '' }))}
              placeholder="/absolute/path/to/movie.mkv"
              accept="video/*,audio/*"
            />
            <p className="text-[10px] leading-snug text-[#5f7183]">
              {schema.input_path?.description ?? 'Path to the media file ffprobe should inspect.'} Dropping a file uploads
              it to the server first; the path sent to the backend is the one shown here.
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="mediainfo-filter" className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-[#7cc4ff]">
              <Filter className="size-3" /> field filter
            </label>
            <input
              id="mediainfo-filter"
              type="search"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="codec_name, width, r_frame_rate…"
              className="w-full rounded border border-[#2f3b47] bg-[#0c1015] px-2 py-1.5 text-xs text-[#d7e3ee] placeholder-[#44525f] focus:border-[#7cc4ff] focus:outline-none"
            />
            <p className="text-[10px] leading-snug text-[#5f7183]">
              Filters real keys and values out of the payload. It never adds a field that ffprobe did not report.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void run()}
            disabled={execute.busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#7cc4ff] px-3 py-2 text-xs font-bold uppercase tracking-wider text-[#0c1015] disabled:opacity-50"
          >
            {execute.busy ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5 fill-current" />}
            {execute.busy ? `probing · ${execute.state.elapsedSeconds.toFixed(1)}s` : 'run ffprobe'}
          </button>
          <button
            type="button"
            onClick={() => { execute.reset(); setTerm('') }}
            disabled={execute.busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#2f3b47] px-3 py-2 text-xs text-[#9fb3c4] hover:border-[#7cc4ff] hover:text-[#7cc4ff] disabled:opacity-40"
          >
            <RotateCcw className="size-3.5" /> clear grid
          </button>

          {execute.state.error && (
            <div role="alert" className="rounded-lg border border-[#7a2f2f] bg-[#2a1215] p-3">
              <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[#ff9d9d]">
                <AlertTriangle className="size-3" /> backend reported
              </p>
              <pre className="mt-1 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-[#ffd7d7]">
                {execute.state.error}
              </pre>
            </div>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {execute.state.phase === 'executing' && (
          <div className="flex items-center gap-2 rounded-xl border border-[#232b35] bg-[#12161c] px-3 py-2.5 font-mono text-xs text-[#9fb3c4]">
            <Loader2 className="size-3.5 animate-spin" /> waiting on ffprobe — {execute.state.elapsedSeconds.toFixed(1)}s
            measured so far
          </div>
        )}

        {execute.state.phase === 'idle' && (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[#2f3b47] bg-[#0c1015] px-4 py-14 text-center">
            <ScanSearch className="size-7 text-[#3d4c59]" />
            <p className="font-mono text-xs text-[#5f7183]">
              No probe has run yet. Choose a file and the real ffprobe JSON lands here, field by field.
            </p>
          </div>
        )}

        {data && !format && !rawStreams.length && (
          <p className="rounded-xl border border-[#2f3b47] bg-[#12161c] px-3 py-2.5 font-mono text-xs text-[#9fb3c4]">
            The run reported <span className="text-[#7cc4ff]">completed</span> but the payload carried neither a{' '}
            <code>format</code> block nor any <code>streams</code>, so there is nothing to lay out.
          </p>
        )}

        {/* ── FORMAT BLOCK ───────────────────────────────────────────────────── */}
        {format && (
          <section className="overflow-hidden rounded-2xl border border-[#232b35] bg-[#12161c]">
            <header className="flex items-center justify-between gap-2 border-b border-[#232b35] bg-[#0c1015] px-3.5 py-2">
              <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.24em] text-[#7cc4ff]">
                format · container level
              </h2>
              <span className="font-mono text-[10px] text-[#5f7183]">
                {Object.keys(format).length} key(s) reported
              </span>
            </header>
            <FieldGrid record={format} term={needle} columns={3} />
          </section>
        )}

        {/* ── STREAM CARDS ───────────────────────────────────────────────────── */}
        {visibleGroups.map((group) => (
          <section key={group.type} className="overflow-hidden rounded-2xl border border-[#232b35] bg-[#12161c]">
            <header className="flex items-center justify-between gap-2 border-b border-[#232b35] bg-[#0c1015] px-3.5 py-2">
              <h2 className={`font-mono text-[11px] font-bold uppercase tracking-[0.24em] ${STREAM_TINT[group.type] ?? 'text-[#9fb3c4]'}`}>
                codec_type: {group.type} · {group.streams.length} stream(s)
              </h2>
              <button
                type="button"
                onClick={() => toggle(group.type)}
                aria-expanded={!collapsed[group.type]}
                className="inline-flex items-center gap-1 rounded border border-[#2f3b47] px-1.5 py-0.5 font-mono text-[10px] text-[#9fb3c4] hover:border-[#7cc4ff]"
              >
                {collapsed[group.type] ? <ChevronDown className="size-3" /> : <ChevronUp className="size-3" />}
                {collapsed[group.type] ? 'expand' : 'collapse'}
              </button>
            </header>
            {!collapsed[group.type] &&
              group.streams.map((stream, position) => (
                <article
                  key={String(stream.index ?? position)}
                  className={`border-b border-[#1c242e] last:border-b-0 ${STREAM_EDGE[group.type] ?? ''} border-l-2 pl-0`}
                >
                  <div className="flex flex-wrap items-center gap-2 px-3.5 py-2 font-mono text-[10px] text-[#5f7183]">
                    <span className="rounded bg-[#0c1015] px-1.5 py-0.5 text-[#9fb3c4]">stream #{position}</span>
                    {typeof stream.index !== 'undefined' && (
                      <span>index {cellText(stream.index)}</span>
                    )}
                    {typeof stream.codec_name === 'string' && (
                      <span className="text-[#d7e3ee]">{stream.codec_name}</span>
                    )}
                    {typeof stream.codec_long_name === 'string' && (
                      <span className="truncate opacity-70">{stream.codec_long_name}</span>
                    )}
                  </div>
                  <FieldGrid record={stream} term={needle} columns={3} />
                </article>
              ))}
          </section>
        ))}

        {rawStreams.length > 0 && visibleGroups.length === 0 && (
          <p className="rounded-xl border border-[#2f3b47] bg-[#12161c] px-3 py-2.5 font-mono text-xs text-[#9fb3c4]">
            Every one of the {rawStreams.length} reported stream(s) is hidden by the current filter
            (<span className="text-[#7cc4ff]">{term}</span>). Clear it to see the payload again.
          </p>
        )}

        {execute.state.result?.status === 'completed' && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#232b35] bg-[#0c1015] px-3.5 py-2 font-mono text-[10px] text-[#5f7183]">
            <FileSearch className="size-3" />
            <span>raw ffprobe JSON is also available verbatim in the result panel below</span>
          </div>
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