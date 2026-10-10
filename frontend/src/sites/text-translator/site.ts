import { lazy } from 'react'
import type { SiteModule } from '../types'

const TextTranslatorSite: SiteModule = {
  toolId: 'text.translate.llm',
  path: 'text.translate.llm',
  accent: '#b32035',
  Component: lazy(() => import('./TextTranslatorSite')),
}

export default TextTranslatorSite
