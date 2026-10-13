import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BookOpen,
  Check,
  Copy,
  Download,
  FileText,
  Loader2,
  NotebookPen,
  Play,
  Quote,
} from 'lucide-react'
import ToolPageShell from '../../components/tools/ToolPageShell'
import ToolResultPanel from '../../components/tools/ToolResultPanel'
import UniversalFileInput from '../../components/common/UniversalFileInput'
import { api, errorMessage, resolveUrl } from '../../lib/api'
import { useToolExecute } from '../../hooks/useToolExecute'
import DependencyGate from '../../components/deps/DependencyGate'
import { useToolDeps } from '../../hooks/useToolDeps'
import type { ToolPageProps } from '../../lib/toolPageTypes'

interface FieldSpec {
  type?: string
  title?: string
  description?: string
  enum?: (string | number)[]
  placeholder?: string
}

const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii', 'xiii', 'xiv', 'xv', 'xvi', 'xvii', 'xviii', 'xix', 'xx']

/**
 * Summarizer — an editorial reading view. The source document sits in a
 * measure-constrained serif column on the left; the *real* `data.takeaways`
 * the backend returned are set as a numbered marginal column on the right.
 * Nothing is rendered as a takeaway unless the backend actually sent it.
 */
export default function SummarizerPage({
  manifest,
  initialParams,
  initialInputPath,
  onComplete,
  onSendToTool,
}: ToolPageProps) {
  const schema = (manifest.parameters_schema ?? {}) as Record<string, FieldSpec>
  const execute = useToolExecute('summarizer')
  const deps = useToolDeps('summarizer')
  const [params, setParams] = useState<Record<string, unknown>>(() =>
    initialInputPath ? { ...initialParams, input_path: initialInputPath } : initialParams,
  )
  const [fileBody, setFileBody] = useState<{ path: string; content: string | null; error: string | null } | null>(null)
  const [copied, setCopied] = useState(false)

  const setKey = (key: string, value: unknown) => setParams((prev) => ({ ...prev, [key]: value }))

  const typedText = typeof params.text === 'string' ? params.text : ''
  const inputPath = typeof params.input_path === 'string' ? params.input_path : ''
  const maxBullets = Number(params.max_bullets ?? 5)
  const format = String(params.format ?? 'markdown')
  const formatOptions = (schema.format?.enum ?? ['markdown', 'plain']).map(String)

  const completed = execute.state.result?.status === 'completed'
  const data = execute.state.result?.data ?? null

  // `takeaways` is read only from a verified completed response.
  const takeaways: string[] = useMemo(() => {
    if (!completed) return []
    const raw = data?.takeaways
    return Array.isArray(raw) ? raw.map((entry) => String(entry)) : []
  }, [completed, data])

  const bulletCount = completed && data && typeof data.bullet_count === 'number' ? data.bullet_count : null
  const summaryTitle = completed && data && typeof data.title === 'string' ? data.title : null
  const artifact = execute.state.result?.artifacts[0]

  // The reading source: the literal text that was submitted, or the real file body.
  const filePath = fileBody?.path ?? ''
  useEffect(() => {
    if (!filePath) {
      setFileBody(null)
      return
    }
    let active = true
    setFileBody({ path: filePath, content: null, error: null })
    api
      .getArtifactContent(filePath)
      .then((res) => {
        if (active) setFileBody({ path: filePath, content: res.content, error: null })
      })
      .catch((err) => {
        if (active) setFileBody({ path: filePath, content: null, error: errorMessage(err) || String(err) })
      })
    return () => {
      active = false
    }
  }, [filePath])

  const sourceOrigin: 'typed' | 'file' | 'none' = typedText.trim()
    ? 'typed'
    : fileBody?.content != null
      ? 'file'
      : 'none'

  const canRun = typedText.trim().length > 0 || inputPath.trim().length > 0

  const run = async () => {
    const result = await execute.run(params)
    if (result?.status === 'completed') onComplete?.(result, params)
  }

  return (
    <ToolPageShell
      manifest={manifest}
      gate={<DependencyGate toolId="summarizer" state={deps} />}
      headerActions={
        <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-sage bg-brand-cream-dark px-3 py-1 font-mono text-[12px] uppercase tracking-[0.24em] text-brand-caramel-text">
          <BookOpen className="size-3" /> reading view
        </span>
      }
      aside={
        <div className="space-y-4 rounded-2xl border border-brand-sage bg-brand-cream-dark/50 p-4">
          <div data-param-key="input_path" className="space-y-1.5">
            <label htmlFor="sum-file" className="block text-xs font-bold text-brand-espresso">
              {schema.input_path?.title ?? 'input_path'}
            </label>
            <UniversalFileInput
              value={inputPath}
              onChange={(path) => setKey('input_path', path ?? '')}
              placeholder="/path/to/document.txt"
              accept=".txt,.md,.srt,.vtt"
            />
            <p className="text-[12px] leading-snug text-brand-caramel-text">
              {schema.input_path?.description ?? 'Path to document file to summarize.'}
            </p>
          </div>

          <div data-param-key="max_bullets" className="space-y-1.5">
            <label htmlFor="sum-bullets" className="flex items-baseline justify-between text-xs font-bold text-brand-espresso">
              <span>{schema.max_bullets?.title ?? 'max_bullets'}</span>
              <span className="font-mono text-brand-caramel">{Number.isFinite(maxBullets) ? maxBullets : 5}</span>
            </label>
            <input
              id="sum-bullets"
              type="range"
              min={1}
              max={20}
              step={1}
              value={Number.isFinite(maxBullets) ? maxBullets : 5}
              onChange={(e) => setKey('max_bullets', Number(e.target.value))}
              disabled={execute.busy}
              className="w-full accent-brand-caramel"
            />
            <p className="text-[12px] leading-snug text-brand-caramel-text">
              {schema.max_bullets?.description ?? 'Number of key takeaway bullet points to extract.'}
            </p>
          </div>

          <div data-param-key="format" className="space-y-1.5">
            <span className="block text-xs font-bold text-brand-espresso">
              {schema.format?.title ?? 'format'}
            </span>
            <div className="flex overflow-hidden rounded-xl border border-brand-sage">
              {formatOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setKey('format', option)}
                  disabled={execute.busy}
                  aria-pressed={format === option}
                  className={`flex-1 px-2 py-1.5 font-mono text-xs transition-colors ${
                    format === option
                      ? 'bg-brand-espresso text-brand-cream-light'
                      : 'bg-surface-white text-brand-caramel-text hover:bg-brand-cream-dark'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => void run()}
            disabled={execute.busy || !canRun || !deps.ready}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-espresso px-3 py-2.5 text-xs font-bold text-brand-cream-light transition-colors hover:bg-brand-caramel disabled:opacity-40"
          >
            {execute.busy ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
            {execute.busy ? `Reading · ${execute.state.elapsedSeconds.toFixed(1)}s` : 'Read & summarise'}
          </button>

          <dl className="space-y-1 border-t border-brand-sage pt-2 font-mono text-[12px] text-brand-caramel-text">
            <div className="flex justify-between">
              <dt>phase</dt>
              <dd className="font-bold text-brand-espresso">{execute.state.phase}</dd>
            </div>
            <div className="flex justify-between">
              <dt>wall clock</dt>
              <dd className="font-bold text-brand-espresso">{execute.state.elapsedSeconds.toFixed(1)}s</dd>
            </div>
          </dl>
        </div>
      }
    >
      <div className="space-y-4">
        {execute.state.error && (
          <div role="alert" className="rounded-2xl border border-accent-contrast/50 bg-accent-contrast/10 p-4">
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-accent-contrast">
              <AlertTriangle className="size-3.5" /> The backend reported:
            </p>
            <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-brand-espresso">
              {execute.state.error}
            </pre>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          {/* ── EDITORIAL SOURCE COLUMN ─────────────────────────────────── */}
          <article className="rounded-2xl border border-brand-sage bg-surface-white p-6">
            <header className="mb-4 flex items-baseline justify-between gap-3 border-b border-brand-sage pb-3">
              <h2 className="flex items-center gap-2 font-serif text-lg font-semibold tracking-tight text-brand-espresso">
                <Quote className="size-4 text-brand-caramel" />
                {schema.text?.title ?? 'text'}
              </h2>
              <span className="font-mono text-[12px] uppercase tracking-[0.2em] text-brand-caramel-text">
                {sourceOrigin === 'typed' ? 'from your text' : sourceOrigin === 'file' ? 'from file' : 'no source yet'}
              </span>
            </header>

            <div data-param-key="text" className="space-y-1.5">
              <label htmlFor="sum-text" className="sr-only">
                {schema.text?.title ?? 'text'}
              </label>
              <textarea
                id="sum-text"
                value={typedText}
                onChange={(e) => setKey('text', e.target.value)}
                disabled={execute.busy}
                rows={14}
                placeholder={schema.text?.placeholder ?? 'Paste transcript, lecture notes, or document excerpt here...'}
                className="w-full resize-y rounded-xl border border-brand-sage bg-brand-cream/40 px-4 py-3 font-serif text-[15px] leading-[1.75] text-brand-espresso placeholder:text-placeholder focus:border-brand-caramel focus:outline-none"
              />
              <p className="font-mono text-[12px] text-brand-caramel-text">
                {typedText.length} chars · {typedText.trim() ? typedText.trim().split(/\s+/).length : 0} words
              </p>
              <p className="text-[12px] leading-snug text-brand-caramel-text">
                {schema.text?.description ?? 'Enter or paste raw text/transcript to summarize.'}
              </p>
            </div>

            {fileBody && (
              <div className="mt-4 rounded-xl border border-brand-sage bg-brand-cream-dark/40 p-3">
                <p className="flex items-center gap-1.5 font-mono text-[12px] uppercase tracking-[0.18em] text-brand-caramel-text">
                  <FileText className="size-3" /> {fileBody.path}
                </p>
                {fileBody.error && (
                  <p className="mt-1 font-mono text-[12px] leading-snug text-accent-contrast">
                    The file could not be read for preview: {fileBody.error}
                  </p>
                )}
              </div>
            )}

            {sourceOrigin === 'file' && (
              <section className="mt-4 max-h-72 overflow-y-auto border-t border-brand-sage pt-4">
                <h3 className="mb-2 font-mono text-[12px] uppercase tracking-[0.18em] text-brand-caramel-text">
                  Source read from disk
                </h3>
                <pre className="whitespace-pre-wrap font-serif text-sm leading-[1.7] text-brand-espresso">
                  {fileBody?.content}
                </pre>
              </section>
            )}
          </article>

          {/* ── NUMBERED TAKEAWAY MARGIN ────────────────────────────────── */}
          <aside className="space-y-4 rounded-2xl border border-brand-sage bg-brand-cream-dark/40 p-6">
            <header className="flex items-baseline justify-between gap-3 border-b border-brand-sage pb-3">
              <h2 className="flex items-center gap-2 font-serif text-lg font-semibold tracking-tight text-brand-espresso">
                <NotebookPen className="size-4 text-brand-caramel" />
                {summaryTitle ?? 'Key takeaways'}
              </h2>
              {bulletCount !== null && (
                <span className="rounded-full bg-brand-espresso px-2.5 py-0.5 font-mono text-[12px] font-bold text-brand-cream-light">
                  {bulletCount} bullet{bulletCount === 1 ? '' : 's'}
                </span>
              )}
            </header>

            {execute.state.phase === 'executing' && (
              <p className="flex items-center gap-2 font-mono text-xs text-brand-caramel-text">
                <Loader2 className="size-3.5 animate-spin" /> Backend is summarising — {execute.state.elapsedSeconds.toFixed(1)}s measured
              </p>
            )}

            {execute.state.phase === 'idle' && (
              <p className="font-serif text-sm leading-relaxed text-brand-caramel-text">
                Paste a document or point at a file, then read it. The bullets appear here only after the backend
                returns <code className="font-mono text-xs">data.takeaways</code>.
              </p>
            )}

            {completed && takeaways.length > 0 && (
              <ol className="space-y-4">
                {takeaways.map((line, index) => (
                  <li key={index} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
                    <span
                      aria-hidden
                      className="font-serif text-2xl leading-none text-brand-caramel/70"
                    >
                      {ROMAN[index] ?? index + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="sr-only">Takeaway {index + 1}: </span>
                      <span className="block font-serif text-[15px] leading-[1.7] break-words text-brand-espresso">
                        {line}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            )}

            {completed && takeaways.length === 0 && (
              <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 font-mono text-xs leading-relaxed text-amber-900">
                The run returned status <span className="font-bold">completed</span> but the response carried no
                takeaway list, so there is nothing to set in the margin.
              </p>
            )}

            {execute.state.result?.status === 'failed' && !execute.state.error && (
              <p className="rounded-xl border border-red-300 bg-red-50 p-3 font-mono text-xs text-red-900">
                The tool failed without returning a message.
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2 border-t border-brand-sage pt-4">
              {artifact && (
                <a
                  href={resolveUrl(`/api/artifacts/content?path=${encodeURIComponent(artifact.path)}`)}
                  download={artifact.name}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-brand-sage bg-surface-white px-2.5 py-1.5 font-mono text-[12px] text-brand-espresso hover:border-brand-caramel"
                >
                  <Download className="size-3" /> {artifact.name}
                </a>
              )}
              <button
                type="button"
                onClick={() => {
                  if (!takeaways.length) return
                  void navigator.clipboard?.writeText(takeaways.join('\n'))
                  setCopied(true)
                }}
                disabled={takeaways.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg border border-brand-sage bg-surface-white px-2.5 py-1.5 font-mono text-[12px] text-brand-espresso hover:border-brand-caramel disabled:opacity-40"
              >
                {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                {copied ? 'Copied' : 'Copy bullets'}
              </button>
            </div>
          </aside>
        </div>

        {execute.state.phase !== 'idle' && (
          <ToolResultPanel
            state={execute.state}
            toolId="summarizer"
            toolName={manifest.name}
            onRerun={execute.reset}
            onSendToTool={onSendToTool}
          />
        )}
      </div>
    </ToolPageShell>
  )
}