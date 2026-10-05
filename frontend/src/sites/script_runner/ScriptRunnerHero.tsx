import { useNavigate } from 'react-router-dom'
import type { ToolManifest } from '../../lib/api'

export default function ScriptRunnerHero({ manifest }: { manifest: ToolManifest }) {
  const navigate = useNavigate()
  return (
    <main className="sr-site sr-hero">
      <div className="sr-hero-top"><span>DEVELOPER TOOLS</span><span>{manifest.name}</span></div>
      <section className="sr-hero-content">
        <p className="sr-eyebrow">01 / EXECUTION ENVIRONMENT</p>
        <h1>Run what<br />you write.</h1>
        <p className="sr-hero-description">{manifest.description}</p>
        <div className="sr-hero-actions">
          <button type="button" className="sr-button sr-button-dark" onClick={() => navigate('/t/script_runner/workspace')}>Open workspace <span aria-hidden="true">↗</span></button>
          <button type="button" className="sr-button sr-button-light" onClick={() => navigate('/t/script_runner/workspace')}>Start with an empty editor <span aria-hidden="true">→</span></button>
        </div>
      </section>
      <aside className="sr-hero-mark" aria-hidden="true"><span>PY</span><i /><span>SH</span></aside>
      <div className="sr-hero-bottom"><span>PYTHON / BASH</span><span>LOCAL SCRIPT SESSION <b>↗</b></span></div>
    </main>
  )
}
