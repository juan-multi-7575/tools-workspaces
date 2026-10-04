import type { ToolManifest } from '../../lib/api'
import { IMAGEMAGICK_ID, useImageMagickManifest } from './imagemagickManifest'
import ImageMagickHero from './ImageMagickHero'
import ImageMagickWorkspace from './ImageMagickWorkspace'
import './imagemagick.css'

export type ImageMagickState = 'hero' | 'workspace'

export interface ImageMagickSiteProps {
  siteState: ImageMagickState
  initialInputPath?: string
}

/**
 * The two states of the Image Converter site. Both are full-viewport and both
 * carry no Tools Garage chrome — the site's own top strip and its own home
 * affordance are the only navigation either of them has.
 */
export default function ImageMagickSite({ siteState, initialInputPath }: ImageMagickSiteProps) {
  const { manifest, error } = useImageMagickManifest()

  if (error) {
    return (
      <div className="im-root">
        <main className="im-hero" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
          <div>
            <h1 className="im-hero__title">This site could not load its manifest.</h1>
            <pre className="im-report__error" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontFamily: 'var(--im-mono)' }}>
              {error}
            </pre>
            <button type="button" className="im-btn im-btn--outline" onClick={() => window.location.reload()}>
              Try again
            </button>
          </div>
        </main>
      </div>
    )
  }

  if (!manifest) return <ImageMagickLoading />

  const resolved = manifest as ToolManifest
  return siteState === 'hero' ? (
    <ImageMagickHero manifest={resolved} />
  ) : (
    <ImageMagickWorkspace manifest={resolved} initialInputPath={initialInputPath} />
  )
}

/** The manifest is one small request; this says so rather than showing blank. */
function ImageMagickLoading() {
  return (
    <div className="im-root">
      <header className="im-bar">
        <span className="im-bar__mark">
          <span className="im-bar__dot" aria-hidden="true" />
          Image Converter
        </span>
        <span className="im-bar__id">{IMAGEMAGICK_ID}</span>
      </header>
      <main className="im-hero" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <p className="im-hero__lede" style={{ margin: 0 }}>
          Loading the manifest for <code>{IMAGEMAGICK_ID}</code>…
        </p>
      </main>
    </div>
  )
}