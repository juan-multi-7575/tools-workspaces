import { lazy } from 'react'
import type { SiteModule } from '../types'

const TextTranslatorSite: SiteModule = {
  toolId: 'text.translate.llm',
  path: 'text.translate.llm',
  accent: '#b32035',
  title: 'Text Translator — galley diff',
  Component: lazy(() => import('./TextTranslatorSite')),
}

export default TextTranslatorSite
