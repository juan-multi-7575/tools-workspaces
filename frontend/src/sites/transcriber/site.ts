import { lazy } from 'react'
import type { SiteModule } from '../types'

/**
 * The Transcriber site's registration. It exists as its own module so that
 * building a tool site stays a change confined to `src/sites/<tool>/` —
 * `siteModules.ts` discovers this with `import.meta.glob`.
 */
const TranscriberSite: SiteModule = {
  toolId: 'transcriber',
  path: 'transcriber',
  // Brief #3, reference `practicaltype`. A typeset transcript on a book ground.
  accent: '#8A5A2B',
  Component: lazy(() => import('./TranscriberSite')),
}

export default TranscriberSite
