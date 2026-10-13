import { lazy } from 'react'
import type { SiteModule } from '../types'

const PackagerSite: SiteModule = {
  toolId: 'packager',
  path: 'packager',
  accent: '#D86C3C',
  title: 'Packager — archive tools',
  Component: lazy(() => import('./PackagerSite')),
}

export default PackagerSite
