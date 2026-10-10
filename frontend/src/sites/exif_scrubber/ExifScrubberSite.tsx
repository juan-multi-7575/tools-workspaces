import { useEffect, useState } from 'react'
import { api, errorMessage, type ToolManifest } from '../../lib/api'
import type { SiteProps } from '../types'
import ExifScrubberHero from './ExifScrubberHero'
import ExifScrubberWorkspace from './ExifScrubberWorkspace'
import './exif-scrubber.css'

export default function ExifScrubberSite({ siteState, initialInputPath }: SiteProps) {
  const [manifest, setManifest] = useState<ToolManifest | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    api.getTool('exif_scrubber').then((value) => {
      if (active) setManifest(value)
    }).catch((cause: unknown) => {
      if (active) setError(errorMessage(cause))
    })
    return () => { active = false }
  }, [])

  if (error) return <main className="exif-site"><h1>Metadata Privacy Scrubber</h1><p role="alert">{error}</p></main>
  if (!manifest) return <main className="exif-site"><h1>Metadata Privacy Scrubber</h1><p>Loading tool details…</p></main>
  return siteState === 'hero'
    ? <ExifScrubberHero manifest={manifest} />
    : <ExifScrubberWorkspace manifest={manifest} initialInputPath={initialInputPath} />
}
