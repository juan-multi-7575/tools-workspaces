import { useEffect, useState } from 'react'
import { api, errorMessage, type ToolManifest } from '../../lib/api'
import type { SiteProps } from '../types'
import HealthCheckHero from './HealthCheckHero'
import HealthCheckWorkspace from './HealthCheckWorkspace'
import './health-check.css'

export default function HealthCheckSite({ siteState }: SiteProps) {
  const [manifest, setManifest] = useState<ToolManifest | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    api.getTool('sys.health.check').then((value) => {
      if (active) setManifest(value)
    }).catch((cause: unknown) => {
      if (active) setError(errorMessage(cause))
    })
    return () => { active = false }
  }, [])

  if (error) return <main className="mh-site mh-load"><h1>Model health probe</h1><pre role="alert">{error}</pre></main>
  if (!manifest) return <main className="mh-site mh-load" role="status">Loading tool details…</main>
  return siteState === 'hero' ? <HealthCheckHero manifest={manifest} /> : <HealthCheckWorkspace manifest={manifest} />
}
