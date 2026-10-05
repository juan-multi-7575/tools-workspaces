import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ToolManifest } from '../../lib/api'
export default function Hero({ manifest }: { manifest: ToolManifest }) {
  const navigate = useNavigate()
  const [url, setUrl] = useState('')
  return <div className="sl-root"><main className="sl-hero"><h1>Keep the<br />live moment.</h1><p>{manifest.description}</p>
    <label htmlFor="sl-hero-url">Stream URL</label><input id="sl-hero-url" data-param-key="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="Paste a stream URL" />
    <div className="sl-actions"><button disabled={!url.trim()} onClick={() => navigate('/t/streamlink/workspace', { state: { inputPath: url } })}>Use this URL</button><button onClick={() => navigate('/t/streamlink/workspace')}>Open an empty workspace</button></div>
  </main></div>
}
