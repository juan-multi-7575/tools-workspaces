import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ToolManifest } from '../../lib/api'
export default function Hero({ manifest }: { manifest: ToolManifest }) {
  const navigate = useNavigate()
  const [url, setUrl] = useState('')
  return <div className="gd-root"><main className="gd-hero"><h1>Pictures,<br /><em>collected.</em></h1><p>{manifest.description}</p>
    <label htmlFor="gd-hero-url">Gallery URL</label><input id="gd-hero-url" data-param-key="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="Paste a gallery URL" />
    <div className="gd-actions"><button disabled={!url.trim()} onClick={() => navigate('/t/gallery-dl/workspace', { state: { inputPath: url } })}>Use this URL</button><button onClick={() => navigate('/t/gallery-dl/workspace')}>Open an empty workspace</button></div>
  </main></div>
}
