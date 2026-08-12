import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FolderTree, Plus } from 'lucide-react'
import { api, type Workspace } from '../lib/api'

export default function WorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)

  const refresh = () => {
    api.listWorkspaces().then(({ workspaces }) => {
      setWorkspaces(workspaces)
      setLoading(false)
    })
  }

  useEffect(refresh, [])

  const create = async () => {
    if (!name.trim()) return
    await api.createWorkspace(name.trim())
    setName('')
    refresh()
  }

  const remove = async (id: string) => {
    await api.deleteWorkspace(id)
    refresh()
  }

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-8">
        <h1 className="text-3xl font-black tracking-tight text-slate-50">Workspaces</h1>
        <p className="mt-1 text-sm text-slate-400">
          Named, filesystem-backed containers holding isolated artifact stores and pipelines.
        </p>
      </header>

      <div className="mb-8 flex items-center gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && create()}
          placeholder="New workspace from Empty template…"
          className="max-w-sm flex-1 rounded-lg border border-garage-700 bg-garage-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-port-in/60"
        />
        <button
          onClick={create}
          disabled={!name.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-400 disabled:opacity-40"
        >
          <Plus className="h-4 w-4" />
          Create
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500 animate-pulse">Loading workspaces…</p>
      ) : workspaces.length === 0 ? (
        <p className="text-sm text-slate-500">No workspaces yet. Create one above.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {workspaces.map((ws) => (
            <article
              key={ws.id}
              className="group rounded-2xl border border-garage-800 bg-garage-900/60 p-5 shadow-xl transition-colors hover:border-garage-700"
            >
              <div className="mb-3 flex items-center justify-between">
                <FolderTree className="h-6 w-6 text-emerald-400" />
                <button
                  onClick={() => remove(ws.id)}
                  className="rounded-md px-2 py-1 text-xs text-slate-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
                >
                  Delete
                </button>
              </div>
              <Link to={`/workspaces/${ws.id}`}>
                <h2 className="text-base font-bold text-slate-100 transition-colors group-hover:text-port-in">
                  {ws.name}
                </h2>
              </Link>
              <p className="mt-1 text-xs text-slate-500">{ws.runs.length} runs</p>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
