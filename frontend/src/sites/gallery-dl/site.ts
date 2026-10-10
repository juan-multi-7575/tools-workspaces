import { lazy } from 'react'
import type { SiteModule } from '../types'
const GallerydlSite: SiteModule = {
  toolId: 'gallery-dl',
  path: 'gallery-dl',
  accent: '#8A8A8A',
  Component: lazy(() => import('./GallerydlSite')),
}
export default GallerydlSite
