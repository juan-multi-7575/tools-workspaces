import { lazy } from 'react'
import type { SiteModule } from '../types'

const SummarizerSite: SiteModule = {
  toolId: 'summarizer',
  path: 'summarizer',
  accent: '#6A5947',
  Component: lazy(() => import('./SummarizerSite')),
}

export default SummarizerSite
