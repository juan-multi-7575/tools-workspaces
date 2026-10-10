import type { ToolManifest } from '../../lib/api'
import { DEMUCS_ID, useDemucsManifest } from './demucsModel'
import DemucsHero from './DemucsHero'
import DemucsWorkspace from './DemucsWorkspace'
import './demucs.css'

export type DemucsSiteState = 'hero' | 'workspace'

export interface DemucsSiteProps {
  siteState: DemucsSiteState
  initialInputPath?: string
}

/**
 * The two states of the Demucs site. Both are full-viewport and neither carries
 * any Tools Garage chrome — the site's own top rule and its own home
 * affordance are the only navigation either of them has.
 */
export default function DemucsSite({ siteState, initialInputPath }: DemucsSiteProps) {
  const { manifest, error } = useDemucsManifest()

  if (error) {
    return (
      <div className="dm-root">
        <main className="dm-hero dm-hero--flat">
          <div className="dm-hero__inner">
            <h1 className="dm-hero__title">This site could not load its manifest.</h1>
            <pre className="dm-error__text">{error}</pre>
            <button type="button" className="dm-btn dm-btn--line" onClick={() => window.location.reload()}>
              Try again
            </button>
          </div>
        </main>
      </div>
    )
  }

  if (!manifest) return <DemucsLoading />

  const resolved = manifest as ToolManifest
  return siteState === 'hero' ? (
    <DemucsHero manifest={resolved} />
  ) : (
    <DemucsWorkspace manifest={resolved} initialInputPath={initialInputPath} />
  )
}

/** The manifest is one small request; this says so rather than showing blank. */
function DemucsLoading() {
  return (
    <div className="dm-root">
      <header className="dm-bar">
        <span className="dm-bar__mark">
          <span className="dm-bar__rule" aria-hidden="true" />
          AI Audio Stem Separator
        </span>
        <span className="dm-bar__id">{DEMUCS_ID}</span>
      </header>
      <main className="dm-hero dm-hero--flat">
        <div className="dm-hero__inner">
          <p className="dm-lede">Loading the manifest for {DEMUCS_ID}…</p>
        </div>
      </main>
    </div>
  )
}
