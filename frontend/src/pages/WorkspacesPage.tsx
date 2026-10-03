import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  FolderTree,
  Plus,
  ArrowUpRight,
  Trash2,
  Layers,
  Folder,
  LayoutGrid,
  List,
  HardDrive,
  AlertCircle,
  RotateCcw,
} from 'lucide-react'
import { api, API_BASE, type Workspace } from '../lib/api'

export default function WorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [viewFormat, setViewFormat] = useState<'grid' | 'table'>('grid')
  const [createError, setCreateError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{ id: string; runs: number } | null>(null)

  const refresh = () => {
    setLoading(true)
    setFetchError(null)
    api.listWorkspaces()
      .then(({ workspaces }) => {
        setWorkspaces(workspaces)
        setLoading(false)
      })
      .catch((err) => {
        setFetchError(err instanceof Error ? err.message : 'Failed to connect to backend service')
        setLoading(false)
      })
  }

  useEffect(refresh, [])

  useEffect(() => {
    if (!pendingDelete) return
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPendingDelete(null)
    }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [pendingDelete])

  const create = async () => {
    if (!name.trim()) return
    setCreateError(null)
    try {
      await api.createWorkspace(name.trim())
      setName('')
      refresh()
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Could not create workspace.')
    }
  }

  const remove = async (id: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const ws = workspaces.find((w) => w.id === id)
    setPendingDelete({ id, runs: ws?.pipeline_runs ?? ws?.runs?.length ?? 0 })
  }

  const confirmRemove = async () => {
    if (!pendingDelete) return
    await api.deleteWorkspace(pendingDelete.id)
    setPendingDelete(null)
    refresh()
  }

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-6 text-brand-espresso">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-brand-sage pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-brand-espresso">Workspaces</h1>
            <span className="font-mono text-xs px-2.5 py-0.5 rounded-full bg-brand-sage/40 border border-brand-sage text-brand-espresso font-semibold">
              {workspaces.length} active
            </span>
          </div>
          <p className="mt-1 text-sm text-brand-caramel-text">
            Named, filesystem-backed containers holding isolated artifact stores and reusable pipelines.
          </p>
        </div>

        {/* Quick creation & View switcher */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-xl border border-brand-sage bg-brand-cream-dark/80 p-1 shadow-2xs">
            <button
              onClick={() => setViewFormat('grid')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-all ${
                viewFormat === 'grid'
                  ? 'bg-brand-caramel text-brand-cream-light shadow-xs'
                  : 'text-brand-espresso hover:bg-brand-cream-dark'
              }`}
              title="Grid View Format"
            >
              <LayoutGrid className="size-3.5" />
              <span className="hidden sm:inline">Grid</span>
            </button>
            <button
              onClick={() => setViewFormat('table')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-all ${
                viewFormat === 'table'
                  ? 'bg-brand-caramel text-brand-cream-light shadow-xs'
                  : 'text-brand-espresso hover:bg-brand-cream-dark'
              }`}
              title="Table View Format"
            >
              <List className="size-3.5" />
              <span className="hidden sm:inline">Table</span>
            </button>
          </div>

          <div className="flex flex-col gap-1 w-full sm:w-auto">
            <div className="flex items-center gap-2">
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  if (createError) setCreateError(null)
                }}
                onKeyDown={(e) => e.key === 'Enter' && create()}
                placeholder="New workspace name… (letters, numbers, dashes)"
                maxLength={64}
                className="w-full sm:w-64 rounded-xl border border-brand-sage bg-surface-white px-3.5 py-2 text-xs text-brand-espresso placeholder-brand-caramel-text/60 focus:border-brand-caramel focus:outline-none shadow-xs font-medium"
              />
              <button
                onClick={create}
                disabled={!name.trim()}
                title={name.trim() ? `Create workspace "${name.trim()}"` : 'Enter a name first'}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-brand-caramel px-4 py-2 text-xs font-bold text-brand-cream-light shadow-sm transition-all hover:bg-brand-caramel-hover active:scale-95 disabled:opacity-40"
              >
                <Plus className="size-3.5" />
                Create
              </button>
            </div>
            {createError && (
              <p className="text-xs font-semibold text-accent-contrast">{createError}</p>
            )}
          </div>
        </div>
      </div>

      {/* Grid or Table of workspaces */}
      {fetchError ? (
        <div className="rounded-2xl border border-accent-contrast/50 bg-accent-contrast/10 p-8 text-center space-y-3">
          <AlertCircle className="mx-auto size-8 text-accent-contrast" />
          <p className="text-sm font-bold text-accent-contrast">{fetchError}</p>
          <p className="text-xs text-brand-caramel-text">
            Unable to connect to the backend service at{' '}
            <code className="bg-brand-cream-dark px-1.5 py-0.5 rounded border border-brand-sage font-bold">
              {API_BASE || 'localhost:8000'}
            </code>
            . Make sure the backend server is running.
          </p>
          <button
            onClick={refresh}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-caramel px-4 py-2 text-xs font-bold text-brand-cream-light shadow-xs hover:bg-brand-caramel-hover active:scale-95 transition-all"
          >
            <RotateCcw className="size-3.5" />
            Retry Connection
          </button>
        </div>
      ) : loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-36 rounded-2xl border border-brand-sage/60 bg-brand-cream-dark/40 animate-pulse" />
          ))}
        </div>
      ) : workspaces.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-brand-sage bg-brand-cream-dark/30 p-10 text-center">
          <Folder className="mx-auto size-7 text-brand-caramel mb-2 opacity-60" />
          <p className="text-sm font-bold text-brand-espresso">No workspaces yet</p>
          <p className="mt-1 text-xs text-brand-caramel-text">
            Create your first workspace above to chain tools into multi-stage pipelines.
          </p>
        </div>
      ) : viewFormat === 'grid' ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {workspaces.map((ws) => (
            <Link
              key={ws.id}
              to={`/workspaces/${ws.id}`}
              className="group relative flex flex-col justify-between rounded-2xl border border-brand-sage bg-surface-white p-4.5 shadow-xs transition-all duration-150 hover:border-brand-caramel hover:shadow-md"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex size-8 items-center justify-center rounded-xl bg-brand-cream-dark text-brand-caramel group-hover:bg-brand-caramel group-hover:text-brand-cream-light transition-all">
                    <FolderTree className="size-4" />
                  </div>
                  <button
                    onClick={(e) => remove(ws.id, e)}
                    aria-label={`Delete workspace ${ws.name}`}
                    className="rounded-lg p-1.5 text-brand-caramel-text transition-colors hover:bg-accent-contrast/15 hover:text-accent-contrast"
                    title={`Delete workspace "${ws.name}"`}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold tracking-tight text-brand-espresso group-hover:text-brand-caramel transition-colors">
                    {ws.name}
                  </h2>
                  <ArrowUpRight className="size-4 text-brand-caramel-text group-hover:text-brand-caramel transition-colors" />
                </div>
                <p className="font-mono text-xs text-brand-caramel-text mt-0.5">ID: {ws.id}</p>
              </div>

              <div className="mt-4 pt-3 border-t border-brand-sage/40 flex items-center justify-between font-mono text-xs text-brand-caramel-text">
                <span className="flex items-center gap-1 font-semibold">
                  <Layers className="size-3.5 text-brand-caramel" />
                  {ws.templates?.length || 0} templates
                </span>
                <span
                  className="font-semibold text-brand-espresso flex items-center gap-1"
                  title={`${ws.runs?.length || 0} standalone tool runs`}
                >
                  <HardDrive className="size-3.5 text-brand-caramel" />
                  {ws.pipeline_runs ?? ws.runs?.length ?? 0} pipeline runs
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        /* FORMAT 2: TABLE VIEW FOR WORKSPACES */
        <div className="overflow-hidden rounded-2xl border border-brand-sage bg-surface-white shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-brand-espresso">
              <thead className="border-b border-brand-sage bg-brand-cream-dark/70 font-mono text-xs uppercase text-brand-caramel-text">
                <tr>
                  <th className="px-4 py-3 font-bold">Workspace Name & Identifier</th>
                  <th className="px-4 py-3 font-bold">Pipeline Templates</th>
                  <th className="px-4 py-3 font-bold">Total Runs Executed</th>
                  <th className="px-4 py-3 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-sage/40 font-medium">
                {workspaces.map((ws) => (
                  <tr key={ws.id} className="hover:bg-brand-cream-dark/40 transition-colors">
                    <td className="px-4 py-3">
                      <Link to={`/workspaces/${ws.id}`} className="flex items-center gap-2.5 group">
                        <div className="flex size-7 items-center justify-center rounded-lg bg-brand-cream-dark text-brand-caramel group-hover:bg-brand-caramel group-hover:text-brand-cream-light transition-all">
                          <FolderTree className="size-3.5" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-brand-espresso group-hover:text-brand-caramel transition-colors">{ws.name}</p>
                          <p className="font-mono text-xs text-brand-caramel-text">{ws.id}</p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      <span className="rounded bg-brand-cream-dark px-2 py-0.5 border border-brand-sage/50 font-semibold">
                        {ws.templates?.length || 0} templates
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      <span
                        className="rounded bg-brand-sage/30 px-2 py-0.5 border border-brand-sage font-semibold text-brand-espresso"
                        title={`${ws.runs?.length || 0} standalone tool runs`}
                      >
                        {ws.pipeline_runs ?? ws.runs?.length ?? 0} pipeline runs
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          to={`/workspaces/${ws.id}`}
                          className="inline-flex items-center gap-1 rounded-lg bg-brand-caramel px-2.5 py-1 text-xs font-bold text-brand-cream-light hover:bg-brand-caramel-hover transition-all"
                        >
                          <span>Open</span>
                          <ArrowUpRight className="size-3" />
                        </Link>
                        <button
                          onClick={(e) => remove(ws.id, e)}
                          aria-label={`Delete workspace ${ws.name}`}
                          className="rounded-lg border border-brand-sage bg-brand-cream-dark p-1.5 text-brand-caramel-text hover:bg-accent-contrast/15 hover:text-accent-contrast transition-colors"
                          title={`Delete workspace "${ws.name}"`}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Custom delete confirmation (replaces native confirm) */}
      {pendingDelete && (
        <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="absolute inset-0" onClick={() => setPendingDelete(null)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-ws-title"
            className="relative w-full max-w-md rounded-2xl border border-brand-sage bg-surface-white shadow-2xl overflow-hidden"
          >
            <div className="px-6 py-4 space-y-2">
              <h3 id="delete-ws-title" className="text-sm font-bold text-brand-espresso flex items-center gap-2">
                <Trash2 className="size-4 text-accent-contrast" />
                Delete workspace?
              </h3>
              <p className="text-xs text-brand-caramel-text leading-relaxed">
                Delete workspace <span className="font-mono font-bold text-brand-espresso">“{pendingDelete.id}”</span> and{' '}
                {pendingDelete.runs === 0
                  ? 'its configuration'
                  : `all ${pendingDelete.runs} recorded run${pendingDelete.runs === 1 ? '' : 's'}`}
                ? This cannot be undone.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-brand-sage/40 bg-brand-cream-dark/50 px-6 py-3.5">
              <button
                onClick={() => setPendingDelete(null)}
                className="rounded-xl px-4 py-2 text-xs font-semibold text-brand-caramel-text hover:bg-brand-cream-dark transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmRemove}
                className="rounded-xl bg-accent-contrast px-4 py-2 text-xs font-bold text-brand-cream-light hover:bg-error-hover transition-all active:scale-95"
              >
                Delete workspace
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  )
}

