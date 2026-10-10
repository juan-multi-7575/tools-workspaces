import { useEffect, useState } from 'react'
import { api, errorMessage, type ToolManifest } from '../../lib/api'
import type { SiteProps } from '../types'
import { TextTranslatorHero } from './TextTranslatorHero'
import { TextTranslatorWorkspace } from './TextTranslatorWorkspace'
import './text-translator.css'

export default function TextTranslatorSite({ siteState, initialInputPath }: SiteProps) {
  const [manifest, setManifest] = useState<ToolManifest | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    api.getTool('text.translate.llm').then((value) => { if (active) setManifest(value) })
      .catch((cause) => { if (active) setError(errorMessage(cause)) })
    return () => { active = false }
  }, [])

  if (error) return <main className="txt-root txt-error"><p>Could not load translation settings.</p><pre role="alert">{error}</pre></main>
  if (!manifest) return <main className="txt-root txt-loading" role="status">Loading translation settings…</main>
  return siteState === 'hero'
    ? <TextTranslatorHero manifest={manifest}/>
    : <TextTranslatorWorkspace manifest={manifest} initialInputPath={initialInputPath}/>
}
