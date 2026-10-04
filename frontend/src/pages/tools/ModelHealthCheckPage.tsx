import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Gauge,
  KeyRound,
  Loader2,
  Play,
  Radar,
  ShieldAlert,
  TerminalSquare,
} from 'lucide-react'
import ToolPageShell from '../../components/tools/ToolPageShell'
import ToolResultPanel from '../../components/tools/ToolResultPanel'
import DynamicForm from '../../components/common/DynamicForm'
import { ToolForm } from '../../lib/toolForms'
import { api, errorMessage } from '../../lib/api'
import { useToolExecute } from '../../hooks/useToolExecute'
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

/** Keys `ModelHealthCheckForm` binds through its own controls. */
const HEALTH_FORM_KEYS = new Set(['provider', 'model', 'models', 'api_key', 'mock_offline'])

interface HealthRow {
  provider_id?: string
  provider_name?: string
  model?: string
  status?: string
  latency_ms?: number
  error?: string | null
  tests_passed?: string[]
  tests_failed?: string[]
  response_snippet?: string
}

function statusTone(status: string): { dot: string; chip: string; label: string } {
  switch (status) {
    case 'HEALTHY':
      return { dot: 'bg-emerald-400', chip: 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300', label: 'text-emerald-300' }
    case 'FAILED':
    case 'AUTH_ERROR':
      return { dot: 'bg-red-400', chip: 'border-red-500/50 bg-red-500/15 text-red-300', label: 'text-red-300' }
    case 'TIMEOUT':
      return { dot: 'bg-amber-400', chip: 'border-amber-500/50 bg-amber-500/15 text-amber-300', label: 'text-amber-300' }
    case 'UNCONFIGURED':
      return { dot: 'bg-neutral-500', chip: 'border-neutral-600/60 bg-neutral-700/40 text-neutral-400', label: 'text-neutral-400' }
    default:
      return { dot: 'bg-neutral-600', chip: 'border-neutral-700 bg-neutral-800 text-neutral-400', label: 'text-neutral-400' }
  }
}

/**
 * Model health check — a dense fleet telemetry board. Every tile and every row
 * is computed from `data.summary` / `data.results` of a verified completed
 * response; nothing is estimated, averaged across runs, or filled in.
 */
export default function ModelHealthCheckPage({
  manifest,
  initialParams,
  onComplete,
}: ToolPageProps) {
  const schema = useMemo(
    () => (manifest.parameters_schema ?? {}) as Record<string, FieldSpec>,
    [manifest.parameters_schema],
  )
  const execute = useToolExecute('sys.health.check')
  const [params, setParams] = useState<Record<string, unknown>>({ ...initialParams })

  const [credentials, setCredentials] = useState<{ providers: string[]; error: string | null } | null>(null)
  const [catalog, setCatalog] = useState<{ providers: Record<string, unknown>; local: string[] } | null>(null)
  const [credsError, setCredsError] = useState<string | null>(null)
  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({})
  const [keyState, setKeyState] = useState<Record<string, 'saving' | 'saved' | 'error'>>({})
  const [keyErrors, setKeyErrors] = useState<Record<string, string>>({})

  // The shared form does not bind `fetch_live_models`; render that remainder
  // generically. DynamicForm is used directly because ToolForm routes
  // `sys.health.check` back to ModelHealthCheckForm, which would duplicate the
  // whole provider picker rather than render just the complement.
  const complementSchema = useMemo(() => {
    const rest: Record<string, unknown> = {}
    for (const [key, spec] of Object.entries(schema)) {
      if (!HEALTH_FORM_KEYS.has(key)) rest[key] = spec
    }
    return rest
  }, [schema])

  const loadCredentials = async () => {
    try {
      const [keys, providers] = await Promise.all([api.listKeys(), api.listProviders()])
      setCredentials({ providers: keys.providers ?? [], error: null })
      setCatalog({ providers: providers.providers ?? {}, local: providers.local_models ?? [] })
      setCredsError(null)
    } catch (err) {
      setCredsError(errorMessage(err) || String(err))
    }
  }

  useEffect(() => {
    void loadCredentials()
  }, [])

  const result = execute.state.result
  const completed = result?.status === 'completed'
  const data = result?.data ?? null

  const rows = useMemo<HealthRow[]>(
    () => (completed && Array.isArray(data?.results) ? (data.results as HealthRow[]) : []),
    [completed, data],
  )
  const summary = completed && data && typeof data.summary === 'object' && data.summary ? data.summary : null
  const timestamp = completed && data && typeof data.timestamp === 'string' ? data.timestamp : null

  const maxLatency = useMemo(
    () => rows.reduce((max, row) => Math.max(max, Number(row.latency_ms) || 0), 0),
    [rows],
  )

  const saveKey = async (providerId: string) => {
    const key = (keyDrafts[providerId] ?? '').trim()
    if (!key) return
    setKeyState((prev) => ({ ...prev, [providerId]: 'saving' }))
    try {
      await api.saveKey(providerId, key)
      setKeyState((prev) => ({ ...prev, [providerId]: 'saved' }))
      setKeyErrors((prev) => ({ ...prev, [providerId]: '' }))
      setKeyDrafts((prev) => ({ ...prev, [providerId]: '' }))
      await loadCredentials()
    } catch (err) {
      setKeyState((prev) => ({ ...prev, [providerId]: 'error' }))
      setKeyErrors((prev) => ({ ...prev, [providerId]: errorMessage(err) || String(err) }))
    }
  }

  const run = async () => {
    const res = await execute.run(params)
    if (res?.status === 'completed') onComplete?.(res, params)
  }

  const summaryTiles = summary
    ? ([
        { label: 'total probed', value: summary.total_probed, tone: 'text-neutral-200' },
        { label: 'healthy', value: summary.healthy, tone: 'text-emerald-300' },
        { label: 'unconfigured', value: summary.unconfigured, tone: 'text-neutral-400' },
        { label: 'failed', value: summary.failed, tone: 'text-red-300' },
        { label: 'health %', value: `${summary.health_percentage}%`, tone: 'text-emerald-300' },
      ] as const)
    : []

  return (
    <ToolPageShell
      manifest={manifest}
      headerActions={
        <span className="inline-flex items-center gap-1.5 rounded border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-sky-300">
          <Radar className="size-3" /> fleet telemetry
        </span>
      }
    >
      <div className="space-y-4">
        {execute.state.error && (
          <div role="alert" className="rounded-lg border border-red-500/50 bg-red-500/10 p-3">
            <p className="mb-1 flex items-center gap-1.5 font-mono text-[11px] font-bold text-red-300">
              <AlertTriangle className="size-3.5" /> The backend reported:
            </p>
            <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-neutral-200">
              {execute.state.error}
            </pre>
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
          {/* ── CONTROL COLUMN ───────────────────────────────────────── */}
          <div className="space-y-4">
            <section className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
              <div className="mb-2.5 flex items-center justify-between">
                <h2 className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-sky-300">
                  <Activity className="size-3" /> probe
                </h2>
                <button
                  type="button"
                  onClick={() => void run()}
                  disabled={execute.busy}
                  className="inline-flex items-center gap-1.5 rounded bg-sky-500/20 px-2.5 py-1 font-mono text-[11px] font-bold text-sky-300 hover:bg-sky-500/30 disabled:opacity-40"
                >
                  {execute.busy ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3" />}
                  {execute.busy ? `sweeping · ${execute.state.elapsedSeconds.toFixed(1)}s` : 'run sweep'}
                </button>
              </div>
              <ToolForm
                toolId="sys.health.check"
                schema={schema as Record<string, unknown>}
                value={params}
                onChange={setParams}
                disabled={execute.busy}
              />
            </section>

            {Object.keys(complementSchema).length > 0 && (
              <section className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
                <h2 className="mb-2.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">
                  <TerminalSquare className="size-3" /> remaining manifest keys
                </h2>
                <fieldset disabled={execute.busy} className="min-w-0">
                  <DynamicForm schema={complementSchema} value={params} onChange={setParams} />
                </fieldset>
              </section>
            )}

            {/* ── CREDENTIAL REGISTRY ─────────────────────────────── */}
            <section className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">
                  <KeyRound className="size-3" /> stored keys
                </h2>
                <button
                  type="button"
                  onClick={() => void loadCredentials()}
                  className="font-mono text-[10px] text-sky-400 hover:text-sky-300"
                >
                  refresh
                </button>
              </div>

              {credsError && <p className="font-mono text-[10px] leading-relaxed text-red-300">{credsError}</p>}
              {!credentials && !credsError && <p className="font-mono text-[10px] text-neutral-600">loading…</p>}

              {credentials && (
                <>
                  <p className="mb-2 font-mono text-[10px] text-neutral-500">
                    {credentials.providers.length} provider{credentials.providers.length === 1 ? '' : 's'} hold a
                    stored key
                    {catalog ? ` · ${Object.keys(catalog.providers).length} in catalog` : ''}
                    {catalog ? ` · ${catalog.local.length} local models` : ''}
                  </p>
                  <ul className="space-y-1">
                    {credentials.providers.map((providerId) => (
                      <li key={providerId} className="flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300">
                          <CheckCircle2 className="size-2.5" /> {providerId}
                        </span>
                        <input
                          type="password"
                          value={keyDrafts[providerId] ?? ''}
                          onChange={(e) => setKeyDrafts((prev) => ({ ...prev, [providerId]: e.target.value }))}
                          placeholder="replace…"
                          className="min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-900 px-1.5 py-0.5 font-mono text-[10px] text-neutral-200 focus:border-sky-500/60 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => void saveKey(providerId)}
                          disabled={keyState[providerId] === 'saving' || !(keyDrafts[providerId] ?? '').trim()}
                          className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-[10px] text-neutral-300 hover:bg-sky-500/30 disabled:opacity-30"
                        >
                          {keyState[providerId] === 'saving' ? '…' : 'save'}
                        </button>
                      </li>
                    ))}
                    {credentials.providers.length === 0 && (
                      <li className="flex items-center gap-1.5 font-mono text-[10px] text-amber-300">
                        <ShieldAlert className="size-3" /> no stored keys — providers will report UNCONFIGURED
                      </li>
                    )}
                  </ul>
                  {Object.entries(keyErrors)
                    .filter(([, message]) => message)
                    .map(([providerId, message]) => (
                      <p key={providerId} className="mt-1 font-mono text-[10px] text-red-300">
                        {providerId}: {message}
                      </p>
                    ))}
                </>
              )}
            </section>

            <dl className="space-y-1 rounded-lg border border-neutral-800 bg-neutral-950 p-3 font-mono text-[11px] text-neutral-500">
              <div className="flex justify-between">
                <dt>phase</dt>
                <dd className="font-bold text-neutral-200">{execute.state.phase}</dd>
              </div>
              <div className="flex justify-between">
                <dt>measured</dt>
                <dd className="font-bold text-neutral-200">{execute.state.elapsedSeconds.toFixed(1)}s</dd>
              </div>
              <div className="flex justify-between">
                <dt>report timestamp</dt>
                <dd className="font-bold text-neutral-200">{timestamp ?? '—'}</dd>
              </div>
            </dl>
          </div>

          {/* ── TELEMETRY BOARD ─────────────────────────────────────── */}
          <div className="space-y-4">
            {summaryTiles.length > 0 && (
              <section className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-neutral-800 bg-neutral-800 sm:grid-cols-5">
                {summaryTiles.map((tile) => (
                  <div key={tile.label} className="bg-neutral-950 px-3 py-2.5">
                    <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-neutral-600">{tile.label}</p>
                    <p className={`font-mono text-lg font-bold leading-tight ${tile.tone}`}>{String(tile.value ?? '—')}</p>
                  </div>
                ))}
              </section>
            )}

            <section className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950">
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800 bg-neutral-900 px-3 py-2">
                <h2 className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-sky-300">
                  <Gauge className="size-3" /> probe matrix
                </h2>
                <span className="font-mono text-[10px] text-neutral-500">
                  {completed ? `${rows.length} rows returned` : execute.state.phase === 'executing' ? 'sweeping…' : 'no run yet'}
                </span>
              </header>

              {rows.length === 0 ? (
                <p className="px-3 py-12 text-center font-mono text-xs text-neutral-600">
                  {execute.state.phase === 'idle'
                    ? 'Run a sweep. Rows appear only after the backend returns data.results.'
                    : execute.state.phase === 'executing'
                      ? `Probing — ${execute.state.elapsedSeconds.toFixed(1)}s measured.`
                      : execute.state.phase === 'completed'
                        ? 'The run completed but returned no data.results array.'
                        : 'No telemetry to display.'}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] border-collapse font-mono text-[11px]">
                    <thead>
                      <tr className="border-b border-neutral-800 text-left text-[9px] uppercase tracking-[0.18em] text-neutral-600">
                        <th className="px-3 py-1.5 font-normal">model</th>
                        <th className="px-3 py-1.5 font-normal">provider</th>
                        <th className="px-3 py-1.5 font-normal">status</th>
                        <th className="px-3 py-1.5 text-right font-normal">pass</th>
                        <th className="px-3 py-1.5 text-right font-normal">fail</th>
                        <th className="px-3 py-1.5 font-normal">latency</th>
                        <th className="px-3 py-1.5 font-normal">detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, index) => {
                        const status = String(row.status ?? 'UNKNOWN')
                        const tone = statusTone(status)
                        const latency = Number(row.latency_ms) || 0
                        const passed = Array.isArray(row.tests_passed) ? row.tests_passed : []
                        const failedTests = Array.isArray(row.tests_failed) ? row.tests_failed : []
                        return (
                          <tr
                            key={`${row.provider_id ?? 'p'}-${row.model ?? 'm'}-${index}`}
                            className="border-b border-neutral-900 align-top hover:bg-neutral-900/50"
                          >
                            <td className="max-w-[190px] truncate px-3 py-2 text-neutral-200" title={row.model}>
                              {row.model ?? '—'}
                            </td>
                            <td className="px-3 py-2 text-neutral-500">{row.provider_name ?? row.provider_id ?? '—'}</td>
                            <td className="px-3 py-2">
                              <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 ${tone.chip}`}>
                                <span className={`size-1.5 rounded-full ${tone.dot}`} />
                                {status}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right text-emerald-400">{passed.length}</td>
                            <td className="px-3 py-2 text-right text-red-400">{failedTests.length}</td>
                            <td className="px-3 py-2 text-neutral-400">
                              <div className="flex items-center gap-1.5">
                                <span className="w-14 text-right">{latency > 0 ? `${latency.toFixed(1)}ms` : '—'}</span>
                                <span className="h-1 w-14 overflow-hidden rounded bg-neutral-800">
                                  <span
                                    className={`block h-full ${tone.dot}`}
                                    style={{ width: `${maxLatency ? Math.min(100, (latency / maxLatency) * 100) : 0}%` }}
                                  />
                                </span>
                              </div>
                            </td>
                            <td className="max-w-[260px] px-3 py-2">
                              {row.error ? (
                                <span className="break-words text-red-300">{row.error}</span>
                              ) : failedTests.length > 0 ? (
                                <span className="break-words text-amber-300">{failedTests.join(' · ')}</span>
                              ) : passed.length > 0 ? (
                                <span className="break-words text-neutral-500">{passed.join(' · ')}</span>
                              ) : (
                                <span className="text-neutral-700">—</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {execute.state.phase !== 'idle' && (
              <ToolResultPanel state={execute.state} toolId="sys.health.check" toolName={manifest.name} onRerun={execute.reset} />
            )}

            <p className="font-mono text-[10px] text-brand-caramel-text">
              {Object.keys(schema).length} manifest keys on this page: {Object.keys(schema).join(', ')} ·{' '}
              {Object.keys(complementSchema).length} rendered outside the shared form
            </p>
          </div>
        </div>
      </div>
    </ToolPageShell>
  )
}