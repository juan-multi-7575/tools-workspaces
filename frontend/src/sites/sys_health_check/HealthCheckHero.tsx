import { useNavigate } from 'react-router-dom'
import type { ToolManifest } from '../../lib/api'

export default function HealthCheckHero({ manifest }: { manifest: ToolManifest }) {
  const navigate = useNavigate()
  return (
    <main className="mh-site mh-hero">
      <div className="mh-hero-top"><span className="mh-mark"><i /> MODEL SYSTEMS</span><span>DIAGNOSTICS / 01</span></div>
      <section className="mh-hero-main">
        <p className="mh-kicker">MODEL HEALTH &amp; LATENCY</p>
        <h1>Know what<br />answers.</h1>
        <p className="mh-hero-copy">{manifest.description}</p>
        <div className="mh-hero-actions">
          <button type="button" className="mh-button mh-button-primary" onClick={() => navigate('/t/sys.health.check/workspace')}>Open probe workspace <span>↗</span></button>
          <button type="button" className="mh-button mh-button-quiet" onClick={() => navigate('/t/sys.health.check/workspace')}>Configure a model check <span>→</span></button>
        </div>
      </section>
      <div className="mh-hero-art" aria-hidden="true"><div className="mh-orbit mh-orbit-one"/><div className="mh-orbit mh-orbit-two"/><div className="mh-orbit-core">{manifest.id}</div><span className="mh-art-label mh-art-a">PROVIDER / MODEL</span><span className="mh-art-label mh-art-b">STATUS / LATENCY</span></div>
      <div className="mh-hero-bottom"><span>LIVE PROVIDER PROBES</span><span>RESPONSE DATA / 0x01</span></div>
    </main>
  )
}
