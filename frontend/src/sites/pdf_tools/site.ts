import { lazy } from 'react'
import type { SiteModule } from '../types'

const PdfToolsSite: SiteModule = {
  toolId: 'pdf_tools',
  path: 'pdf_tools',
  accent: '#C8102E',
  title: 'PDF Tools — split, merge, render',
  Component: lazy(() => import('./PdfToolsSite')),
}

export default PdfToolsSite
