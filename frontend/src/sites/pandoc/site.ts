import { lazy } from 'react'
import type { SiteModule } from '../types'
const PandocSite: SiteModule = {
  toolId: 'pandoc',
  path: 'pandoc',
  accent: '#212529',
  title: 'Pandoc — document converter',
  Component: lazy(() => import('./PandocSite')),
}
export default PandocSite
