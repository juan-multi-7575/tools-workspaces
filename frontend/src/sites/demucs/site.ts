import { lazy } from 'react'
import type { SiteModule } from '../types'

/**
 * The Demucs site's registration. It exists as its own module so that building
 * a tool site stays a change confined to `src/sites/<tool>/` — `siteModules.ts`
 * discovers this with `import.meta.glob`.
 */
const DemucsSite: SiteModule = {
  toolId: 'demucs',
  path: 'demucs',
  // Brief #8, reference `vam`. A museum wall label: a white ground and one
  // restrained accent, held against the reference's measured
  // rgb(255,255,255) / rgb(29,30,32).
  accent: '#7A6A53',
  title: 'Demucs — stem separation',
  Component: lazy(() => import('./DemucsSite')),
}

export default DemucsSite
