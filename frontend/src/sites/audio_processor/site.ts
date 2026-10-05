import { lazy } from 'react'
import type { SiteModule } from '../types'

/**
 * The Audio Processor site's registration. Building a tool site is a change
 * confined to `src/sites/<tool>/` — `siteModules.ts` discovers this with
 * `import.meta.glob`, so nothing shared needs editing.
 */
const AudioProcessorSite: SiteModule = {
  toolId: 'audio_processor',
  path: 'audio_processor',
  // Brief #4, reference `arc`. Warm brown on a cream ground.
  accent: '#B4763A',
  Component: lazy(() => import('./AudioProcessorSite')),
}

export default AudioProcessorSite