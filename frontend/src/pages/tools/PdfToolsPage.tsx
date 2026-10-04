import { useMemo, useState } from 'react'
import {
  AlignLeft,
  FileSearch,
  Hash,
  Info,
  Loader2,
  ScrollText,
  Table2,
} from 'lucide-react'
import { resolveUrl } from '../../lib/api'
import { useToolExecute } from '../../hooks/useToolExecute'
import DependencyGate from '../../components/deps/DependencyGate'
import { useToolDeps } from '../../hooks/useToolDeps'
import ToolPageShell from '../../components/tools/ToolPageShell'
import ToolResultPanel from '../../components/tools/ToolResultPanel'
import UniversalFileInput from '../../components/common/UniversalFileInput'
import type { ToolPageProps } from '../../lib/toolPageTypes'

interface FieldSpec {
  title?: string
  description?: string
  enum?: (string | number)[]
}

/** Highlighted purely for layout emphasis — a key is only shown if pdfinfo returned it. */
const HEADLINE_KEYS = ['pages', 'page_size', 'encrypted', 'pdf_version', 'file_size', 'size_bytes', 'filename']

function humanise(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function contentUrl(path: string): string {
  return resolveUrl(`/api/artifacts/content?path=${encodeURIComponent(path)}`)
}

/**
 * Wide technical reader. `extract_text` streams the text pdftotext really
 * produced; `inspect_info` tabulates exactly the keys the backend's pdfinfo
 * parser returned — nothing is filled in from memory of what pdfinfo usually
 * prints.
 */
export default function PdfToolsPage({
  manifest,
  initialParams,
  initialInputPath,
  onComplete,
  onSendToTool,
}: ToolPageProps) {
  const schema = manifest.parameters_schema as Record<string, FieldSpec>
  const execute = useToolExecute('pdf_tools')
  const deps = useToolDeps('pdf_tools')

  const [params, setParams] = useState<Record<string, unknown>>(() =>
    initialInputPath ? { ...initialParams, input_path: initialInputPath } : initialParams,
  )
  const [query, setQuery] = useState('')

  const inputPath = String(params.input_path ?? '')
  const action = String(params.action ?? 'extract_text')
  const setKey = (key: string, value: unknown) => setParams((prev) => ({ ...prev, [key]: value }))
  const actions = useMemo(
    () => (schema.action?.enum?.length ? schema.action.enum.map(String) : ['extract_text', 'inspect_info']),
    [schema.action?.enum],
  )

  const result = execute.state.result
  const completed = execute.state.phase === 'completed' && result?.status === 'completed'
  const extractedText = completed ? result.outputText ?? '' : null
  const characterCount = completed && result.data ? Number(result.data.character_count) : undefined
  const info = completed && result.data ? (result.data as Record<string, unknown>) : null
  const infoKeys = useMemo(() => (info ? Object.keys(info).sort() : []), [info])
  const headline = useMemo(() => infoKeys.filter((k) => HEADLINE_KEYS.includes(k)), [infoKeys])
  const remainder = useMemo(() => infoKeys.filter((k) => !HEADLINE_KEYS.includes(k)), [infoKeys])

  const needle = query.trim().toLowerCase()
  const visibleText = useMemo(() => {
    if (extractedText === null) return null
    if (!needle) return extractedText
    return extractedText
      .split('\n')
      .filter((line) => line.toLowerCase().includes(needle))
      .join('\n')
  }, [extractedText, needle])

  const matchCount = useMemo(() => {
    if (extractedText === null || !needle) return null
    return extractedText.toLowerCase().split(needle).length - 1
  }, [extractedText, needle])

  const run = async () => {
    const res = await execute.run(params)
    if (res && res.status === 'completed') onComplete?.(res, params)
  }

  const artifact = completed ? result.artifacts[0] : undefined

  const metaRow = (key: string) => (
    <div key={key} className="flex items-baseline justify-between gap-4 border-b border-brand-sage/50 py-1.5 last:border-b-0">
      <span className="font-mono text-[11px] uppercase tracking-wider text-brand-caramel-text">{humanise(key)}</span>
      <span className="text-right font-mono text-xs break-all text-brand-espresso">{String(info?.[key])}</span>
    </div>
  )

  return (
    <ToolPageShell
      manifest={manifest}
      gate={<DependencyGate toolId="pdf_tools" state={deps} />}
      headerActions={
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-brand-espresso px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-brand-cream-light">
          <ScrollText className="size-3" /> reader
        </span>
      }
    >
      <div className="space-y-4">
        <div data-param-key="input_path" className="rounded-2xl border border-brand-sage bg-surface-white p-4">
          <span className="mb-2 flex items-center gap-2 text-xs font-bold text-brand-espresso">
            <AlignLeft className="size-3.5 text-brand-caramel" />
            {schema.input_path?.title ?? 'input_path'}
          </span>
          <p className="mb-2 text-xs text-brand-caramel-text">{schema.input_path?.description}</p>
          <UniversalFileInput
            value={inputPath}
            onChange={(p) => setKey('input_path', p)}
            placeholder="Select a PDF from workspaces, downloads or uploads"
            accept=".pdf"
            filterExtensions={['pdf']}
          />
        </div>

        <div data-param-key="action" className="flex flex-wrap items-center gap-3 rounded-2xl border border-brand-sage bg-brand-cream-dark/40 p-3.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-brand-caramel-text">
            {schema.action?.title ?? 'action'}
          </span>
          <div className="flex gap-1.5">
            {actions.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={action === option}
                onClick={() => setKey('action', option)}
                className={`rounded-lg border px-3.5 py-1.5 font-mono text-xs font-bold uppercase tracking-wider transition-colors ${
                  action === option
                    ? 'border-brand-espresso bg-brand-espresso text-brand-cream-light'
                    : 'border-brand-sage bg-surface-white text-brand-espresso hover:border-brand-caramel'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void run()}
            disabled={execute.busy || !deps.ready}
            className="ml-auto inline-flex items-center gap-2 rounded-xl bg-brand-caramel px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-brand-cream-light disabled:opacity-50"
          >
            {execute.busy ? <Loader2 className="size-3.5 animate-spin" /> : <FileSearch className="size-3.5" />}
            {execute.busy ? `${execute.state.elapsedSeconds.toFixed(1)}s measured` : 'Run'}
          </button>
        </div>

        {execute.state.error && (
          <div role="alert" className="rounded-2xl border-2 border-accent-contrast/50 bg-accent-contrast/10 p-4">
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-accent-contrast">The backend reported — verbatim</p>
            <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-brand-espresso">{execute.state.error}</pre>
          </div>
        )}

        {action === 'extract_text' && (
          <section className="space-y-3">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.2em] text-brand-espresso">
                <AlignLeft className="size-4 text-brand-caramel" /> Extracted text
              </h2>
              <div className="flex flex-wrap items-center gap-3">
                {completed && (
                  <span className="font-mono text-[11px] text-brand-caramel-text">
                    <Hash className="mr-1 inline size-3" />
                    character_count = {characterCount ?? 'not reported'}
                  </span>
                )}
                {artifact && (
                  <a
                    href={contentUrl(artifact.path)}
                    download={artifact.name}
                    className="rounded-lg border border-brand-sage bg-surface-white px-2.5 py-1 font-mono text-[11px] text-brand-espresso"
                  >
                    download {artifact.name}
                  </a>
                )}
              </div>
            </header>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the extracted text…"
              aria-label="Search extracted text"
              className="w-full rounded-xl border border-brand-sage bg-surface-white px-3 py-2 font-mono text-xs text-brand-espresso focus:border-brand-caramel focus:outline-none"
            />
            <div className="min-h-[20rem] rounded-2xl border border-brand-sage bg-brand-cream-light p-4">
              {visibleText === null ? (
                <p className="font-mono text-xs text-brand-caramel-text">
                  {execute.busy
                    ? `pdftotext is running… ${execute.state.elapsedSeconds.toFixed(1)}s measured so far.`
                    : execute.state.phase === 'failed'
                      ? 'No text to show — see the backend message above.'
                      : 'Run extract_text to fill this reader.'}
                </p>
              ) : visibleText.length === 0 ? (
                <p className="font-mono text-xs text-brand-caramel-text">
                  {needle
                    ? `No line in the extracted text contains "${query}".`
                    : 'pdftotext returned an empty document — this PDF has no extractable text layer.'}
                </p>
              ) : (
                <>
                  {needle && (
                    <p className="mb-2 font-mono text-[11px] text-brand-caramel-text">
                      {matchCount} matching {matchCount === 1 ? 'occurrence' : 'occurrences'} of "{query}" across the whole document
                    </p>
                  )}
                  <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-brand-espresso">{visibleText}</pre>
                </>
              )}
            </div>
          </section>
        )}

        {action === 'inspect_info' && (
          <section className="space-y-3">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.2em] text-brand-espresso">
                <Info className="size-4 text-brand-caramel" /> pdfinfo payload
              </h2>
              {completed && (
                <span className="font-mono text-[11px] text-brand-caramel-text">
                  {infoKeys.length} keys returned by the backend parser
                </span>
              )}
            </header>
            {completed && infoKeys.length === 0 ? (
              <p className="rounded-2xl border border-brand-sage bg-brand-cream-light p-4 font-mono text-xs text-brand-caramel-text">
                pdfinfo reported no <code>key: value</code> lines for this file, so there is nothing to tabulate.
              </p>
            ) : (
              <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
                <div className="rounded-2xl border border-brand-espresso bg-brand-espresso p-4">
                  <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-brand-cream-dark/60">Headline fields</p>
                  {headline.length === 0 ? (
                    <p className="font-mono text-xs text-brand-cream-dark/60">
                      None of the headline keys were present in this payload.
                    </p>
                  ) : (
                    headline.map((key) => (
                      <div key={key} className="flex items-baseline justify-between gap-4 border-b border-brand-cream-dark/10 py-1.5 last:border-b-0">
                        <span className="font-mono text-[11px] uppercase tracking-wider text-brand-cream-dark/60">{humanise(key)}</span>
                        <span className="text-right font-mono text-sm font-bold break-all text-brand-cream-light">{String(info?.[key])}</span>
                      </div>
                    ))
                  )}
                  {artifact && (
                    <a
                      href={contentUrl(artifact.path)}
                      download={artifact.name}
                      className="mt-3 inline-block rounded-lg border border-brand-cream-dark/25 px-2.5 py-1 font-mono text-[11px] text-brand-cream-dark/85"
                    >
                      download {artifact.name}
                    </a>
                  )}
                </div>
                <div className="rounded-2xl border border-brand-sage bg-surface-white p-4">
                  <p className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-brand-caramel-text">
                    <Table2 className="size-3" /> Every returned key
                  </p>
                  {completed ? remainder.map(metaRow) : (
                    <p className="font-mono text-xs text-brand-caramel-text">
                      {execute.busy ? 'Reading the document…' : 'Run inspect_info to see the real pdfinfo table.'}
                    </p>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {execute.state.phase !== 'idle' && (
          <ToolResultPanel
            state={execute.state}
            toolId="pdf_tools"
            toolName={manifest.name}
            onRerun={execute.reset}
            onSendToTool={onSendToTool}
          />
        )}
      </div>
    </ToolPageShell>
  )
}
