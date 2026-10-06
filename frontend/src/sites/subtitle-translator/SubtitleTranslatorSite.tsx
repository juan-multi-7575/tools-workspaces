import { useEffect, useState } from 'react'
import { api, errorMessage, type ToolManifest } from '../../lib/api'
import type { SiteProps } from '../types'
import { SubtitleTranslatorHero } from './SubtitleTranslatorHero'
import { SubtitleTranslatorWorkspace } from './SubtitleTranslatorWorkspace'
import './subtitle-translator.css'

export default function SubtitleTranslatorSite({ siteState, initialInputPath }: SiteProps) {
  const [manifest, setManifest] = useState<ToolManifest | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    api.getTool('subtitle.translate.srt').then((value) => { if (active) setManifest(value) }).catch((cause) => { if (active) setError(errorMessage(cause)) })
    return () => { active = false }
  }, [])
  if (error) return <main className="sub-root sub-load-error"><p>Could not load subtitle translation settings.</p><pre role="alert">{error}</pre></main>
  if (!manifest) return <main className="sub-root sub-loading" role="status">Loading subtitle settings…</main>
  return siteState === 'hero' ? <SubtitleTranslatorHero manifest={manifest}/> : <SubtitleTranslatorWorkspace manifest={manifest} initialInputPath={initialInputPath}/>
}
