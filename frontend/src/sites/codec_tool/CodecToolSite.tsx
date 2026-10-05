import { useEffect, useState } from 'react'
import { api, errorMessage, type ToolManifest } from '../../lib/api'
import type { SiteProps } from '../types'
import CodecHero from './Hero'
import CodecWorkspace from './Workspace'
import './codec_tool.css'

const TOOL_ID = 'codec_tool'

export default function CodecToolSite({ siteState }: SiteProps) {
  const [manifest, setManifest] = useState<ToolManifest | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    api.getTool(TOOL_ID).then((value) => {
      if (active) setManifest(value)
    }).catch((cause: unknown) => {
      if (active) setError(errorMessage(cause))
    })
    return () => { active = false }
  }, [])

  return (
    <div className="ct-root">
      {error ? (
        <main className="ct-load-error"><h1>Codec utility</h1><pre>{error}</pre></main>
      ) : !manifest ? (
        <main className="ct-loading" role="status">Loading codec manifest…</main>
      ) : siteState === 'hero' ? (
        <CodecHero manifest={manifest} />
      ) : (
        <CodecWorkspace manifest={manifest} />
      )}
    </div>
  )
}
