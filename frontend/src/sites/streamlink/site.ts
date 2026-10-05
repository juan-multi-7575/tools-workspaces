import { lazy } from 'react'
import type { SiteModule } from '../types'
const StreamlinkSite: SiteModule = {
  toolId: 'streamlink',
  path: 'streamlink',
  accent: '#FF4D00',
  Component: lazy(() => import('./StreamlinkSite')),
}
export default StreamlinkSite
