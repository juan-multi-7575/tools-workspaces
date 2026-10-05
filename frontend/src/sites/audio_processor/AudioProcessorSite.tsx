import type { ToolManifest } from '../../lib/api'
import { AUDIO_PROCESSOR_ID, useAudioProcessorManifest } from './audioProcessorModel'
import AudioProcessorHero from './AudioProcessorHero'
import AudioProcessorWorkspace from './AudioProcessorWorkspace'
import './audioProcessor.css'

export type AudioProcessorState = 'hero' | 'workspace'

export interface AudioProcessorSiteProps {
  siteState: AudioProcessorState
  initialInputPath?: string
}

/**
 * The two states of the Audio Processor site. Both are full-viewport, and
 * neither carries any Tools Garage chrome.
 */
export default function AudioProcessorSite({ siteState, initialInputPath }: AudioProcessorSiteProps) {
  const { manifest, error } = useAudioProcessorManifest()

  if (error) {
    return (
      <div className="ap-root">
        <main className="ap-hero ap-hero--flat">
          <div>
            <h1 className="ap-hero__title">This site could not load its manifest.</h1>
            <pre className="ap-error">{error}</pre>
            <button type="button" className="ap-btn ap-btn--outline" onClick={() => window.location.reload()}>
              Try again
            </button>
          </div>
        </main>
      </div>
    )
  }

  if (!manifest) return <AudioProcessorLoading />

  const resolved = manifest as ToolManifest
  return siteState === 'hero' ? (
    <AudioProcessorHero manifest={resolved} />
  ) : (
    <AudioProcessorWorkspace manifest={resolved} initialInputPath={initialInputPath} />
  )
}

/** The manifest is one small request; this says so rather than showing blank. */
function AudioProcessorLoading() {
  return (
    <div className="ap-root">
      <header className="ap-bar">
        <span className="ap-bar__mark">
          <span className="ap-bar__dot" aria-hidden="true" />
          Audio Extractor &amp; Processor
        </span>
        <span className="ap-bar__id">{AUDIO_PROCESSOR_ID}</span>
      </header>
      <main className="ap-hero ap-hero--flat">
        <p className="ap-lede" style={{ margin: 0 }}>
          Loading the manifest for <code>{AUDIO_PROCESSOR_ID}</code>…
        </p>
      </main>
    </div>
  )
}