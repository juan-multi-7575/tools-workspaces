import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToolExecute } from '../../hooks/useToolExecute'
import { errorMessage, resolveUrl, type ToolManifest } from '../../lib/api'
import type { RunArtifact } from '../../lib/api'

interface FieldSpec {
  title?: string
  description?: string
  enum?: (string | number)[]
  default?: unknown
}

export default function CodecWorkspace({ manifest }: { manifest: ToolManifest }) {
  const navigate = useNavigate()
  const execute = useToolExecute('codec_tool')
  const schema = manifest.parameters_schema as Record<string, FieldSpec>
  const codecOptions = (schema.codec?.enum ?? []).map(String)
  const [params, setParams] = useState<Record<string, unknown>>({
    codec: schema.codec?.default ?? codecOptions[0] ?? '',
    text: '',
    input_path: '',
  })
  const update = (key: string, value: unknown) => {
    if (execute.state.phase !== 'idle') execute.reset()
    setParams((current) => ({ ...current, [key]: value }))
  }
  const outputData = execute.state.result?.status === 'completed' ? execute.state.result.data : null
  const output = outputData && typeof outputData.output === 'string' ? outputData.output : null
  const artifact = execute.state.result?.artifacts[0] as RunArtifact | undefined

  return (
    <main className="ct-workspace">
      <header className="ct-workspace__header">
        <button type="button" className="ct-home" onClick={() => navigate('/')}>← All tools</button>
        <span className="ct-wordmark">CODE / TRANSFORM</span>
        <span className="ct-workspace__serial">{manifest.id}</span>
      </header>

      <div className="ct-workspace__title"><div><p className="ct-kicker">ENCODER &amp; DECODER UTILITIES</p><h1>Make the conversion.</h1></div><p>{manifest.description}</p></div>

      <section className="ct-codec-control" data-param-key="codec" aria-label={schema.codec?.title ?? 'Codec Transformation'}>
        <div className="ct-section-label"><span>{schema.codec?.title ?? 'Codec Transformation'}</span><span>SELECT ONE</span></div>
        <div className="ct-codec-grid">
          {codecOptions.map((option) => (
            <button key={option} type="button" className="ct-codec-option" aria-pressed={params.codec === option} onClick={() => update('codec', option)}>
              <span className="ct-option-family">{option.split('_')[0]}</span><span className="ct-option-action">{option.split('_')[1]}</span><span className="ct-option-arrow" aria-hidden="true">↗</span>
            </button>
          ))}
        </div>
      </section>

      <div className="ct-panels">
        <section className="ct-panel ct-panel--input" data-param-key="text">
          <label className="ct-section-label" htmlFor="ct-input"><span>{schema.text?.title ?? 'Input Text'}</span><span>{String(params.text).length} CHARS</span></label>
          <textarea id="ct-input" value={String(params.text)} onChange={(event) => update('text', event.target.value)} spellCheck={false} autoCapitalize="off" autoComplete="off" />
          <p className="ct-panel__note">{schema.text?.description}</p>
        </section>
        <section className="ct-panel ct-panel--output" aria-label="Transformed output">
          <div className="ct-section-label"><span>Output specimen</span><span>{output === null ? '—' : 'RESULT'}</span></div>
          <div className="ct-output-specimen" aria-live="polite">
            {output === null ? <span className="ct-output-empty">The transformed text will appear here.</span> : <pre>{output}</pre>}
          </div>
          {output !== null && <div className="ct-output-meta"><span>CODEC <b>{String(outputData?.codec ?? '')}</b></span><span>LENGTH <b>{String(outputData?.length ?? '')}</b></span></div>}
        </section>
      </div>

      <section className="ct-file-control" data-param-key="input_path">
        <label className="ct-section-label" htmlFor="ct-file-path"><span>{schema.input_path?.title ?? 'Input File (Optional)'}</span><span>OPTIONAL</span></label>
        <input id="ct-file-path" type="text" value={String(params.input_path)} onChange={(event) => update('input_path', event.target.value)} />
        <p>{schema.input_path?.description}</p>
      </section>

      <div className="ct-run-row">
        <button type="button" className="ct-run" onClick={() => void execute.run(params)} disabled={execute.busy}>{execute.busy ? `Running · ${execute.state.elapsedSeconds.toFixed(1)}s` : 'Transform'} <span aria-hidden="true">→</span></button>
        <span className="ct-run-caption">{String(params.codec).replace('_', ' ')}</span>
        {artifact && <a className="ct-artifact" href={resolveUrl(`/api/artifacts/content?path=${encodeURIComponent(artifact.path)}`)} download={artifact.name}>{artifact.name} ↓</a>}
      </div>

      {execute.state.error && <pre className="ct-error" role="alert">{errorMessage(execute.state.error)}</pre>}
      {execute.state.result?.status === 'completed' && output === null && <p className="ct-error">The completed response contains no output field.</p>}
    </main>
  )
}
