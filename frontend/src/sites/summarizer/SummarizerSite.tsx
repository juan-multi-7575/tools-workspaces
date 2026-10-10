import { useEffect, useState } from 'react'
import type { ToolManifest } from '../../lib/api'
import { api, errorMessage } from '../../lib/api'
import SummarizerHero from './SummarizerHero'
import SummarizerWorkspace from './SummarizerWorkspace'
import './summarizer.css'

export interface SummarizerSiteProps {
  siteState: 'hero' | 'workspace'
  initialInputPath?: string
}

export default function SummarizerSite({ siteState, initialInputPath }: SummarizerSiteProps) {
  const [manifest, setManifest] = useState<ToolManifest | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    api.getTool('summarizer')
      .then((value) => { if (active) setManifest(value) })
      .catch((cause) => { if (active) setError(errorMessage(cause)) })
    return () => { active = false }
  }, [])

  if (error) return <main className="sum-root sum-load-error"><p>This site could not load its manifest.</p><pre role="alert">{error}</pre></main>
  if (!manifest) return <main className="sum-root sum-loading" role="status">Loading the summarizer manifest…</main>
  return siteState === 'hero'
    ? <SummarizerHero manifest={manifest}/>
    : <SummarizerWorkspace manifest={manifest} initialInputPath={initialInputPath}/>
}
