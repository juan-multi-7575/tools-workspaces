import { lazy } from 'react'
import type { SiteModule } from '../types'

const SummarizerSite: SiteModule = {
  toolId: 'summarizer',
  path: 'summarizer',
  accent: '#6A5947',
  title: 'Summarizer — text digest',
  Component: lazy(() => import('./SummarizerSite')),
}

export default SummarizerSite
