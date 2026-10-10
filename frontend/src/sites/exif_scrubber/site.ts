import { lazy } from 'react'
import type { SiteModule } from '../types'

const ExifScrubberSite: SiteModule = {
  toolId: 'exif_scrubber',
  path: 'exif_scrubber',
  accent: '#0000EE',
  Component: lazy(() => import('./ExifScrubberSite')),
}

export default ExifScrubberSite
