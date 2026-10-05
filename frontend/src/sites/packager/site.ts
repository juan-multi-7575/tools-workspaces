import { lazy } from 'react'
import type { SiteModule } from '../types'

const PackagerSite: SiteModule = {
  toolId: 'packager',
  path: 'packager',
  accent: '#D86C3C',
  Component: lazy(() => import('./PackagerSite')),
}

export default PackagerSite
