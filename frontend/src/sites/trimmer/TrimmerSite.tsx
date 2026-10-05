import type { ToolManifest } from '../../lib/api'
import { TRIMMER_ID, useTrimmerManifest } from './trimmerModel'
import TrimmerHero from './TrimmerHero'
import TrimmerWorkspace from './TrimmerWorkspace'
import './trimmer.css'

export type TrimmerState = 'hero' | 'workspace'

export interface TrimmerSiteProps {
  siteState: TrimmerState
  initialInputPath?: string
}

/**
 * The two states of the Trimmer site. Both are full-viewport and neither
 * carries any Tools Garage chrome — the site's own top rule and its own home
 * affordance are the only navigation either of them has.
 */
export default function TrimmerSite({ siteState, initialInputPath }: TrimmerSiteProps) {
  const { manifest, error } = useTrimmerManifest()

  if (error) {
    return (
      <div className="tr-root">
        <main className="tr-hero tr-hero--flat">
          <div>
            <h1 className="tr-hero__title">This site could not load its manifest.</h1>
            <pre className="tr-error__text">{error}</pre>
            <button type="button" className="tr-btn tr-btn--outline" onClick={() => window.location.reload()}>
              Try again
            </button>
          </div>
        </main>
      </div>
    )
  }

  if (!manifest) return <TrimmerLoading />

  const resolved = manifest as ToolManifest
  return siteState === 'hero' ? (
    <TrimmerHero manifest={resolved} />
  ) : (
    <TrimmerWorkspace manifest={resolved} initialInputPath={initialInputPath} />
  )
}

/** The manifest is one small request; this says so rather than showing blank. */
function TrimmerLoading() {
  return (
    <div className="tr-root">
      <header className="tr-bar">
        <span className="tr-bar__mark">
          <span className="tr-bar__dot" aria-hidden="true" />
          Media &amp; Audio Trimmer
        </span>
        <span className="tr-bar__id">{TRIMMER_ID}</span>
      </header>
      <main className="tr-hero tr-hero--flat">
        <p className="tr-lede" style={{ margin: 0 }}>
          Loading the manifest for <code>{TRIMMER_ID}</code>…
        </p>
      </main>
    </div>
  )
}