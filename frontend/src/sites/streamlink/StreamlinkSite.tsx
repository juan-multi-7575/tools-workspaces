import { useEffect, useState } from 'react'
import { api, errorMessage, type ToolManifest } from '../../lib/api'
import type { SiteProps } from '../types'
import Hero from './Hero'
import Workspace from './Workspace'
import './streamlink.css'
export default function StreamlinkSite({ siteState, initialInputPath }: SiteProps) {
  const [manifest, setManifest] = useState<ToolManifest | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    document.title = 'Streamlink — Live capture'
    let active = true
    api.getTool('streamlink').then(value => { if (active) setManifest(value) }).catch(cause => { if (active) setError(errorMessage(cause)) })
    return () => { active = false }
  }, [])
  if (!manifest) return <main className="sl-root sl-loading"><p role={error ? 'alert' : 'status'}>{error ?? 'Loading Streamlink…'}</p></main>
  return siteState === 'hero' ? <Hero manifest={manifest} /> : <Workspace manifest={manifest} initialInputPath={initialInputPath} />
}
