import { lazy } from 'react'
import type { SiteModule } from '../types'

const OcrmypdfSite: SiteModule = {
  toolId: 'ocrmypdf',
  path: 'ocrmypdf',
  accent: '#00A0E9',
  title: 'OCRmyPDF — scan to text',
  Component: lazy(() => import('./OcrmypdfSite')),
}

export default OcrmypdfSite
