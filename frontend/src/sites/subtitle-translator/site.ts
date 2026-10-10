import { lazy } from 'react'
import type { SiteModule } from '../types'

const SubtitleTranslatorSite: SiteModule = {
  toolId: 'subtitle.translate.srt',
  path: 'subtitle.translate.srt',
  accent: '#161616',
  Component: lazy(() => import('./SubtitleTranslatorSite')),
}

export default SubtitleTranslatorSite
