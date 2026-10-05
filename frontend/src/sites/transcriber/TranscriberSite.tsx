import type { ToolManifest } from '../../lib/api'
import { TRANSCRIBER_ID, useTranscriberManifest } from './transcriberModel'
import TranscriberHero from './TranscriberHero'
import TranscriberWorkspace from './TranscriberWorkspace'
import './transcriber.css'

export type TranscriberSiteState = 'hero' | 'workspace'

export interface TranscriberSiteProps {
  siteState: TranscriberSiteState
  initialInputPath?: string
}

/**
 * The two states of the Transcriber site. Both are full-viewport and neither
 * carries any Tools Garage chrome — the site's own top rule and its own home
 * affordance are the only navigation either of them has.
 */
export default function TranscriberSite({ siteState, initialInputPath }: TranscriberSiteProps) {
  const { manifest, error } = useTranscriberManifest()

  if (error) {
    return (
      <div className="tc-root">
        <main className="tc-hero tc-hero--flat">
          <div className="tc-hero__inner">
            <h1 className="tc-hero__title">This site could not load its manifest.</h1>
            <pre className="tc-error__text">{error}</pre>
            <button type="button" className="tc-btn tc-btn--outline" onClick={() => window.location.reload()}>
              Try again
            </button>
          </div>
        </main>
      </div>
    )
  }

  if (!manifest) return <TranscriberLoading />

  const resolved = manifest as ToolManifest
  return siteState === 'hero' ? (
    <TranscriberHero manifest={resolved} />
  ) : (
    <TranscriberWorkspace manifest={resolved} initialInputPath={initialInputPath} />
  )
}

/** The manifest is one small request; this says so rather than showing blank. */
function TranscriberLoading() {
  return (
    <div className="tc-root">
      <header className="tc-bar">
        <span className="tc-bar__mark">
          <span className="tc-bar__rule" aria-hidden="true" />
          Audio to Text &amp; Subtitles
        </span>
        <span className="tc-bar__id">{TRANSCRIBER_ID}</span>
      </header>
      <main className="tc-hero tc-hero--flat">
        <div className="tc-hero__inner">
          <p className="tc-lede">Loading the manifest for {TRANSCRIBER_ID}…</p>
        </div>
      </main>
    </div>
  )
}
