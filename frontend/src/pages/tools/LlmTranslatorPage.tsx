import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CloudDownload,
  FileDiff,
  KeyRound,
  Loader2,
  Play,
  RefreshCw,
  Rows3,
  Save,
  Sigma,
} from 'lucide-react'
import ToolPageShell from '../../components/tools/ToolPageShell'
import ToolResultPanel from '../../components/tools/ToolResultPanel'
import UniversalFileInput from '../../components/common/UniversalFileInput'
import { api, errorMessage, resolveUrl, type DetectedModelProvider } from '../../lib/api'
import { useToolExecute } from '../../hooks/useToolExecute'
import DependencyGate from '../../components/deps/DependencyGate'
import { useToolDeps } from '../../hooks/useToolDeps'
import type { ToolPageProps } from '../../lib/toolPageTypes'

interface FieldSpec {
  type?: string
  title?: string
  description?: string
  enum?: (string | number)[]
  enumLabels?: Record<string, string>
  default?: unknown
  placeholder?: string
}

interface DiffRow {
  key: string
  left: string | null
  right: string | null
  kind: 'equal' | 'only-source' | 'only-target'
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .split(/(?<=[.!?…])\s+|\n{2,}|\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

/**
 * Sentence-level alignment between the two REAL strings. This is a plain
 * longest-common-subsequence walk over real sentence arrays — no heuristics and
 * no invented rows. Anything unmatched is reported as such.
 */
function alignSentences(left: string[], right: string[]): DiffRow[] {
  const n = left.length
  const m = right.length
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lcs[i][j] = left[i] === right[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }

  const rows: DiffRow[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (left[i] === right[j]) {
      rows.push({ key: `eq-${i}-${j}`, left: left[i], right: right[j], kind: 'equal' })
      i += 1
      j += 1
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      rows.push({ key: `os-${i}`, left: left[i], right: null, kind: 'only-source' })
      i += 1
    } else {
      rows.push({ key: `ot-${j}`, left: null, right: right[j], kind: 'only-target' })
      j += 1
    }
  }
  while (i < n) {
    rows.push({ key: `os-${i}`, left: left[i], right: null, kind: 'only-source' })
    i += 1
  }
  while (j < m) {
    rows.push({ key: `ot-${j}`, left: null, right: right[j], kind: 'only-target' })
    j += 1
  }
  return rows
}

const countWords = (value: string) => (value.trim() ? value.trim().split(/\s+/).length : 0)

/**
 * LLM text translator — a side-by-side diff workbench. `data` from this tool
 * carries only metadata (`target_lang`, `provider`, `model`,
 * `artifacts_count`); the translated string itself lives in the returned
 * artifact, so both panes of the diff are read from real files via
 * `api.getArtifactContent`.
 */
export default function LlmTranslatorPage({
  manifest,
  initialParams,
  initialInputPath,
  onComplete,
  onSendToTool,
}: ToolPageProps) {
  const schema = (manifest.parameters_schema ?? {}) as Record<string, FieldSpec>
  const execute = useToolExecute('text.translate.llm')
  const deps = useToolDeps('text.translate.llm')
  const [params, setParams] = useState<Record<string, unknown>>(() =>
    initialInputPath ? { ...initialParams, input_path: initialInputPath } : initialParams,
  )
  const [draft, setDraft] = useState('')
  const [draftDirty, setDraftDirty] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [providers, setProviders] = useState<DetectedModelProvider[]>([])
  const [providersError, setProvidersError] = useState<string | null>(null)
  const [models, setModels] = useState<string[]>([])
  const [modelsSource, setModelsSource] = useState<string | null>(null)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [loadingModels, setLoadingModels] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [keyState, setKeyState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [keyMessage, setKeyMessage] = useState<string | null>(null)
  const [showKey, setShowKey] = useState(false)
  const [onlyDifferences, setOnlyDifferences] = useState(false)
  const [sourceBody, setSourceBody] = useState<{ path: string; content: string | null; error: string | null } | null>(null)
  const [targetBody, setTargetBody] = useState<{ path: string; content: string | null; error: string | null } | null>(null)
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null)

  const setKey = (key: string, value: unknown) => setParams((prev) => ({ ...prev, [key]: value }))

  const inputPath = String(params.input_path ?? '')
  const provider = String(params.provider ?? 'auto')
  const sourceLang = String(params.source_lang ?? 'auto')
  const targetLang = String(params.target_lang ?? 'English')
  const sourceLangs = (schema.source_lang?.enum ?? ['auto']).map(String)
  const targetLangs = (schema.target_lang?.enum ?? ['English']).map(String)
  const providerOptions = (schema.provider?.enum ?? ['auto']).map(String)

  const result = execute.state.result
  const completed = result?.status === 'completed'
  const artifact = result?.artifacts[0] ?? null

  useEffect(() => {
    let active = true
    api
      .getDetectedModelProviders()
      .then((res) => {
        if (active) {
          setProviders(res.providers ?? [])
          setProvidersError(null)
        }
      })
      .catch((err) => {
        if (active) setProvidersError(errorMessage(err) || String(err))
      })
    return () => {
      active = false
    }
  }, [])

  const loadModels = async (providerId: string, key?: string) => {
    if (!providerId || providerId === 'auto') {
      setModels([])
      setModelsSource(null)
      setModelsError(null)
      return
    }
    setLoadingModels(true)
    try {
      const res = await api.getProviderModels(providerId, key || undefined)
      setModels(res.models ?? [])
      setModelsSource(res.source)
      setModelsError(res.error ? errorMessage(res.error) : null)
    } catch (err) {
      setModels([])
      setModelsSource(null)
      setModelsError(errorMessage(err) || String(err))
    } finally {
      setLoadingModels(false)
    }
  }

  useEffect(() => {
    void loadModels(provider, apiKey || undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider])

  useEffect(() => {
    if (!inputPath) {
      setSourceBody(null)
      return
    }
    let active = true
    setSourceBody({ path: inputPath, content: null, error: null })
    api
      .getArtifactContent(inputPath)
      .then((res) => {
        if (!active) return
        setSourceBody({ path: inputPath, content: res.content, error: null })
        // Seed the editable pane from the real file, and only while untouched.
        setDraft((prev) => (prev.trim() ? prev : res.content))
        setDraftDirty(false)
      })
      .catch((err) => {
        if (active) setSourceBody({ path: inputPath, content: null, error: errorMessage(err) || String(err) })
      })
    return () => {
      active = false
    }
  }, [inputPath])

  useEffect(() => {
    if (!completed || !artifact) {
      if (!artifact) setTargetBody(null)
      return
    }
    let active = true
    setTargetBody({ path: artifact.path, content: null, error: null })
    api
      .getArtifactContent(artifact.path)
      .then((res) => {
        if (active) setTargetBody({ path: artifact.path, content: res.content, error: null })
      })
      .catch((err) => {
        if (active) setTargetBody({ path: artifact.path, content: null, error: errorMessage(err) || String(err) })
      })
    return () => {
      active = false
    }
  }, [completed, artifact])

  const diffRows = useMemo<DiffRow[]>(() => {
    if (!completed || sourceBody?.content == null || targetBody?.content == null) return []
    return alignSentences(splitSentences(sourceBody.content), splitSentences(targetBody.content))
  }, [completed, sourceBody, targetBody])

  const visibleRows = onlyDifferences ? diffRows.filter((row) => row.kind !== 'equal') : diffRows
  const identical = diffRows.filter((row) => row.kind === 'equal').length
  const sourceOnly = diffRows.filter((row) => row.kind === 'only-source').length
  const targetOnly = diffRows.filter((row) => row.kind === 'only-target').length

  const sourcePaneText = draftDirty ? draft : (sourceBody?.content ?? draft)
  const canRun = inputPath.trim().length > 0

  /** Persist the edited buffer as a real artifact, then point input_path at it. */
  const pushDraft = async () => {
    if (!draft.trim()) return
    setUploading(true)
    setUploadError(null)
    try {
      const res = await api.uploadFile(new File([draft], 'translation_source.txt', { type: 'text/plain' }))
      setKey('input_path', res.path)
      setDraftDirty(false)
    } catch (err) {
      setUploadError(errorMessage(err) || String(err))
    } finally {
      setUploading(false)
    }
  }

  const saveKeyNow = async () => {
    if (!provider || provider === 'auto' || !apiKey.trim()) return
    setKeyState('saving')
    setKeyMessage(null)
    try {
      await api.saveKey(provider, apiKey.trim())
      setKeyState('saved')
      setKeyMessage(`Saved for ${provider}.`)
      setApiKey('')
      void loadModels(provider, undefined)
    } catch (err) {
      setKeyState('error')
      setKeyMessage(errorMessage(err) || String(err))
    }
  }

  const run = async () => {
    const res = await execute.run(params)
    if (res?.status === 'completed') onComplete?.(res, params)
  }

  const KIND_STYLE: Record<DiffRow['kind'], string> = {
    equal: 'bg-surface-white',
    'only-source': 'bg-accent-contrast/10',
    'only-target': 'bg-brand-sage/30',
  }
  const KIND_LABEL: Record<DiffRow['kind'], string> = {
    equal: 'identical',
    'only-source': 'source only',
    'only-target': 'target only',
  }

  return (
    <ToolPageShell
      manifest={manifest}
      gate={<DependencyGate toolId="text.translate.llm" state={deps} />}
      headerActions={
        <span className="inline-flex items-center gap-1.5 rounded-md border border-brand-caramel bg-brand-caramel-muted px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-brand-espresso">
          <FileDiff className="size-3" /> diff workbench
        </span>
      }
      aside={
        <div className="space-y-4">
          <div data-param-key="input_path" className="space-y-1.5">
            <label className="block text-xs font-bold text-brand-espresso">
              {schema.input_path?.title ?? 'input_path'}
            </label>
            <UniversalFileInput
              value={inputPath}
              onChange={(path) => setKey('input_path', path ?? '')}
              placeholder="/path/to/document.txt"
              accept=".txt,.md"
              filterExtensions={['.txt', '.md']}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div data-param-key="source_lang" className="space-y-1">
              <label htmlFor="llm-src-lang" className="block text-[11px] font-bold text-brand-espresso">
                {schema.source_lang?.title ?? 'source_lang'}
              </label>
              <select
                id="llm-src-lang"
                value={sourceLang}
                onChange={(e) => setKey('source_lang', e.target.value)}
                disabled={execute.busy}
                className="w-full rounded-lg border border-brand-sage bg-surface-white px-2 py-1.5 font-mono text-xs text-brand-espresso"
              >
                {sourceLangs.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
            </div>
            <div data-param-key="target_lang" className="space-y-1">
              <label htmlFor="llm-tgt-lang" className="block text-[11px] font-bold text-brand-espresso">
                {schema.target_lang?.title ?? 'target_lang'}
              </label>
              <select
                id="llm-tgt-lang"
                value={targetLang}
                onChange={(e) => setKey('target_lang', e.target.value)}
                disabled={execute.busy}
                className="w-full rounded-lg border border-brand-caramel bg-surface-white px-2 py-1.5 font-mono text-xs font-bold text-brand-espresso"
              >
                {targetLangs.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div data-param-key="provider" className="space-y-1.5">
            <label htmlFor="llm-provider" className="block text-xs font-bold text-brand-espresso">
              {schema.provider?.title ?? 'provider'}
            </label>
            <select
              id="llm-provider"
              value={provider}
              onChange={(e) => setKey('provider', e.target.value)}
              disabled={execute.busy}
              className="w-full rounded-lg border border-brand-sage bg-surface-white px-2 py-2 font-mono text-xs text-brand-espresso"
            >
              {providerOptions.map((option) => (
                <option key={option} value={option}>
                  {schema.provider?.enumLabels?.[option] ?? option}
                </option>
              ))}
              {providers
                .filter((p) => !providerOptions.includes(p.id))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.has_key ? '(key detected)' : '(no key)'}
                  </option>
                ))}
            </select>
            {providersError && (
              <p className="font-mono text-[10px] leading-snug text-accent-contrast">
                Provider detection failed: {providersError}
              </p>
            )}
          </div>

          <div data-param-key="model" className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="llm-model" className="block text-xs font-bold text-brand-espresso">
                {schema.model?.title ?? 'model'}
              </label>
              <button
                type="button"
                onClick={() => void loadModels(provider, apiKey || undefined)}
                disabled={loadingModels || provider === 'auto'}
                className="inline-flex items-center gap-1 rounded border border-brand-sage bg-surface-white px-1.5 py-0.5 font-mono text-[10px] text-brand-caramel-text disabled:opacity-40"
              >
                <RefreshCw className={`size-2.5 ${loadingModels ? 'animate-spin' : ''}`} /> refresh
              </button>
            </div>
            <input
              id="llm-model"
              list="llm-model-options"
              value={String(params.model ?? 'auto')}
              onChange={(e) => setKey('model', e.target.value || 'auto')}
              disabled={execute.busy}
              placeholder={schema.model?.placeholder ?? 'auto'}
              className="w-full rounded-lg border border-brand-sage bg-surface-white px-2 py-2 font-mono text-xs text-brand-espresso"
            />
            <datalist id="llm-model-options">
              {models.map((model) => (
                <option key={model} value={model} />
              ))}
            </datalist>
            <p className="font-mono text-[10px] text-brand-caramel-text">
              {loadingModels
                ? 'querying provider…'
                : modelsSource
                  ? `${models.length} models · ${modelsSource}`
                  : provider === 'auto'
                    ? 'auto — provider chosen server-side'
                    : 'no model list loaded'}
            </p>
            {modelsError && <p className="font-mono text-[10px] text-accent-contrast">{modelsError}</p>}
          </div>

          <div className="space-y-1.5 border-t border-brand-sage pt-3">
            <label htmlFor="llm-key" className="flex items-center gap-1.5 text-xs font-bold text-brand-espresso">
              <KeyRound className="size-3.5 text-brand-caramel" /> inline API key
            </label>
            <div className="flex gap-1.5">
              <input
                id="llm-key"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={provider === 'auto' ? 'choose a provider first' : `key for ${provider}`}
                className="min-w-0 flex-1 rounded-lg border border-brand-sage bg-surface-white px-2 py-1.5 font-mono text-xs text-brand-espresso"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="rounded border border-brand-sage px-1.5 font-mono text-[10px] text-brand-caramel-text"
              >
                {showKey ? 'hide' : 'show'}
              </button>
              <button
                type="button"
                onClick={() => void saveKeyNow()}
                disabled={keyState === 'saving' || !apiKey.trim() || provider === 'auto'}
                className="rounded bg-brand-espresso px-2 font-mono text-[10px] font-bold text-brand-cream-light disabled:opacity-40"
              >
                {keyState === 'saving' ? '…' : 'save'}
              </button>
            </div>
            {keyMessage && (
              <p
                className={`font-mono text-[10px] ${keyState === 'error' ? 'text-accent-contrast' : 'text-brand-espresso'}`}
              >
                {keyMessage}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => void run()}
            disabled={execute.busy || !canRun || !deps.ready}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-caramel px-3 py-2.5 text-xs font-bold text-brand-cream-light transition-colors hover:bg-brand-espresso disabled:opacity-40"
          >
            {execute.busy ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
            {execute.busy ? `Translating · ${execute.state.elapsedSeconds.toFixed(1)}s` : `Run → ${targetLang}`}
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
              <dt>resolved provider</dt>
              <dd className="font-bold text-brand-espresso">{completed ? String(result?.data?.provider ?? '—') : '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt>resolved model</dt>
              <dd className="font-bold text-brand-espresso">{completed ? String(result?.data?.model ?? '—') : '—'}</dd>
            </div>
          </dl>
        </div>
      }
    >
      <div className="space-y-4">
        {execute.state.error && (
          <div role="alert" className="rounded-lg border-2 border-accent-contrast bg-accent-contrast/10 p-3">
            <p className="mb-1 flex items-center gap-1.5 text-xs font-bold text-accent-contrast">
              <AlertTriangle className="size-3.5" /> The backend reported:
            </p>
            <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-brand-espresso">
              {execute.state.error}
            </pre>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          {/* ── EDITABLE SOURCE PANE ─────────────────────────────────── */}
          <section className="rounded-xl border-2 border-brand-espresso bg-surface-white">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-brand-espresso bg-brand-espresso px-3 py-2">
              <h2 className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-brand-cream-light">
                <Rows3 className="size-3" /> source · {sourceLang}
              </h2>
              <span className="font-mono text-[10px] text-brand-cream-light/80">
                {sourcePaneText.length} chars · {countWords(sourcePaneText)} words
              </span>
            </header>
            <textarea
              ref={textAreaRef}
              value={sourcePaneText}
              onChange={(e) => {
                setDraft(e.target.value)
                setDraftDirty(true)
              }}
              disabled={execute.busy}
              spellCheck={false}
              placeholder="Pick a .txt file above, or type here then push the buffer to the server as the real input file."
              className="min-h-[340px] w-full resize-y px-3 py-3 font-mono text-xs leading-relaxed text-brand-espresso focus:outline-none"
            />
            <footer className="flex flex-wrap items-center gap-2 border-t border-brand-sage px-3 py-2">
              {draftDirty && (
                <>
                  <button
                    type="button"
                    onClick={() => void pushDraft()}
                    disabled={uploading}
                    className="inline-flex items-center gap-1.5 rounded bg-brand-caramel px-2 py-1 font-mono text-[10px] font-bold text-brand-cream-light disabled:opacity-40"
                  >
                    {uploading ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />}
                    {uploading ? 'uploading…' : 'push buffer as input file'}
                  </button>
                  <span className="font-mono text-[10px] text-brand-caramel-text">
                    unsaved edits — this tool reads a file, not a text field
                  </span>
                </>
              )}
              {!draftDirty && inputPath && (
                <span className="truncate font-mono text-[10px] text-brand-caramel-text" title={inputPath}>
                  reading from {inputPath}
                </span>
              )}
            </footer>
            {uploadError && (
              <p className="border-t border-brand-sage px-3 py-1.5 font-mono text-[10px] text-accent-contrast">
                Upload failed: {uploadError}
              </p>
            )}
            {sourceBody?.error && (
              <p className="border-t border-brand-sage px-3 py-1.5 font-mono text-[10px] text-accent-contrast">
                Source could not be read: {sourceBody.error}
              </p>
            )}
          </section>

          {/* ── REAL TRANSLATION PANE ───────────────────────────────── */}
          <section className="rounded-xl border-2 border-brand-caramel bg-surface-white">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-brand-caramel bg-brand-caramel px-3 py-2">
              <h2 className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-brand-cream-light">
                <ArrowRight className="size-3" /> target · {targetLang}
              </h2>
              <span className="font-mono text-[10px] text-brand-cream-light/80">
                {targetBody?.content ? `${targetBody.content.length} chars · ${countWords(targetBody.content)} words` : '—'}
              </span>
            </header>
            <div className="min-h-[340px] px-3 py-3">
              {targetBody?.error && (
                <p className="font-mono text-xs text-accent-contrast">Artifact could not be read: {targetBody.error}</p>
              )}
              {completed && targetBody?.content != null && (
                <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-brand-espresso">
                  {targetBody.content}
                </pre>
              )}
              {execute.state.phase === 'executing' && (
                <p className="flex items-center gap-2 font-mono text-xs text-brand-caramel-text">
                  <Loader2 className="size-3.5 animate-spin" /> Translating — {execute.state.elapsedSeconds.toFixed(1)}s measured
                </p>
              )}
              {execute.state.phase === 'idle' && (
                <p className="font-mono text-xs leading-relaxed text-brand-caramel-text">
                  The translation arrives as a file artifact, not in the JSON body. It is read here from the real
                  artifact path the backend returned.
                </p>
              )}
              {artifact && (
                <a
                  href={resolveUrl(`/api/artifacts/content?path=${encodeURIComponent(artifact.path)}`)}
                  download={artifact.name}
                  className="mt-2 inline-flex items-center gap-1.5 rounded border border-brand-sage px-2 py-1 font-mono text-[10px] text-brand-espresso hover:border-brand-caramel"
                >
                  <CloudDownload className="size-3" /> {artifact.name}
                </a>
              )}
            </div>
          </section>
        </div>

        {/* ── SENTENCE DIFF ────────────────────────────────────────── */}
        {completed && (
          <section className="overflow-hidden rounded-xl border-2 border-brand-espresso bg-surface-white">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-brand-espresso bg-brand-cream-dark px-3 py-2">
              <h3 className="flex items-center gap-1.5 text-xs font-bold text-brand-espresso">
                <Sigma className="size-3.5 text-brand-caramel" /> Sentence diff (real strings)
              </h3>
              <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] text-brand-caramel-text">
                <span>{diffRows.length} aligned</span>
                <span>{identical} identical</span>
                <span>{sourceOnly} source-only</span>
                <span>{targetOnly} target-only</span>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={onlyDifferences}
                    onChange={(e) => setOnlyDifferences(e.target.checked)}
                    className="size-3 accent-brand-caramel"
                  />
                  differences only
                </label>
              </div>
            </header>

            {visibleRows.length === 0 ? (
              <p className="px-3 py-8 text-center font-mono text-xs text-brand-caramel-text">
                {diffRows.length === 0
                  ? 'Both real files must be readable before a diff can be computed.'
                  : 'Every aligned sentence is identical — there are no differences to show.'}
              </p>
            ) : (
              <div className="max-h-[520px] overflow-y-auto">
                {visibleRows.map((row, index) => (
                  <div key={row.key} className={`grid grid-cols-2 border-b border-brand-sage/50 ${KIND_STYLE[row.kind]}`}>
                    <div className="border-r-2 border-brand-espresso px-3 py-2">
                      <p className="mb-0.5 font-mono text-[10px] font-bold text-brand-caramel-text">
                        {index + 1}. {KIND_LABEL[row.kind]}
                      </p>
                      <p className="text-xs leading-relaxed text-brand-espresso">
                        {row.left ?? <span className="font-mono text-brand-caramel-text">—</span>}
                      </p>
                    </div>
                    <div className="px-3 py-2">
                      <p className="text-xs leading-relaxed text-brand-espresso">
                        {row.right ?? <span className="font-mono text-brand-caramel-text">—</span>}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {execute.state.phase !== 'idle' && (
          <ToolResultPanel
            state={execute.state}
            toolId="text.translate.llm"
            toolName={manifest.name}
            onRerun={execute.reset}
            onSendToTool={onSendToTool}
          />
        )}
      </div>
    </ToolPageShell>
  )
}