import { useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CircleDot,
  Loader2,
  Play,
  Plus,
  Plug,
  RotateCcw,
  Trash2,
  Waves,
} from 'lucide-react'
import ToolPageShell from '../../components/tools/ToolPageShell'
import ToolResultPanel from '../../components/tools/ToolResultPanel'
import UniversalFileInput from '../../components/common/UniversalFileInput'
import RequiredFieldError from '../../components/common/RequiredFieldError'
import { isRequiredKey, missingRequiredMessage } from '../../lib/requiredFields'
import { resolveUrl } from '../../lib/api'
import { useToolExecute } from '../../hooks/useToolExecute'
import DependencyGate from '../../components/deps/DependencyGate'
import { useToolDeps } from '../../hooks/useToolDeps'
import type { ToolPageProps } from '../../lib/toolPageTypes'

/**
 * SoX DSP rack.
 *
 * Visual identity: a warm studio faceplate. Modules are stacked in signal
 * order down a left-hand patch rail; each module silkscreens its own
 * parameters and the rail shows the exact command the backend will receive.
 *
 * The backend runs `sox <input> <output> <effect.split()>` — so the whole
 * chain must flatten into one whitespace-separated string. That string is
 * shown verbatim before you run it; nothing here is a preview of a guess.
 */

interface FieldSpec {
  key: string
  label: string
  placeholder: string
  initial: string
}

interface StageDef {
  id: string
  name: string
  hint: string
  fields: FieldSpec[]
  build: (values: Record<string, string>) => string | null
}

function numeric(value: string): boolean {
  return value.trim() !== '' && Number.isFinite(Number(value))
}

/** Every def builds a real SoX effect token string — nothing is invented. */
const STAGE_DEFS: StageDef[] = [
  {
    id: 'trim',
    name: 'trim',
    hint: 'Keep a slice of the timeline.',
    fields: [
      { key: 'start', label: 'start (s)', placeholder: '0', initial: '0' },
      { key: 'length', label: 'length (s)', placeholder: '30', initial: '30' },
    ],
    build: (v) =>
      numeric(v.start) && numeric(v.length) ? `trim ${v.start.trim()} ${v.length.trim()}` : null,
  },
  {
    id: 'norm',
    name: 'norm',
    hint: 'Normalise loudness.',
    fields: [{ key: 'gain', label: 'gain (dB)', placeholder: '-3', initial: '-3' }],
    build: (v) => (numeric(v.gain) ? `norm ${v.gain.trim()}` : null),
  },
  {
    id: 'gain',
    name: 'gain',
    hint: 'Scale amplitude.',
    fields: [{ key: 'level', label: 'level (dB)', placeholder: '-6', initial: '-6' }],
    build: (v) => (numeric(v.level) ? `gain ${v.level.trim()}` : null),
  },
  {
    id: 'pitch',
    name: 'pitch',
    hint: 'Shift pitch — value passed straight through to SoX.',
    fields: [{ key: 'value', label: 'value', placeholder: '200', initial: '200' }],
    build: (v) => (numeric(v.value) ? `pitch ${v.value.trim()}` : null),
  },
  {
    id: 'lowpass',
    name: 'lowpass',
    hint: 'Low-pass filter.',
    fields: [{ key: 'hz', label: 'frequency (Hz)', placeholder: '3000', initial: '3000' }],
    build: (v) => (numeric(v.hz) ? `lowpass ${v.hz.trim()}` : null),
  },
  {
    id: 'highpass',
    name: 'highpass',
    hint: 'High-pass filter.',
    fields: [{ key: 'hz', label: 'frequency (Hz)', placeholder: '120', initial: '120' }],
    build: (v) => (numeric(v.hz) ? `highpass ${v.hz.trim()}` : null),
  },
  {
    id: 'rate',
    name: 'rate',
    hint: 'Resample the audio rate.',
    fields: [{ key: 'hz', label: 'rate (Hz)', placeholder: '44100', initial: '44100' }],
    build: (v) => (numeric(v.hz) ? `rate ${v.hz.trim()}` : null),
  },
  {
    id: 'reverse',
    name: 'reverse',
    hint: 'Play the buffer backwards.',
    fields: [],
    build: () => 'reverse',
  },
  {
    id: 'raw',
    name: 'raw',
    hint: 'Any other SoX effect, written by you.',
    fields: [{ key: 'text', label: 'effect tokens', placeholder: 'silence 1 0 5%', initial: '' }],
    build: (v) => (v.text.trim() === '' ? null : v.text.trim()),
  },
]

const DEF_BY_ID = Object.fromEntries(STAGE_DEFS.map((def) => [def.id, def])) as Record<string, StageDef>

interface Stage {
  id: string
  values: Record<string, string>
}

let stageCounter = 0
function newStage(defId: string): Stage {
  const def = DEF_BY_ID[defId]
  stageCounter += 1
  return {
    id: `${defId}-${stageCounter}`,
    values: Object.fromEntries(def.fields.map((field) => [field.key, field.initial])),
  }
}

export default function SoxPage({
  manifest,
  initialParams,
  initialInputPath,
  onComplete,
  onSendToTool,
  onOpenAudioPlayer,
}: ToolPageProps) {
  const execute = useToolExecute('sox')
  const deps = useToolDeps('sox')
  const schema = manifest.parameters_schema as Record<string, { title?: string; description?: string }>
  const [params, setParams] = useState<Record<string, unknown>>(() =>
    initialInputPath ? { ...initialParams, input_path: initialInputPath } : initialParams,
  )
  const [stages, setStages] = useState<Stage[]>([])
  const lastRackString = useRef<string | null>(null)

  const inputPath = String(params.input_path ?? '')

  // `input_path` is not in the manifest schema but the backend refuses to run
  // without it, so the rack carries the gate itself rather than describing what
  // the backend will answer.
  const [inputTouched, setInputTouched] = useState(false)
  const inputInvalid = isRequiredKey('sox', 'input_path') && inputTouched && inputPath.trim() === ''
  const inputErrorId = 'sox-input-required'
  const effectParam = String(params.effect ?? '')

  const rackString = useMemo(
    () =>
      stages
        .map((stage) => ({ stage, token: DEF_BY_ID[stage.id].build(stage.values) }))
        .filter((entry) => entry.token !== null)
        .map((entry) => entry.token as string)
        .join(' '),
    [stages],
  )

  const invalidStages = stages.filter((stage) => DEF_BY_ID[stage.id].build(stage.values) === null)
  const diverged = lastRackString.current !== null && lastRackString.current !== effectParam

  const setStagesAndSync = (next: Stage[]) => {
    const joined = next
      .map((stage) => DEF_BY_ID[stage.id].build(stage.values))
      .filter((token) => token !== null)
      .join(' ')
    lastRackString.current = joined
    setStages(next)
    setParams((prev) => ({ ...prev, effect: joined }))
  }

  const addStage = (defId: string) => setStagesAndSync([...stages, newStage(defId)])
  const removeStage = (id: string) => setStagesAndSync(stages.filter((stage) => stage.id !== id))
  const moveStage = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= stages.length) return
    const next = [...stages]
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item)
    setStagesAndSync(next)
  }
  const setField = (stage: Stage, key: string, value: string) =>
    setStagesAndSync(
      stages.map((entry) => (entry.id === stage.id ? { ...entry, values: { ...entry.values, [key]: value } } : entry)),
    )

  const output = useMemo(() => {
    if (execute.state.result?.status !== 'completed') return null
    return execute.state.result.artifacts.find((artifact) => artifact.path) ?? null
  }, [execute.state.result])

  const run = async () => {
    const result = await execute.run(params)
    if (result?.status === 'completed') onComplete?.(result, params)
  }

  return (
    <ToolPageShell
      manifest={manifest}
      gate={<DependencyGate toolId="sox" state={deps} />}
      headerActions={
        <span className="inline-flex items-center gap-1.5 rounded-md bg-[#2f2622] px-2.5 py-1 font-mono text-[12px] uppercase tracking-[0.22em] text-[#e0a96d]">
          <Waves className="size-3" /> {stages.length} module{stages.length === 1 ? '' : 's'}
        </span>
      }
      aside={
        <div className="sticky top-4 space-y-4 rounded-2xl bg-[#241d1a] p-4 text-[#efe4d8]">
          <p className="font-mono text-[12px] uppercase tracking-[0.28em] text-[#a08a76]">rack output</p>

          <div data-param-key="effect" className="space-y-2">
            <label htmlFor="sox-effect" className="flex items-center justify-between font-mono text-[12px] uppercase tracking-wider text-[#e0a96d]">
              <span className="flex items-center gap-1.5"><Plug className="size-3" /> {schema.effect?.title ?? 'effect'}</span>
              <span className="rounded bg-[#3a2d26] px-1.5 py-0.5">{effectParam === '' ? 'empty' : `${effectParam.length} chars`}</span>
            </label>
            <textarea
              id="sox-effect"
              rows={3}
              value={effectParam}
              onChange={(event) => {
                lastRackString.current = null
                setParams((prev) => ({ ...prev, effect: event.target.value }))
              }}
              placeholder="trim 0 30 norm -3"
              spellCheck={false}
              className="w-full rounded-lg border border-[#4a3a31] bg-[#171210] px-2.5 py-2 font-mono text-xs text-[#ffe0bd] placeholder-[#6b574a] focus:border-[#e0a96d] focus:outline-none"
            />
            <p className="font-mono text-[12px] leading-snug text-[#a08a76]">
              {schema.effect?.description ?? 'SoX effect chain.'} Split on whitespace, and the tokens are appended
              to the <code>sox</code> command line in the order written.
            </p>
            {diverged && (
              <button
                type="button"
                onClick={() => { lastRackString.current = rackString; setParams((prev) => ({ ...prev, effect: rackString })) }}
                className="w-full rounded-lg border border-[#e0a96d] px-2 py-1.5 font-mono text-[12px] uppercase tracking-wider text-[#e0a96d] hover:bg-[#3a2d26]"
              >
                rebuild from the rack ({rackString || 'empty'})
              </button>
            )}
          </div>

          <div className="space-y-1 rounded-xl bg-[#171210] p-3 font-mono text-[12px] leading-relaxed text-[#c9b6a4]">
            <p className="text-[#a08a76]">command the backend will build</p>
            <p className="break-all text-[#ffe0bd]">sox {inputPath || '\u003cinput\u003e'} &lt;output&gt; {effectParam || '(no effect tokens)'}</p>
          </div>

          <button
            type="button"
            onClick={() => void run()}
            disabled={execute.busy || !inputPath || !deps.ready}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#e0a96d] px-3 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-[#241d1a] disabled:opacity-50"
          >
            {execute.busy ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5 fill-current" />}
            {execute.busy ? `processing · ${execute.state.elapsedSeconds.toFixed(1)}s` : 'run the rack'}
          </button>
          <button
            type="button"
            onClick={() => { execute.reset(); setStagesAndSync([]) }}
            disabled={execute.busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#4a3a31] px-3 py-2 font-mono text-xs text-[#c9b6a4] hover:border-[#e0a96d] disabled:opacity-40"
          >
            <RotateCcw className="size-3.5" /> clear rack
          </button>

          {execute.state.error && (
            <div role="alert" className="rounded-xl border border-accent-contrast bg-[#2a1214] p-3">
              <p className="flex items-center gap-1.5 font-mono text-[12px] uppercase tracking-wider text-[#ff9d9d]">
                <AlertTriangle className="size-3" /> sox reported
              </p>
              <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-[#ffd7d7]">
                {execute.state.error}
              </pre>
            </div>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {/* ── SOURCE ────────────────────────────────────────────────────────── */}
        <section className="rounded-2xl border border-[#4a3a31] bg-[#241d1a] p-4 text-[#efe4d8]">
          <div data-param-key="input_path" className="space-y-2">
            <h2 className="flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.24em] text-[#a08a76]">
              <CircleDot className="size-3.5 text-[#e0a96d]" /> patch input
            </h2>
            <label htmlFor="sox-input" className="block font-mono text-[12px] uppercase tracking-[0.18em] text-[#e0a96d]">
              {schema.input_path?.title ?? 'input_path'} <span className="text-rose-300">*</span>
            </label>
            <UniversalFileInput
              id="sox-input"
              value={inputPath}
              onChange={(path) => setParams((prev) => ({ ...prev, input_path: path ?? '' }))}
              onBlur={() => setInputTouched(true)}
              required
              aria-required={true}
              aria-invalid={inputInvalid || undefined}
              aria-describedby={inputInvalid ? inputErrorId : undefined}
              placeholder="/absolute/path/to/voice.wav"
              accept="audio/*,video/*"
            />
            <p className="font-mono text-[12px] leading-snug text-[#a08a76]">
              <code>input_path</code> is the audio or video file the rack reads. It is not declared in this
              tool&apos;s manifest schema, but the run needs it.
            </p>
            {inputInvalid && (
              <RequiredFieldError
                id={inputErrorId}
                message={missingRequiredMessage([{ key: 'input_path', label: 'input_path' }])}
                className="font-mono text-[12px] text-rose-300"
              />
            )}
          </div>
        </section>

        {/* ── RACK ──────────────────────────────────────────────────────────── */}
        <section className="rounded-2xl border border-[#4a3a31] bg-[#241d1a] p-4 text-[#efe4d8]">
          <header className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.24em] text-[#a08a76]">
              <Plug className="size-3.5 text-[#e0a96d]" /> signal path · in order
            </h2>
            <p className="font-mono text-[12px] text-[#a08a76]">
              {stages.length === 0 ? 'no modules patched in yet' : `${stages.length} module(s), applied top to bottom`}
            </p>
          </header>

          {stages.length === 0 && (
            <p className="mt-3 rounded-xl border border-dashed border-[#4a3a31] px-3 py-6 text-center font-mono text-xs text-[#a08a76]">
              Pick a module below to patch it into the chain. Each one contributes a real SoX effect token to the single{' '}
              <code>effect</code> string.
            </p>
          )}

          <ol className="mt-3 space-y-0">
            {stages.map((stage, index) => {
              const def = DEF_BY_ID[stage.id]
              const token = def.build(stage.values)
              const valid = token !== null
              return (
                <li key={stage.id}>
                  <div
                    data-valid={valid ? 'true' : 'false'}
                    className={`flex gap-3 rounded-xl border p-3 ${
                      valid ? 'border-[#4a3a31] bg-[#2e2521]' : 'border-accent-contrast bg-[#2a1214]'
                    }`}
                  >
                    {/* patch rail */}
                    <div className="flex shrink-0 flex-col items-center gap-1">
                      <span className="flex size-6 items-center justify-center rounded-full border border-[#e0a96d] bg-[#171210] font-mono text-[12px] text-[#e0a96d]">
                        {index + 1}
                      </span>
                      {index < stages.length - 1 && <span className="h-full w-px flex-1 bg-[#4a3a31]" aria-hidden="true" />}
                    </div>

                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-mono text-sm font-bold text-[#ffe0bd]">{def.name}</p>
                          <p className="font-mono text-[12px] text-[#a08a76]">{def.hint}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => moveStage(index, -1)}
                            disabled={index === 0 || execute.busy}
                            aria-label={`Move ${def.name} earlier in the chain`}
                            className="rounded border border-[#4a3a31] p-1 font-mono text-[#c9b6a4] hover:border-[#e0a96d] hover:text-[#e0a96d] disabled:opacity-30"
                          >
                            <ArrowUp className="size-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveStage(index, 1)}
                            disabled={index === stages.length - 1 || execute.busy}
                            aria-label={`Move ${def.name} later in the chain`}
                            className="rounded border border-[#4a3a31] p-1 font-mono text-[#c9b6a4] hover:border-[#e0a96d] hover:text-[#e0a96d] disabled:opacity-30"
                          >
                            <ArrowDown className="size-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeStage(stage.id)}
                            disabled={execute.busy}
                            aria-label={`Remove the ${def.name} module`}
                            className="rounded border border-[#4a3a31] p-1 font-mono text-[#c9b6a4] hover:border-accent-contrast hover:text-[#ff9d9d] disabled:opacity-30"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        </div>
                      </div>

                      {def.fields.length > 0 && (
                        <div className="grid gap-2 sm:grid-cols-2">
                          {def.fields.map((field) => (
                            <label key={field.key} className="block font-mono text-[12px] uppercase tracking-wider text-[#a08a76]">
                              <span className="block">{field.label}</span>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={stage.values[field.key] ?? ''}
                                onChange={(event) => setField(stage, field.key, event.target.value)}
                                disabled={execute.busy}
                                placeholder={field.placeholder}
                                className="mt-1 w-full rounded-lg border border-[#4a3a31] bg-[#171210] px-2.5 py-1.5 font-mono text-xs text-[#ffe0bd] placeholder-[#6b574a] focus:border-[#e0a96d] focus:outline-none disabled:opacity-60"
                              />
                            </label>
                          ))}
                        </div>
                      )}

                      <p className={`font-mono text-[12px] ${valid ? 'text-[#9fd4b4]' : 'text-[#ff9d9d]'}`}>
                        {valid ? `contributes: ${token}` : 'incomplete — fill every field with a number, or it is left out of the chain'}
                      </p>
                    </div>
                  </div>
                  {index < stages.length - 1 && (
                    <div className="flex items-center gap-1.5 pl-8 py-1 font-mono text-[12px] text-[#6b574a]">
                      <span className="h-3 w-px bg-[#4a3a31]" aria-hidden="true" /> into
                    </div>
                  )}
                </li>
              )
            })}
          </ol>

          <div className="mt-4 border-t border-[#4a3a31] pt-3">
            <p className="mb-2 flex items-center gap-1.5 font-mono text-[12px] uppercase tracking-[0.18em] text-[#a08a76]">
              <Plus className="size-3" /> patch in a module
            </p>
            <div className="flex flex-wrap gap-1.5">
              {STAGE_DEFS.map((def) => (
                <button
                  key={def.id}
                  type="button"
                  onClick={() => addStage(def.id)}
                  disabled={execute.busy}
                  className="rounded-lg border border-[#4a3a31] bg-[#2e2521] px-2.5 py-1.5 font-mono text-xs text-[#c9b6a4] hover:border-[#e0a96d] hover:text-[#ffe0bd] disabled:opacity-40"
                >
                  {def.name}
                </button>
              ))}
            </div>
            {invalidStages.length > 0 && (
              <p className="mt-3 flex items-center gap-1.5 font-mono text-[12px] text-[#ff9d9d]">
                <AlertTriangle className="size-3" />
                {invalidStages.length} module(s) incomplete and therefore excluded from the <code>effect</code> string.
              </p>
            )}
          </div>
        </section>

        {/* ── OUTPUT ────────────────────────────────────────────────────────── */}
        {output && (
          <section className="rounded-2xl border border-[#4a3a31] bg-[#241d1a] p-4 text-[#efe4d8]">
            <h2 className="flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.24em] text-[#9fd4b4]">
              <Play className="size-3.5" /> processed file
            </h2>
            <p className="mt-1 break-all font-mono text-xs text-[#c9b6a4]">{output.path}</p>
            <audio
              controls
              preload="metadata"
              src={resolveUrl(`/api/artifacts/content?path=${encodeURIComponent(output.path)}`)}
              className="mt-3 w-full"
              aria-label={`Processed audio ${output.name}`}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={resolveUrl(`/api/artifacts/content?path=${encodeURIComponent(output.path)}`)}
                download={output.name}
                className="rounded-lg bg-[#9fd4b4] px-3 py-1.5 font-mono text-[12px] font-bold uppercase tracking-wider text-[#0f2018]"
              >
                download {output.name}
              </a>
              {onOpenAudioPlayer && (
                <button
                  type="button"
                  onClick={() => onOpenAudioPlayer({ name: output.name, path: output.path })}
                  className="rounded-lg border border-[#4a3a31] px-3 py-1.5 font-mono text-[12px] uppercase tracking-wider text-[#c9b6a4] hover:border-[#e0a96d] hover:text-[#ffe0bd]"
                >
                  open in the workspace player
                </button>
              )}
            </div>
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
              onOpenAudioPlayer={onOpenAudioPlayer}
            />
          </div>
        )}
      </div>
    </ToolPageShell>
  )
}