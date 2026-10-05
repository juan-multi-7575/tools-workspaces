import { useEffect, useState } from 'react'
import { api, errorMessage, type ToolManifest } from '../../lib/api'
import type { SiteProps } from '../types'
import Hero from './Hero'
import Workspace from './Workspace'
import './gallery-dl.css'
export default function GallerydlSite({ siteState, initialInputPath }: SiteProps) {
  const [manifest, setManifest] = useState<ToolManifest | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    document.title = 'gallery-dl — Gallery collector'
    let active = true
    api.getTool('gallery-dl').then(value => { if (active) setManifest(value) }).catch(cause => { if (active) setError(errorMessage(cause)) })
    return () => { active = false }
  }, [])
  if (!manifest) return <main className="gd-root gd-loading"><p role={error ? 'alert' : 'status'}>{error ?? 'Loading gallery-dl…'}</p></main>
  return siteState === 'hero' ? <Hero manifest={manifest} /> : <Workspace manifest={manifest} initialInputPath={initialInputPath} />
}
