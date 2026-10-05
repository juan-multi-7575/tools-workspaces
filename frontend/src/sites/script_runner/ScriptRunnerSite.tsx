import { useEffect, useState } from 'react'
import { api, errorMessage, type ToolManifest } from '../../lib/api'
import type { SiteProps } from '../types'
import ScriptRunnerHero from './ScriptRunnerHero'
import ScriptRunnerWorkspace from './ScriptRunnerWorkspace'
import './script-runner.css'

export default function ScriptRunnerSite({ siteState }: SiteProps) {
  const [manifest, setManifest] = useState<ToolManifest | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    api.getTool('script_runner').then((value) => {
      if (active) setManifest(value)
    }).catch((cause: unknown) => {
      if (active) setError(errorMessage(cause))
    })
    return () => { active = false }
  }, [])

  if (error) return <main className="sr-site sr-load-error"><h1>Script runner</h1><pre role="alert">{error}</pre></main>
  if (!manifest) return <main className="sr-site sr-loading" role="status">Loading tool details…</main>
  return siteState === 'hero' ? <ScriptRunnerHero manifest={manifest} /> : <ScriptRunnerWorkspace manifest={manifest} />
}
