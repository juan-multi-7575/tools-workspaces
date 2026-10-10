import { useEffect, useState } from 'react'
import { api, errorMessage, type ToolManifest } from '../../lib/api'
import type { SiteProps } from '../types'
import Hero from './Hero'
import Workspace from './Workspace'
import './mediainfo.css'
export default function MediainfoSite({ siteState, initialInputPath }: SiteProps) {
  const [manifest, setManifest] = useState<ToolManifest | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    document.title = 'MediaInfo — Stream inspector'
    let active = true
    api.getTool('mediainfo').then(value => { if (active) setManifest(value) }).catch(cause => { if (active) setError(errorMessage(cause)) })
    return () => { active = false }
  }, [])
  if (!manifest) return <main className="mi-root mi-loading"><p role={error ? 'alert' : 'status'}>{error ?? 'Loading MediaInfo…'}</p></main>
  return siteState === 'hero' ? <Hero manifest={manifest} /> : <Workspace manifest={manifest} initialInputPath={initialInputPath} />
}
