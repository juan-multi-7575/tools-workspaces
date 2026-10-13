import { lazy } from 'react'
import type { SiteModule } from '../types'

const CodecToolSite: SiteModule = {
  toolId: 'codec_tool',
  path: 'codec_tool',
  accent: '#D9A400',
  title: 'Codec Tool — encode and decode',
  Component: lazy(() => import('./CodecToolSite')),
}

export default CodecToolSite
