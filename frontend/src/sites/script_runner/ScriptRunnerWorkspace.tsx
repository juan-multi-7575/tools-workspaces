import { useMemo, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToolExecute } from '../../hooks/useToolExecute'
import { useToolDeps } from '../../hooks/useToolDeps'
import DependencyGate from '../../components/deps/DependencyGate'
import { resolveUrl, type ToolManifest } from '../../lib/api'

interface FieldSpec { type?: string; title?: string; description?: string; enum?: (string | number)[]; default?: unknown }

export function isScriptRunFailure(status: string | undefined, exitCode: number | null) {
  return status === 'failed' || (exitCode !== null && exitCode !== 0)
}

export default function ScriptRunnerWorkspace({ manifest }: { manifest: ToolManifest }) {
  const navigate = useNavigate()
  const schema = manifest.parameters_schema as Record<string, FieldSpec>
  const execute = useToolExecute('script_runner')
  const deps = useToolDeps('script_runner')
  const [params, setParams] = useState<Record<string, unknown>>(() => ({
    ...Object.fromEntries(Object.entries(schema).map(([key, spec]) => [key, spec.default ?? ''])),
    code: '',
  }))
  const [activeLine, setActiveLine] = useState(1)
  const code = String(params.code ?? '')
  const lines = useMemo(() => code.split('\n'), [code])
  const language = String(params.language ?? schema.language?.enum?.[0] ?? 'python')
  const result = execute.state.result
  const completed = result?.status === 'completed'
  const stdout = completed && typeof result.data?.stdout === 'string' ? result.data.stdout : ''
  const stderr = completed && typeof result.data?.stderr === 'string' ? result.data.stderr : ''
  const exitCode = completed && typeof result.data?.exit_code === 'number' ? result.data.exit_code : null
  const failed = isScriptRunFailure(result?.status, exitCode)
  const setParam = (key: string, value: unknown) => {
    if (execute.state.phase !== 'idle') execute.reset()
    setParams((current) => ({ ...current, [key]: value }))
  }
  const run = () => {
    // The shared execute route replaces an empty code string with the manifest
    // sample before the tool sees it; whitespace preserves the empty-editor
    // validation path because the backend rejects code whose stripped value is empty.
    void execute.run({ ...params, code: code.trim() ? code : ' ' })
  }

  return (
    <div className="sr-site sr-workspace">
      <header className="sr-header">
        <button type="button" className="sr-home" onClick={() => navigate('/')}>← <span>All tools</span></button>
        <div className="sr-header-center"><span className="sr-logo">S</span><span>Script Runner</span></div>
        <span className="sr-header-id">{manifest.id}</span>
      </header>
      <main className="sr-work-area">
        <div className="sr-work-title"><div><p className="sr-eyebrow">WORKSPACE / 01</p><h1>New execution</h1></div><p>Choose a runtime, write a script, and review its output.</p></div>
        <section className="sr-editor-card" aria-label="Script editor">
          <div className="sr-editor-toolbar">
            <div className="sr-file-tab"><span className="sr-file-dot" />{language === 'python' ? 'untitled.py' : 'untitled.sh'}</div>
            <div className="sr-runtime" data-param-key="language">
              <label htmlFor="sr-language">{schema.language?.title ?? 'Language'}</label>
              <select id="sr-language" value={language} onChange={(event) => setParam('language', event.target.value)} disabled={execute.busy}>
                {(schema.language?.enum ?? []).map((option) => <option key={String(option)} value={String(option)}>{String(option)}</option>)}
              </select>
            </div>
          </div>
          {schema.language?.description && <p className="sr-field-description">{schema.language.description}</p>}
          <div className="sr-editor" data-param-key="code">
            <label className="sr-visually-hidden" htmlFor="sr-code">{schema.code?.title ?? 'Code'}</label>
            <div className="sr-gutter" aria-hidden="true">{lines.map((_, index) => <span key={index} className={activeLine === index + 1 ? 'is-active' : ''}>{index + 1}</span>)}</div>
            <textarea
              id="sr-code"
              aria-label={schema.code?.title ?? 'Code'}
              value={code}
              onChange={(event) => {
                setParam('code', event.target.value)
                setActiveLine(event.target.value.slice(0, event.target.selectionStart).split('\n').length)
              }}
              onClick={(event) => setActiveLine(event.currentTarget.value.slice(0, event.currentTarget.selectionStart).split('\n').length)}
              onKeyUp={(event) => setActiveLine(event.currentTarget.value.slice(0, event.currentTarget.selectionStart).split('\n').length)}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              disabled={execute.busy}
              placeholder=""
              style={{ '--sr-active-line': activeLine } as CSSProperties}
            />
          </div>
          {schema.code?.description && <p className="sr-field-description">{schema.code.description}</p>}
          <div className="sr-options">
            <div className="sr-option" data-param-key="custom_args">
              <label htmlFor="sr-custom-args">{schema.custom_args?.title ?? 'Custom arguments'}</label>
              <input id="sr-custom-args" type="text" value={String(params.custom_args ?? '')} onChange={(event) => setParam('custom_args', event.target.value)} disabled={execute.busy} />
              {schema.custom_args?.description && <p>{schema.custom_args.description}</p>}
            </div>
            <div className="sr-option sr-timeout" data-param-key="timeout">
              <label htmlFor="sr-timeout">{schema.timeout?.title ?? 'Timeout'}</label>
              <div><input id="sr-timeout" type="number" min="1" max="3600" value={String(params.timeout ?? '')} onChange={(event) => setParam('timeout', Number(event.target.value))} disabled={execute.busy} /><span>s</span></div>
              {schema.timeout?.description && <p>{schema.timeout.description}</p>}
            </div>
          </div>
        </section>
        <section className="sr-console" aria-label="Execution console" aria-live="polite">
          <div className="sr-console-head"><h2>Console</h2>{execute.busy && <span>{execute.state.elapsedSeconds.toFixed(1)}s elapsed</span>}{completed && <span className={failed ? 'sr-status-fail' : 'sr-status-ok'}>{failed ? 'FAILED' : 'COMPLETED'} · exit {exitCode}</span>}{result?.status === 'failed' && <span className="sr-status-fail">FAILED</span>}</div>
          {execute.state.phase === 'idle' && <p className="sr-console-empty">Output will appear here after execution.</p>}
          {execute.state.phase === 'executing' && <p className="sr-console-empty">Running {language} script…</p>}
          {result?.status === 'failed' && <div className="sr-stderr"><span>stderr</span><pre role="alert">{execute.state.error ?? ''}</pre></div>}
          {completed && <div className="sr-streams"><div><h3>stdout</h3><pre>{stdout}</pre></div><div className={stderr ? 'sr-stderr' : ''}><h3>stderr</h3><pre>{stderr}</pre></div></div>}
          {result?.artifacts.length ? <div className="sr-artifacts">{result.artifacts.map((artifact) => <a key={artifact.path} href={resolveUrl(`/api/artifacts/content?path=${encodeURIComponent(artifact.path)}`)} download={artifact.name}>{artifact.name} ↓</a>)}</div> : null}
        </section>
      </main>
      <footer className="sr-action-bar">
        <div className="sr-gate"><DependencyGate toolId="script_runner" state={deps} /></div>
        <div className="sr-actions">
          {execute.busy ? <button type="button" className="sr-run-button" onClick={execute.cancel}>Cancel run <span>■</span></button> : <button type="button" className="sr-run-button" onClick={run} disabled={!deps.ready}>Run script <span>↗</span></button>}
          <span className="sr-action-runtime">{language === 'python' ? 'Python' : 'Shell'} · {String(params.timeout)} s</span>
        </div>
      </footer>
    </div>
  )
}
