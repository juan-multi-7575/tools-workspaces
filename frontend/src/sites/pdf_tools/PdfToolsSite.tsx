import { useEffect, useState } from 'react'
import type { ToolManifest } from '../../lib/api'
import { api, errorMessage } from '../../lib/api'
import PdfToolsHero from './PdfToolsHero'
import PdfToolsWorkspace from './PdfToolsWorkspace'
import './pdf_tools.css'

export type PdfToolsState = 'hero' | 'workspace'

export default function PdfToolsSite({ siteState }: { siteState: PdfToolsState }) {
  const [manifest, setManifest] = useState<ToolManifest | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    api.getTool('pdf_tools').then((value) => { if (active) setManifest(value) })
      .catch((cause: unknown) => { if (active) setError(errorMessage(cause)) })
    return () => { active = false }
  }, [])

  if (error) return <main className="pdfs-root pdfs-loading"><h1>PDF Text &amp; Page Utilities</h1><pre role="alert">{error}</pre></main>
  if (!manifest) return <main className="pdfs-root pdfs-loading"><p>Loading PDF Text &amp; Page Utilities…</p></main>
  return siteState === 'hero'
    ? <PdfToolsHero manifest={manifest} />
    : <PdfToolsWorkspace manifest={manifest} />
}
