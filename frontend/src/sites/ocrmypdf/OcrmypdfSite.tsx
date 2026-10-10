import type { ToolManifest } from '../../lib/api'
import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import OcrmypdfHero from './OcrmypdfHero'
import OcrmypdfWorkspace from './OcrmypdfWorkspace'
import './ocrmypdf.css'

export type OcrmypdfState = 'hero' | 'workspace'

export default function OcrmypdfSite({ siteState, initialInputPath }: { siteState: OcrmypdfState; initialInputPath?: string }) {
  const [manifest, setManifest] = useState<ToolManifest | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    api.getTool('ocrmypdf').then((value) => { if (live) setManifest(value as ToolManifest) }).catch((cause: unknown) => {
      if (live) setError(cause instanceof Error ? cause.message : String(cause))
    })
    return () => { live = false }
  }, [])
  if (error) return <main className="om-root om-error"><h1>OCR Document Scanner</h1><pre role="alert">{error}</pre></main>
  if (!manifest) return <main className="om-root om-loading">Loading OCR Document Scanner…</main>
  return <div className="om-root">{siteState === 'hero' ? <OcrmypdfHero manifest={manifest} /> : <OcrmypdfWorkspace manifest={manifest} initialInputPath={initialInputPath} />}</div>
}
