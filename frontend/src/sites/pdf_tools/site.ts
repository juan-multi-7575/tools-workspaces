import { lazy } from 'react'
import type { SiteModule } from '../types'

const PdfToolsSite: SiteModule = {
  toolId: 'pdf_tools',
  path: 'pdf_tools',
  accent: '#C8102E',
  Component: lazy(() => import('./PdfToolsSite')),
}

export default PdfToolsSite
