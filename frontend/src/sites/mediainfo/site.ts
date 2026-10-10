import { lazy } from 'react'
import type { SiteModule } from '../types'
const MediainfoSite: SiteModule = {
  toolId: 'mediainfo',
  path: 'mediainfo',
  accent: '#1B1E23',
  Component: lazy(() => import('./MediainfoSite')),
}
export default MediainfoSite
