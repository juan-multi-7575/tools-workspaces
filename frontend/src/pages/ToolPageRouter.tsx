import { Suspense, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AlertCircle, Wrench } from 'lucide-react'
import { api, errorMessage, type ToolManifest } from '../lib/api'
import { canonicalId } from '../lib/toolIds'
import { getToolPage } from '../lib/toolPages'
import { initialParamsFromManifest } from '../hooks/useToolExecute'
import GenericToolPage from './tools/GenericToolPage'
import ErrorBoundary from '../components/common/ErrorBoundary'

export default function ToolPageRouter({
  onOpenAudioPlayer,
}: {
  onOpenAudioPlayer?: (media: { name: string; path: string }) => void
}) {
  const { toolId = '' } = useParams()
  const canonical = useMemo(() => canonicalId(toolId), [toolId])
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [manifest, setManifest] = useState<ToolManifest | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    setManifest(null)
    api
      .listTools()
      .then(({ tools }) => {
        if (!active) return
        const found = tools.find((tool) => tool.id === canonical)
        if (!found) {
          setError(`No tool is registered under the id "${canonical}".`)
          setLoading(false)
          return
        }
        setManifest(found)
        setLoading(false)
      })
      .catch((err) => {
        if (!active) return
        setError(errorMessage(err) || 'Could not reach the tools backend.')
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [canonical])

  const Page = useMemo(() => (manifest ? getToolPage(manifest.id) ?? GenericToolPage : null), [manifest])
  const inputPath = searchParams.get('input') ?? undefined

  const sendToTool = (nextId: string, path: string) => {
    navigate(`/tools/${encodeURIComponent(nextId)}?input=${encodeURIComponent(path)}`)
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-10">
        <p className="font-mono text-sm text-brand-caramel-text">Loading tool…</p>
      </div>
    )
  }

  if (error || !manifest || !Page) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-10 text-center">
        <AlertCircle className="mx-auto size-9 text-accent-contrast" />
        <h1 className="text-lg font-bold text-brand-espresso">This tool page is unavailable</h1>
        <p className="text-sm text-brand-caramel-text">{error}</p>
        <Link
          to="/tools"
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand-caramel px-4 py-2 text-xs font-bold text-brand-cream-light"
        >
          <Wrench className="size-3.5" /> Back to the catalog
        </Link>
      </div>
    )
  }

  return (
    <ErrorBoundary name={manifest.name} resetKey={manifest.id}>
      <Suspense
        fallback={
          <p className="p-10 font-mono text-sm text-brand-caramel-text">Loading {manifest.name}…</p>
        }
      >
        <Page
          key={manifest.id}
          manifest={manifest}
          initialParams={initialParamsFromManifest(manifest)}
          initialInputPath={inputPath}
          onSendToTool={sendToTool}
          onOpenAudioPlayer={onOpenAudioPlayer}
        />
      </Suspense>
    </ErrorBoundary>
  )
}