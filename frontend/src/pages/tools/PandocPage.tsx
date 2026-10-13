import { useEffect, useMemo, useState } from 'react'
import {
  BookOpen,
  Check,
  ClipboardCopy,
  Download,
  FileCode2,
  Loader2,
  Play,
  Quote,
} from 'lucide-react'
import { api, errorMessage, resolveUrl } from '../../lib/api'
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

const FORMAT_BLURB: Record<string, string> = {
  html: 'A standalone HTML document. Rendered in a sandboxed frame — the markup you see is the byte-for-byte output.',
  markdown: 'CommonMark source. Shown in a monospace column, exactly as pandoc wrote it.',
  plain: 'Plain text without markup. Shown in a monospace column, exactly as pandoc wrote it.',
}

/** The backend streams these suffixes as JSON; anything else comes back as binary. */
const READABLE_SUFFIXES = new Set(['md', 'markdown', 'txt', 'html', 'htm', 'text'])

function isReadable(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return READABLE_SUFFIXES.has(ext)
}

function contentUrl(path: string): string {
  return resolveUrl(`/api/artifacts/content?path=${encodeURIComponent(path)}`)
}

/**
 * Editorial two-pane document view: the real source on the left, the real
 * converted artifact on the right. No preview is drawn until the run has
 * actually returned completed and the artifact has been read back from disk.
 */
export default function PandocPage({
  manifest,
  initialParams,
  initialInputPath,
  onComplete,
  onSendToTool,
}: ToolPageProps) {
  const schema = manifest.parameters_schema as Record<string, FieldSpec>
  const execute = useToolExecute('pandoc')
  const deps = useToolDeps('pandoc')

  const [params, setParams] = useState<Record<string, unknown>>(() =>
    initialInputPath ? { ...initialParams, input_path: initialInputPath } : initialParams,
  )
  const [source, setSource] = useState<string | null>(null)
  const [sourceNote, setSourceNote] = useState<string | null>(null)
  const [produced, setProduced] = useState<string | null>(null)
  const [producedName, setProducedName] = useState('')
  const [producedPath, setProducedPath] = useState('')
  const [producedSize, setProducedSize] = useState<number | undefined>(undefined)
  const [reading, setReading] = useState(false)
  const [copied, setCopied] = useState(false)

  const inputPath = String(params.input_path ?? '')
  const target = String(params.to ?? 'html')
  const setKey = (key: string, value: unknown) => setParams((prev) => ({ ...prev, [key]: value }))
  const targets = useMemo(
    () => (schema.to?.enum?.length ? schema.to.enum.map(String) : ['html', 'markdown', 'plain']),
    [schema.to?.enum],
  )

  const readSource = async (path: string) => {
    if (!path) { setSource(null); setSourceNote('Pick a document to read its real contents.'); return }
    if (!isReadable(path)) {
      setSource(null)
      setSourceNote(
        `The artifact content endpoint streams ${path.split('.').pop() ?? 'this file'} as binary, so its text cannot be read here. The conversion still runs on the server.`,
      )
      return
    }
    setReading(true)
    try {
      const res = await api.getArtifactContent(path)
      setSource(res.content)
      setSourceNote(`${res.name} · ${res.size} bytes read from the backend`)
    } catch (err) {
      setSource(null)
      setSourceNote(`Could not read the source: ${errorMessage(err)}`)
    } finally {
      setReading(false)
    }
  }

  useEffect(() => { void readSource(inputPath) }, [inputPath])

  const readArtifact = async (path: string, name: string) => {
    setProducedPath(path)
    setReading(true)
    try {
      const res = await api.getArtifactContent(path)
      setProduced(res.content)
      setProducedName(res.name || name)
      setProducedSize(res.size)
    } catch (err) {
      setProduced(null)
      setProducedName(name)
      setProducedSize(undefined)
      setSourceNote(`Could not read the converted artifact: ${errorMessage(err)}`)
    } finally {
      setReading(false)
    }
  }

  useEffect(() => {
    if (execute.state.phase !== 'completed') return
    const artifact = execute.state.result?.artifacts[0]
    if (artifact) void readArtifact(artifact.path, artifact.name)
    else { setProduced(null); setProducedPath('') }
  }, [execute.state.phase, execute.state.result])

  const run = async () => {
    setCopied(false)
    const result = await execute.run(params)
    if (result && result.status === 'completed') onComplete?.(result, params)
  }

  const copy = async () => {
    if (!produced) return
    try {
      await navigator.clipboard.writeText(produced)
      setCopied(true)
    } catch {
      setCopied(false)
      setSourceNote('The browser refused clipboard access. Use Download instead.')
    }
  }

  const isHtml = target === 'html'

  return (
    <ToolPageShell
      manifest={manifest}
      gate={<DependencyGate toolId="pandoc" state={deps} />}
      headerActions={
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-brand-espresso px-2.5 py-1 font-mono text-[12px] uppercase tracking-[0.2em] text-brand-cream-light">
          <Quote className="size-3" /> editorial desk
        </span>
      }
    >
      <div className="space-y-5">
        <div className="rounded-2xl border border-brand-sage bg-surface-white p-4">
          <p className="mb-3 text-xs leading-relaxed text-brand-caramel-text">
            Two panes, one server conversion. The left column is the document you selected; the right column only appears
            after pandoc answers <code className="font-mono">status: completed</code> and the artifact has been read back
            from disk.
          </p>
          <div data-param-key="input_path" className="space-y-2">
            <span className="flex items-center gap-2 text-xs font-bold text-brand-espresso">
              <BookOpen className="size-3.5 text-brand-caramel" />
              {schema.input_path?.title ?? 'input_path'}
            </span>
            <UniversalFileInput
              value={inputPath}
              onChange={(p) => setKey('input_path', p)}
              placeholder="Select a .md, .txt, .html, .docx or LaTeX document"
            />
          </div>

          <div data-param-key="to" className="mt-4 space-y-2">
            <span className="flex items-center gap-2 text-xs font-bold text-brand-espresso">
              <FileCode2 className="size-3.5 text-brand-caramel" />
              {schema.to?.title ?? 'to'}
            </span>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-wrap gap-1.5">
                {targets.map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={target === option}
                    onClick={() => setKey('to', option)}
                    className={`rounded-lg border px-3.5 py-2 font-mono text-xs font-bold uppercase tracking-wider transition-colors ${
                      target === option
                        ? 'border-brand-espresso bg-brand-espresso text-brand-cream-light'
                        : 'border-brand-sage bg-brand-cream-dark/40 text-brand-espresso hover:border-brand-caramel'
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
                {execute.busy ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5 fill-current" />}
                {execute.busy ? `Converting · ${execute.state.elapsedSeconds.toFixed(1)}s measured` : 'Convert document'}
              </button>
            </div>
            <p className="text-xs text-brand-caramel-text">{FORMAT_BLURB[target] ?? 'pandoc target format.'}</p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="flex min-h-[22rem] flex-col overflow-hidden rounded-2xl border border-brand-sage bg-brand-cream-light">
            <header className="flex items-center justify-between gap-2 border-b border-brand-sage bg-brand-cream-dark/60 px-4 py-2.5">
              <span className="font-mono text-[12px] uppercase tracking-[0.22em] text-brand-caramel-text">Source</span>
              <span className="font-mono text-[12px] text-brand-caramel-text">{sourceNote ?? ''}</span>
            </header>
            <div className="flex-1 overflow-auto p-4">
              {reading ? (
                <span className="inline-flex items-center gap-2 font-mono text-xs text-brand-caramel-text">
                  <Loader2 className="size-3.5 animate-spin" /> reading from the backend…
                </span>
              ) : source !== null ? (
                <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-brand-espresso">{source}</pre>
              ) : (
                <p className="font-mono text-xs text-brand-caramel-text">{sourceNote ?? 'No source selected.'}</p>
              )}
            </div>
          </section>

          <section className="flex min-h-[22rem] flex-col overflow-hidden rounded-2xl border border-brand-espresso bg-brand-espresso">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-cream-dark/15 px-4 py-2.5">
              <span className="font-mono text-[12px] uppercase tracking-[0.22em] text-brand-cream-dark/70">
                Converted · {target}
              </span>
              <span className="flex items-center gap-2">
                {producedName && (
                  <span className="font-mono text-[12px] text-brand-cream-dark/60">
                    {producedName}
                    {producedSize === undefined ? '' : ` · ${producedSize} bytes`}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => void copy()}
                  disabled={!produced}
                  className="inline-flex items-center gap-1 rounded-md border border-brand-cream-dark/25 px-2 py-1 font-mono text-[12px] text-brand-cream-dark/85 disabled:opacity-40"
                >
                  {copied ? <Check className="size-3 text-success" /> : <ClipboardCopy className="size-3" />} copy
                </button>
                <a
                  href={producedPath ? contentUrl(producedPath) : undefined}
                  download={producedName || undefined}
                  aria-disabled={!produced}
                  className={`inline-flex items-center gap-1 rounded-md bg-brand-caramel px-2 py-1 font-mono text-[12px] font-bold text-brand-cream-light ${produced ? '' : 'pointer-events-none opacity-40'}`}
                >
                  <Download className="size-3" /> download
                </a>
              </span>
            </header>
            <div className="flex-1 overflow-hidden bg-brand-cream-light">
              {produced === null ? (
                <p className="p-4 font-mono text-xs text-brand-caramel-text">
                  {execute.busy
                    ? `pandoc is converting… ${execute.state.elapsedSeconds.toFixed(1)}s measured so far.`
                    : execute.state.phase === 'failed'
                      ? 'The run failed — the backend message is below, unedited.'
                      : 'Run the conversion to fill this pane.'}
                </p>
              ) : isHtml ? (
                <iframe
                  title={`Converted ${producedName}`}
                  sandbox=""
                  srcDoc={produced}
                  className="h-full min-h-[20rem] w-full bg-white"
                />
              ) : (
                <pre className="h-full overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-xs leading-relaxed text-brand-espresso">
                  {produced}
                </pre>
              )}
            </div>
          </section>
        </div>

        {execute.state.phase !== 'idle' && (
          <ToolResultPanel
            state={execute.state}
            toolId="pandoc"
            toolName={manifest.name}
            onRerun={execute.reset}
            onSendToTool={onSendToTool}
          />
        )}
      </div>
    </ToolPageShell>
  )
}
