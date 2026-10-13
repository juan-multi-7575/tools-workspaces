import { lazy } from 'react'
import type { SiteModule } from '../types'

const DownloaderSite: SiteModule = {
  toolId: 'media.download.yt-dlp',
  path: 'media.download.yt-dlp',
  accent: '#0A7C7C',
  title: 'Downloader — media capture',
  Component: lazy(() => import('./DownloaderSite')),
}

export default DownloaderSite
