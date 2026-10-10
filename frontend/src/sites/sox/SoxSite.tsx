import { useEffect, useState } from 'react'
import { api, errorMessage, type ToolManifest } from '../../lib/api'
import type { SiteProps } from '../types'
import Hero from './Hero'
import Workspace from './Workspace'
import './sox.css'
export default function SoxSite({ siteState, initialInputPath }: SiteProps) {
  const [manifest, setManifest] = useState<ToolManifest | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    document.title = 'SoX — DSP effect rack'
    let active = true
    api.getTool('sox').then(value => { if (active) setManifest(value) }).catch(cause => { if (active) setError(errorMessage(cause)) })
    return () => { active = false }
  }, [])
  if (!manifest) return <main className="sox-root sox-loading"><p role={error ? 'alert' : 'status'}>{error ?? 'Loading SoX…'}</p></main>
  return siteState === 'hero' ? <Hero manifest={manifest} /> : <Workspace manifest={manifest} initialInputPath={initialInputPath} />
}
