import { useNavigate } from 'react-router-dom'
import type { ToolManifest } from '../../lib/api'

export default function CodecHero({ manifest }: { manifest: ToolManifest }) {
  const navigate = useNavigate()
  return (
    <main className="ct-hero">
      <div className="ct-hero__masthead"><span>CODE / TRANSFORM</span><span>{manifest.name}</span></div>
      <div className="ct-hero__body">
        <p className="ct-kicker">A small set of reversible text transformations</p>
        <h1>Text in.<br /><span>Changed form.</span></h1>
        <p className="ct-hero__lede">{manifest.description}</p>
        <div className="ct-hero__actions">
          <button type="button" className="ct-button ct-button--dark" onClick={() => navigate('/t/codec_tool/workspace')}>Open the workspace <span aria-hidden="true">↗</span></button>
          <button type="button" className="ct-button ct-button--line" onClick={() => navigate('/t/codec_tool/workspace')}>Start with an empty input <span aria-hidden="true">→</span></button>
        </div>
      </div>
      <div className="ct-hero__specimen" aria-hidden="true">
        <span className="ct-hero__index">SPECIMEN 001 — TRANSFORMATION</span>
        <div className="ct-hero__glyph">Aa<span>→</span>01</div>
        <div className="ct-hero__rule"><span>BASE64</span><span>HEX</span><span>URL</span></div>
      </div>
      <div className="ct-hero__footer"><span>INPUT / OUTPUT</span><span>01 — 06</span></div>
    </main>
  )
}
