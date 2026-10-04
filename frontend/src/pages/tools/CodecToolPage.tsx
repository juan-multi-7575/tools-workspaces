import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowDown,
  Check,
  Copy,
  Download,
  FileUp,
  Hash,
  Link2,
  Play,
  Sigma,
  Type,
} from 'lucide-react'
import ToolPageShell from '../../components/tools/ToolPageShell'
import ToolResultPanel from '../../components/tools/ToolResultPanel'
import UniversalFileInput from '../../components/common/UniversalFileInput'
import { resolveUrl } from '../../lib/api'
import { useToolExecute } from '../../hooks/useToolExecute'
import type { ToolPageProps } from '../../lib/toolPageTypes'

interface FieldSpec {
  type?: string
  title?: string
  description?: string
  enum?: (string | number)[]
  placeholder?: string
  widget?: string
  default?: unknown
}

const CODEC_ICONS: Record<string, typeof Sigma> = {
  base64: Sigma,
  hex: Hash,
  url: Link2,
}

/**
 * Codec utility — a minimal monospace transformer. Deliberately sparse: one
 * segmented codec rail, one bare input area, one bare output area. The input
 * starts empty; this page never ships a pre-filled payload.
 */
export default function CodecToolPage({
  manifest,
  initialParams,
  initialInputPath,
  onComplete,
  onSendToTool,
}: ToolPageProps) {
  const schema = useMemo(
    () => (manifest.parameters_schema ?? {}) as Record<string, FieldSpec>,
    [manifest.parameters_schema],
  )
  const execute = useToolExecute('codec_tool')
  const [params, setParams] = useState<Record<string, unknown>>(() =>
    initialInputPath ? { ...initialParams, input_path: initialInputPath } : initialParams,
  )
  const [copied, setCopied] = useState(false)

  const setKey = (key: string, value: unknown) => setParams((prev) => ({ ...prev, [key]: value }))

  const codec = String(params.codec ?? schema.codec?.default ?? 'base64_encode')
  const text = typeof params.text === 'string' ? params.text : ''
  const inputPath = typeof params.input_path === 'string' ? params.input_path : ''
  const codecs = (schema.codec?.enum ?? ['base64_encode']).map(String)

  const result = execute.state.result
  const completed = result?.status === 'completed'
  // Real values only — nothing is rendered as output unless the backend sent it.
  const output = completed && result?.data && typeof result.data.output === 'string' ? result.data.output : null
  const realCodec = completed && result?.data && typeof result.data.codec === 'string' ? result.data.codec : null
  const realLength = completed && result?.data && typeof result.data.length === 'number' ? result.data.length : null
  const artifact = result?.artifacts[0] ?? null

  const canRun = text.trim().length > 0 || inputPath.trim().length > 0

  const run = async () => {
    const res = await execute.run(params)
    if (res?.status === 'completed') onComplete?.(res, params)
  }

  return (
    <ToolPageShell
      manifest={manifest}
      headerActions={
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.3em] text-brand-caramel-text">
          codec / transformer
        </span>
      }
    >
      <div className="mx-auto max-w-4xl space-y-8">
        {execute.state.error && (
          <div role="alert" className="border-l-2 border-accent-contrast pl-3">
            <p className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-accent-contrast">
              <AlertTriangle className="size-3" /> The backend reported:
            </p>
            <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-brand-espresso">
              {execute.state.error}
            </pre>
          </div>
        )}

        {/* ── CODEC RAIL ─────────────────────────────────────────────── */}
        <section data-param-key="codec" className="space-y-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand-caramel-text">
            {schema.codec?.title ?? 'codec'}
          </p>
          <div className="flex flex-wrap gap-px overflow-hidden rounded-lg border border-brand-espresso">
            {codecs.map((option) => {
              const active = codec === option
              const family = option.split('_')[0]
              const Icon = CODEC_ICONS[family] ?? Sigma
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setKey('codec', option)}
                  disabled={execute.busy}
                  aria-pressed={active}
                  className={`inline-flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 font-mono text-xs transition-colors ${
                    active
                      ? 'bg-brand-espresso text-brand-cream-light'
                      : 'bg-surface-white text-brand-caramel-text hover:bg-brand-cream-dark'
                  }`}
                >
                  <Icon className="size-3.5" />
                  {option}
                </button>
              )
            })}
          </div>
          <p className="font-mono text-[11px] leading-relaxed text-brand-caramel-text">
            {schema.codec?.description ?? 'Choose the transformation to apply.'}
          </p>
        </section>

        {/* ── INPUT ──────────────────────────────────────────────────── */}
        <section data-param-key="text" className="space-y-2">
          <label htmlFor="codec-text" className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand-caramel-text">
            {schema.text?.title ?? 'text'}
          </label>
          <textarea
            id="codec-text"
            value={text}
            onChange={(e) => setKey('text', e.target.value)}
            disabled={execute.busy}
            spellCheck={false}
            rows={8}
            placeholder={schema.text?.placeholder ?? 'Enter text to encode or decode...'}
            className="w-full resize-y rounded-lg border border-brand-sage bg-surface-white px-3 py-2.5 font-mono text-sm leading-relaxed text-brand-espresso placeholder:text-brand-caramel-text/40 focus:border-brand-espresso focus:outline-none"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-brand-caramel-text">
            <span>
              {text.length} chars in the editor
              {text.trim() ? '' : ' · empty'}
            </span>
            <button
              type="button"
              onClick={() => setKey('text', '')}
              disabled={execute.busy || text.length === 0}
              className="rounded border border-brand-sage px-1.5 py-0.5 text-brand-caramel-text hover:border-brand-espresso hover:text-brand-espresso disabled:opacity-30"
            >
              clear
            </button>
          </div>
        </section>

        {/* ── OPTIONAL FILE ──────────────────────────────────────────── */}
        <section data-param-key="input_path" className="space-y-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand-caramel-text">
            {schema.input_path?.title ?? 'input_path'}{' '}
            <span className="text-brand-sage">· optional, overrides the editor</span>
          </p>
          <UniversalFileInput
            value={inputPath}
            onChange={(path) => setKey('input_path', path ?? '')}
            placeholder="/path/to/file.bin"
            accept=".txt,.bin,.dat"
          />
          <p className="font-mono text-[11px] leading-relaxed text-brand-caramel-text">
            {schema.input_path?.description ?? 'Path to file to encode or decode.'}
          </p>
        </section>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void run()}
            disabled={execute.busy || !canRun}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-espresso px-4 py-2 font-mono text-xs font-bold text-brand-cream-light transition-colors hover:bg-brand-caramel disabled:opacity-30"
          >
            <Play className="size-3.5" />
            {execute.busy ? `running · ${execute.state.elapsedSeconds.toFixed(1)}s` : 'transform'}
          </button>
          <ArrowDown className="size-4 text-brand-sage" />
          <span className="font-mono text-[11px] text-brand-caramel-text">
            {completed ? 'server returned below' : execute.state.phase === 'executing' ? 'measuring…' : 'nothing sent yet'}
          </span>
        </div>

        {/* ── OUTPUT ─────────────────────────────────────────────────── */}
        {completed && (
          <section className="space-y-3 border-t border-brand-espresso pt-6">
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 font-mono text-[11px] text-brand-caramel-text">
              <span>
                codec <span className="font-bold text-brand-espresso">{realCodec ?? '—'}</span>
              </span>
              <span>
                length <span className="font-bold text-brand-espresso">{realLength ?? '—'}</span>
              </span>
              <span>
                status <span className="font-bold text-brand-espresso">{result?.status}</span>
              </span>
              <span>
                measured{' '}
                <span className="font-bold text-brand-espresso">
                  {execute.state.elapsedSeconds.toFixed(1)}s
                </span>
              </span>
            </div>

            <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-brand-sage bg-surface-white px-3 py-3 font-mono text-sm leading-relaxed text-brand-espresso">
              {output ?? ''}
            </pre>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (output == null) return
                  void navigator.clipboard?.writeText(output)
                  setCopied(true)
                }}
                disabled={output == null}
                className="inline-flex items-center gap-1.5 rounded-lg border border-brand-sage bg-surface-white px-2.5 py-1.5 font-mono text-[11px] text-brand-espresso hover:border-brand-espresso disabled:opacity-30"
              >
                {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                {copied ? 'copied' : 'copy output'}
              </button>
              {artifact && (
                <a
                  href={resolveUrl(`/api/artifacts/content?path=${encodeURIComponent(artifact.path)}`)}
                  download={artifact.name}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-brand-sage bg-surface-white px-2.5 py-1.5 font-mono text-[11px] text-brand-espresso hover:border-brand-espresso"
                >
                  <Download className="size-3" /> {artifact.name}
                </a>
              )}
            </div>
          </section>
        )}

        {completed && output == null && (
          <p className="border-l-2 border-accent-contrast pl-3 font-mono text-xs text-brand-espresso">
            The run completed but the response carried no <code>output</code> field, so there is nothing to display.
          </p>
        )}

        {execute.state.phase !== 'idle' && (
          <ToolResultPanel
            state={execute.state}
            toolId="codec_tool"
            toolName={manifest.name}
            onRerun={execute.reset}
            onSendToTool={onSendToTool}
          />
        )}

        <p className="flex items-center gap-1.5 border-t border-brand-sage pt-4 font-mono text-[10px] text-brand-caramel-text">
          {text.length > 0 ? <Type className="size-3" /> : <FileUp className="size-3" />}
          {Object.keys(schema).length} manifest keys on this page: {Object.keys(schema).join(', ')}
        </p>
      </div>
    </ToolPageShell>
  )
}