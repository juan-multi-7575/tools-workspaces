import { lazy } from 'react'
import type { SiteModule } from '../types'

/**
 * The Trimmer site's registration. This is the file a new tool site copies.
 *
 * It exists as its own module so that building a tool site is a change confined
 * to `src/sites/<tool>/` — `siteModules.ts` discovers this with
 * `import.meta.glob`, so nothing shared needs editing and parallel agents
 * cannot collide on a registry.
 */
const TrimmerSite: SiteModule = {
  toolId: 'trimmer',
  path: 'trimmer',
  // Brief #2, reference `type.method`. One accent dot on a navy ground.
  accent: '#3B82F6',
  Component: lazy(() => import('./TrimmerSite')),
}

export default TrimmerSite