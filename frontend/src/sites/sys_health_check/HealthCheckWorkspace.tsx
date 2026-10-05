import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToolExecute } from '../../hooks/useToolExecute'
import { useToolDeps } from '../../hooks/useToolDeps'
import DependencyGate from '../../components/deps/DependencyGate'
import type { ToolManifest } from '../../lib/api'
import { healthRowError } from './healthCheckData'

interface FieldSpec { type?: string; title?: string; description?: string; enum?: (string | number)[]; enumLabels?: Record<string, string>; default?: unknown; placeholder?: string; widget?: string }
type HealthRow = Record<string, unknown> & { model?: string; provider?: string; provider_id?: string; provider_name?: string; status?: string; latency_ms?: number; tests_passed?: string[]; tests_failed?: string[]; error?: unknown }

function statusClass(status: unknown) {
  const normalized = String(status ?? '').toLowerCase()
  if (['healthy', 'ok', 'passed', 'success'].includes(normalized)) return 'mh-status-good'
  if (['unconfigured', 'skipped', 'unknown'].includes(normalized)) return 'mh-status-muted'
  if (['failed', 'error', 'unhealthy', 'timeout'].includes(normalized)) return 'mh-status-bad'
  return 'mh-status-neutral'
}

export default function HealthCheckWorkspace({ manifest }: { manifest: ToolManifest }) {
  const navigate = useNavigate()
  const schema = manifest.parameters_schema as Record<string, FieldSpec>
  const execute = useToolExecute('sys.health.check')
  const deps = useToolDeps('sys.health.check')
  const [params, setParams] = useState<Record<string, unknown>>(() => Object.fromEntries(Object.entries(schema).map(([key, spec]) => [key, spec.default ?? (spec.type === 'boolean' ? false : '')])))
  const data = execute.state.result?.data
  const rows = useMemo(() => Array.isArray(data?.results) ? data.results as HealthRow[] : [], [data])
  const summary = data?.summary && typeof data.summary === 'object' ? data.summary as Record<string, unknown> : null
  const maxLatency = rows.reduce((max, row) => Math.max(max, Number(row.latency_ms) || 0), 0)
  const setParam = (key: string, value: unknown) => {
    execute.reset()
    setParams((current) => ({ ...current, [key]: value }))
  }
  return (
    <div className="mh-site mh-workspace">
      <header className="mh-header">
        <button type="button" className="mh-home" onClick={() => navigate('/')}>← <span>All tools</span></button>
        <div className="mh-wordmark"><span className="mh-mark"><i /></span>Model health</div>
        <span className="mh-header-id">{manifest.id}</span>
      </header>
      <main className="mh-main">
        <div className="mh-title-row"><div><p className="mh-kicker">WORKSPACE / PROBE CONFIGURATION</p><h1>Provider telemetry</h1></div><p className="mh-description">Select a target, run its checks, and inspect the returned response.</p></div>
        <div className="mh-board">
          <section className="mh-controls" aria-label="Probe configuration">
            <div className="mh-section-head"><span className="mh-section-index">01</span><h2>Provider / model matrix</h2></div>
            <div className="mh-form">
              {Object.entries(schema).map(([key, spec]) => {
                const id = `mh-${key}`
                const title = spec.title ?? key
                const value = params[key]
                return <div key={key} className="mh-field" data-param-key={key}>
                  {spec.type === 'boolean' ? <label className="mh-toggle-row" htmlFor={id}><span><strong>{title}</strong>{spec.description && <small>{spec.description}</small>}</span><input id={id} type="checkbox" checked={Boolean(value)} onChange={(event) => setParam(key, event.target.checked)} disabled={execute.busy} /></label> : <>
                    <label htmlFor={id}>{title}</label>
                    {spec.description && <small>{spec.description}</small>}
                    {spec.enum?.length ? <select id={id} value={String(value ?? '')} onChange={(event) => setParam(key, event.target.value)} disabled={execute.busy}>{spec.enum.map((option) => <option key={String(option)} value={String(option)}>{spec.enumLabels?.[String(option)] ?? String(option)}</option>)}</select> : <input id={id} type={spec.widget === 'secret' ? 'password' : 'text'} value={String(value ?? '')} placeholder={spec.placeholder ?? ''} onChange={(event) => setParam(key, event.target.value)} disabled={execute.busy} />}
                  </>}
                </div>
              })}
            </div>
            <div className="mh-gate"><DependencyGate toolId="sys.health.check" state={deps} accent="#5E6AD2" /></div>
            {execute.state.error && <pre className="mh-error" role="alert">{execute.state.error}</pre>}
            <button className="mh-run" type="button" disabled={!deps.ready || execute.busy} onClick={() => void execute.run(params)}>{execute.busy ? `Probing · ${execute.state.elapsedSeconds.toFixed(1)}s` : 'Run health probe'} <span>↗</span></button>
          </section>
          <section className="mh-results" aria-label="Probe results">
            <div className="mh-section-head mh-results-head"><span className="mh-section-index">02</span><h2>Probe results</h2><span className="mh-live-tag"><i /> {execute.state.phase === 'executing' ? 'RUNNING' : execute.state.phase === 'completed' ? 'RESPONSE' : 'AWAITING RUN'}</span></div>
            {summary && <div className="mh-summary" aria-label="Run summary">{Object.entries(summary).map(([key, value]) => <div className="mh-summary-cell" key={key}><span>{key.replaceAll('_', ' ')}</span><strong>{String(value ?? '—')}</strong></div>)}</div>}
            {rows.length ? <div className="mh-table-wrap"><table className="mh-table"><thead><tr><th>Model</th><th>Provider</th><th>Status</th><th>Pass</th><th>Fail</th><th>Latency</th><th>Detail</th></tr></thead><tbody>{rows.map((row, index) => {
              const status = String(row.status ?? 'UNKNOWN')
              const passed = Array.isArray(row.tests_passed) ? row.tests_passed : []
              const failed = Array.isArray(row.tests_failed) ? row.tests_failed : []
              const detail = healthRowError(row.error) || [passed.length ? `passed: ${passed.join(', ')}` : '', failed.length ? `failed: ${failed.join(', ')}` : ''].filter(Boolean).join(' · ')
              const latency = Number(row.latency_ms) || 0
              const hasLatency = row.latency_ms !== null && row.latency_ms !== undefined && Number.isFinite(Number(row.latency_ms))
              const tone = statusClass(status)
              return <tr key={`${row.provider_id ?? row.provider ?? 'provider'}-${row.model ?? 'model'}-${index}`} className={tone}>
                <td className="mh-model" title={String(row.model ?? '')}>{row.model ?? '—'}</td><td className="mh-provider" title={String(row.provider_name ?? row.provider_id ?? row.provider ?? '')}><span className="mh-provider-dot" />{row.provider_name ?? row.provider_id ?? row.provider ?? '—'}</td>
                <td><span className="mh-status">{status}</span></td><td className="mh-number">{passed.length}</td><td className="mh-number">{failed.length}</td>
                <td><div className="mh-latency"><span>{hasLatency ? `${latency.toFixed(1)}ms` : '—'}</span><i><b style={{ width: `${maxLatency ? Math.max(2, (latency / maxLatency) * 100) : 0}%` }} /></i></div></td><td className="mh-detail" title={detail}>{detail || '—'}</td>
              </tr>
            })}</tbody></table></div> : <div className="mh-empty">{execute.state.phase === 'executing' ? `Probe in progress · ${execute.state.elapsedSeconds.toFixed(1)}s measured` : execute.state.phase === 'completed' ? 'The response contains no results rows.' : execute.state.phase === 'failed' ? 'The request failed before a result table was returned.' : 'Run a probe to populate the response table.'}</div>}
          </section>
        </div>
      </main>
      <footer className="mh-footer"><span>MODEL HEALTH CHECK</span><span>{manifest.name}</span></footer>
    </div>
  )
}
