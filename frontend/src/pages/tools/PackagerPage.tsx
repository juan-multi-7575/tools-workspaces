import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Archive,
  CheckSquare,
  Download,
  FileBox,
  FolderTree,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  Square,
  UploadCloud,
  X,
} from 'lucide-react'
import { api, errorMessage, resolveUrl } from '../../lib/api'
import { useToolExecute } from '../../hooks/useToolExecute'
import ToolPageShell from '../../components/tools/ToolPageShell'
import ToolResultPanel from '../../components/tools/ToolResultPanel'
import type { ToolPageProps } from '../../lib/toolPageTypes'

interface FieldSpec {
  type?: string
  title?: string
  description?: string
}

interface Entry {
  name: string
  path: string
  kind: string
  size: number
  mtime: number
}

interface TreeNode {
  dir: string
  files: Entry[]
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`
}

function contentUrl(path: string): string {
  return resolveUrl(`/api/artifacts/content?path=${encodeURIComponent(path)}`)
}

function buildTree(entries: Entry[]): TreeNode[] {
  const roots: TreeNode[] = []
  for (const entry of entries) {
    const slash = entry.path.lastIndexOf('/')
    const dir = slash > 0 ? entry.path.slice(0, slash) : '/'
    let node = roots.find((n) => n.dir === dir)
    if (!node) {
      node = { dir, files: [] }
      roots.push(node)
    }
    node.files.push(entry)
  }
  return roots.sort((a, b) => a.dir.localeCompare(b.dir))
}

/**
 * Archive builder: a real file tree over the backend's artifact index with
 * per-file include/exclude, feeding the manifest's only key — `paths`. The zip
 * the backend returns carries no entry manifest, so nothing here pretends to
 * list archive contents.
 */
export default function PackagerPage({
  manifest,
  initialParams,
  onComplete,
  onSendToTool,
}: ToolPageProps) {
  const schema = manifest.parameters_schema as Record<string, FieldSpec>
  const execute = useToolExecute('packager')
  const fileRef = useRef<HTMLInputElement>(null)

  const initialPaths = Array.isArray(initialParams.paths) ? (initialParams.paths as unknown[]).map(String) : []
  const [selected, setSelected] = useState<string[]>(initialPaths)
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [manual, setManual] = useState('')
  const [uploading, setUploading] = useState(false)
  const [filter, setFilter] = useState('')

  const refresh = async () => {
    setLoading(true)
    setListError(null)
    try {
      const res = await api.getRecentArtifacts()
      setEntries(res.artifacts)
    } catch (err) {
      setListError(`Could not load the artifact index: ${errorMessage(err)}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [])

  const params = { paths: selected }
  const toggle = (path: string) =>
    setSelected((prev) => (prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]))

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return entries
    return entries.filter((e) => e.name.toLowerCase().includes(q) || e.path.toLowerCase().includes(q))
  }, [entries, filter])
  const tree = useMemo(() => buildTree(visible), [visible])

  const upload = async (file: File) => {
    setUploading(true)
    try {
      const res = await api.uploadFile(file)
      setSelected((prev) => (prev.includes(res.path) ? prev : [...prev, res.path]))
      await refresh()
    } catch (err) {
      setListError(`Upload failed: ${errorMessage(err)}`)
    } finally {
      setUploading(false)
    }
  }

  const run = async () => {
    const result = await execute.run(params)
    if (result && result.status === 'completed') onComplete?.(result, params)
  }

  const result = execute.state.result
  const artifact = result?.status === 'completed' ? result.artifacts[0] : undefined
  const artifactSize = artifact ? entries.find((e) => e.path === artifact.path)?.size : undefined
  const missing = selected.filter((p) => !entries.some((e) => e.path === p))

  const fileRow = (entry: Entry) => {
    const checked = selected.includes(entry.path)
    return (
      <li key={entry.path}>
        <label className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 transition-colors ${checked ? 'bg-success-soft/60' : 'hover:bg-brand-cream-dark/50'}`}>
          <input type="checkbox" checked={checked} onChange={() => toggle(entry.path)} className="accent-brand-caramel" />
          {checked ? <CheckSquare className="size-3.5 text-success" /> : <Square className="size-3.5 text-brand-caramel-text" />}
          <FileBox className="size-3.5 shrink-0 text-brand-caramel-text" />
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-brand-espresso" title={entry.path}>{entry.name}</span>
          <span className="shrink-0 font-mono text-[10px] text-brand-caramel-text">{entry.kind}</span>
          <span className="shrink-0 font-mono text-[10px] text-brand-caramel-text">{formatBytes(entry.size)}</span>
        </label>
      </li>
    )
  }

  return (
    <ToolPageShell
      manifest={manifest}
      headerActions={
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-brand-espresso px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-brand-cream-light">
          <Package className="size-3" /> zip builder
        </span>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <section className="space-y-2 rounded-2xl border border-brand-sage bg-surface-white p-4">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.2em] text-brand-espresso">
                <FolderTree className="size-4 text-brand-caramel" /> File tree
              </h2>
              <div className="flex items-center gap-2">
                <input
                  type="search"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter files…"
                  aria-label="Filter the file tree"
                  className="w-40 rounded-lg border border-brand-sage bg-brand-cream-light px-2.5 py-1 font-mono text-[11px] text-brand-espresso focus:border-brand-caramel focus:outline-none"
                />
                <button type="button" onClick={() => void refresh()} className="rounded-lg border border-brand-sage bg-brand-cream-light px-2 py-1 font-mono text-[11px] text-brand-espresso">
                  <RefreshCw className="size-3" />
                </button>
              </div>
            </header>

            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const file = e.dataTransfer.files?.[0]
                if (file) void upload(file)
              }}
              onClick={() => fileRef.current?.click()}
              className="cursor-pointer rounded-xl border-2 border-dashed border-brand-sage bg-brand-cream/40 px-3 py-2 text-center text-[11px] text-brand-caramel-text hover:border-brand-caramel"
            >
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void upload(file)
                }}
              />
              {uploading ? (
                <span className="inline-flex items-center gap-1.5 font-bold text-brand-caramel">
                  <Loader2 className="size-3.5 animate-spin" /> uploading…
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <UploadCloud className="size-3.5" /> drop a file here to upload and select it
                </span>
              )}
            </div>

            {listError && (
              <p role="alert" className="rounded-lg bg-accent-contrast/10 px-2.5 py-1.5 text-xs text-accent-contrast">{listError}</p>
            )}

            <div className="max-h-[24rem] overflow-y-auto rounded-xl border border-brand-sage bg-brand-cream-light p-2">
              {loading ? (
                <p className="p-2 font-mono text-[11px] text-brand-caramel-text">Loading the artifact index…</p>
              ) : tree.length === 0 ? (
                <p className="p-2 font-mono text-[11px] text-brand-caramel-text">
                  {entries.length === 0 ? 'The backend reports no artifacts yet.' : 'No file matches this filter.'}
                </p>
              ) : (
                tree.map((node) => (
                  <div key={node.dir} className="mb-2 last:mb-0">
                    <p className="px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-brand-caramel-text" title={node.dir}>
                      {node.dir}
                    </p>
                    <ul className="space-y-0.5">{node.files.map(fileRow)}</ul>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="space-y-3">
            <div data-param-key="paths" className="space-y-2 rounded-2xl border border-brand-sage bg-surface-white p-4">
              <h2 className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.2em] text-brand-espresso">
                <Archive className="size-4 text-brand-caramel" /> {schema.paths?.title ?? 'paths'}
              </h2>
              <p className="text-xs text-brand-caramel-text">
                The exact value sent to the backend. Every tick in the tree adds one real server path; unticking removes it.
              </p>
              <div className="max-h-56 overflow-y-auto rounded-xl border border-brand-sage bg-brand-cream-light p-2">
                {selected.length === 0 ? (
                  <p className="p-2 font-mono text-[11px] text-brand-caramel-text">
                    Nothing selected — the backend rejects an empty <code>paths</code> with &ldquo;paths is required&rdquo;.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {selected.map((path) => (
                      <li key={path} className="flex items-center gap-2 rounded-lg bg-brand-cream-dark/40 px-2 py-1">
                        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-brand-espresso" title={path}>{path}</span>
                        {missing.includes(path) && (
                          <span className="shrink-0 rounded bg-accent-contrast/15 px-1.5 py-0.5 font-mono text-[10px] text-accent-contrast">
                            not in the index
                          </span>
                        )}
                        <button type="button" onClick={() => toggle(path)} aria-label={`Remove ${path}`} className="shrink-0 text-brand-caramel-text hover:text-accent-contrast">
                          <X className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={manual}
                  onChange={(e) => setManual(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return
                    const value = manual.trim()
                    if (value) setSelected((prev) => (prev.includes(value) ? prev : [...prev, value]))
                    setManual('')
                  }}
                  placeholder="Add a server path the index does not list"
                  aria-label="Add a path to the archive"
                  className="flex-1 rounded-lg border border-brand-sage bg-brand-cream-light px-2.5 py-1.5 font-mono text-[11px] text-brand-espresso focus:border-brand-caramel focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    const value = manual.trim()
                    if (value) setSelected((prev) => (prev.includes(value) ? prev : [...prev, value]))
                    setManual('')
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-brand-sage bg-brand-cream-light px-2.5 py-1.5 font-mono text-[11px] font-bold text-brand-espresso"
                >
                  <Plus className="size-3" /> add
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void run()}
                  disabled={execute.busy || selected.length === 0}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-caramel px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-brand-cream-light disabled:opacity-40"
                >
                  {execute.busy ? <Loader2 className="size-3.5 animate-spin" /> : <Package className="size-3.5" />}
                  {execute.busy ? `${execute.state.elapsedSeconds.toFixed(1)}s measured` : `Build zip from ${selected.length}`}
                </button>
                <button
                  type="button"
                  onClick={() => setSelected([])}
                  className="rounded-lg border border-brand-sage bg-brand-cream-light px-2.5 py-1.5 font-mono text-[11px] text-brand-espresso"
                >
                  clear selection
                </button>
              </div>
            </div>

            {execute.state.error && (
              <div role="alert" className="rounded-2xl border-2 border-accent-contrast/50 bg-accent-contrast/10 p-4">
                <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-accent-contrast">The backend reported — verbatim</p>
                <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-brand-espresso">{execute.state.error}</pre>
              </div>
            )}

            {artifact && (
              <div className="space-y-2 rounded-2xl border border-brand-espresso bg-brand-espresso p-4 text-brand-cream-light">
                <h3 className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.2em]">
                  <Package className="size-4" /> {artifact.name}
                </h3>
                <p className="font-mono text-[11px] text-brand-cream-dark/70">
                  {artifactSize === undefined ? 'size not indexed yet' : formatBytes(artifactSize)} ·
                  {' '}built from {selected.length} real {selected.length === 1 ? 'path' : 'paths'} sent as <code>paths</code>
                </p>
                <a
                  href={contentUrl(artifact.path)}
                  download={artifact.name}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand-caramel px-3 py-2 font-mono text-xs font-bold text-brand-cream-light"
                >
                  <Download className="size-3.5" /> download {artifact.name}
                </a>
                <p className="font-mono text-[10px] leading-relaxed text-brand-cream-dark/60">
                  The backend returns only the archive path — it ships no entry manifest, so the archive contents are not
                  listed here. Nothing is invented to fill the gap.
                </p>
              </div>
            )}

            {execute.state.phase !== 'idle' && (
              <ToolResultPanel
                state={execute.state}
                toolId="packager"
                toolName={manifest.name}
                onRerun={execute.reset}
                onSendToTool={onSendToTool}
              />
            )}
          </section>
        </div>

        <p className="font-mono text-[10px] text-brand-caramel-text">
          {Object.keys(schema).length} manifest {Object.keys(schema).length === 1 ? 'key' : 'keys'} on this page:{' '}
          {Object.keys(schema).join(', ')}
        </p>
      </div>
    </ToolPageShell>
  )
}
