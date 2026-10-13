import { lazy } from 'react'
import type { SiteModule } from '../types'
const MediainfoSite: SiteModule = {
  toolId: 'mediainfo',
  path: 'mediainfo',
  accent: '#1B1E23',
  title: 'MediaInfo — stream inspector',
  Component: lazy(() => import('./MediainfoSite')),
}
export default MediainfoSite
