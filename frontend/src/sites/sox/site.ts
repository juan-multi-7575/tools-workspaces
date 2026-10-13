import { lazy } from 'react'
import type { SiteModule } from '../types'
const SoxSite: SiteModule = {
  toolId: 'sox',
  path: 'sox',
  accent: '#E8A33D',
  title: 'SoX — DSP effect rack',
  Component: lazy(() => import('./SoxSite')),
}
export default SoxSite
