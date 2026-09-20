import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FolderTree, Plus, ArrowUpRight, Trash2, Layers, Folder, LayoutGrid, List, HardDrive } from 'lucide-react'
import { api, type Workspace } from '../lib/api'

export default function WorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [viewFormat, setViewFormat] = useState<'grid' | 'table'>('grid')

  const refresh = () => {
    api.listWorkspaces().then(({ workspaces }) => {
      setWorkspaces(workspaces)
      setLoading(false)
    }).catch(() => {})
  }

  useEffect(refresh, [])

  const create = async () => {
    if (!name.trim()) return
    await api.createWorkspace(name.trim())
    setName('')
    refresh()
  }

  const remove = async (id: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (confirm(`Delete workspace "${id}" and all its runs?`)) {
      await api.deleteWorkspace(id)
      refresh()
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 text-[#4E220F]">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#B0BA99] pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-[#4E220F]">Workspaces</h1>
            <span className="font-mono text-xs px-2.5 py-0.5 rounded-full bg-[#B0BA99]/40 border border-[#B0BA99] text-[#4E220F] font-semibold">
              {workspaces.length} active
            </span>
          </div>
          <p className="mt-1 text-xs text-[#7C5339]">
            Named, filesystem-backed containers holding isolated artifact stores and reusable pipelines.
          </p>
        </div>

        {/* Quick creation & View switcher */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-xl border border-[#B0BA99] bg-[#EDE5CD]/80 p-1 shadow-2xs">
            <button
              onClick={() => setViewFormat('grid')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-all ${
                viewFormat === 'grid'
                  ? 'bg-[#9D6638] text-[#FDFBF7] shadow-xs'
                  : 'text-[#4E220F] hover:bg-[#EDE5CD]'
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
                  ? 'bg-[#9D6638] text-[#FDFBF7] shadow-xs'
                  : 'text-[#4E220F] hover:bg-[#EDE5CD]'
              }`}
              title="Table View Format"
            >
              <List className="size-3.5" />
              <span className="hidden sm:inline">Table</span>
            </button>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && create()}
              placeholder="New workspace name…"
              className="w-full sm:w-64 rounded-xl border border-[#B0BA99] bg-[#FFFFFF] px-3.5 py-2 text-xs text-[#4E220F] placeholder-[#7C5339]/60 focus:border-[#9D6638] focus:outline-none shadow-xs font-medium"
            />
            <button
              onClick={create}
              disabled={!name.trim()}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#9D6638] px-4 py-2 text-xs font-bold text-[#FDFBF7] shadow-sm transition-all hover:bg-[#86542C] active:scale-95 disabled:opacity-40"
            >
              <Plus className="size-3.5" />
              Create
            </button>
          </div>
        </div>
      </div>

      {/* Grid or Table of workspaces */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-36 rounded-2xl border border-[#B0BA99]/60 bg-[#EDE5CD]/40 animate-pulse" />
          ))}
        </div>
      ) : workspaces.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#B0BA99] bg-[#EDE5CD]/30 p-10 text-center">
          <Folder className="mx-auto size-7 text-[#9D6638] mb-2 opacity-60" />
          <p className="text-sm font-bold text-[#4E220F]">No workspaces yet</p>
          <p className="mt-1 text-xs text-[#7C5339]">
            Create your first workspace above to chain tools into multi-stage pipelines.
          </p>
        </div>
      ) : viewFormat === 'grid' ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {workspaces.map((ws) => (
            <Link
              key={ws.id}
              to={`/workspaces/${ws.id}`}
              className="group relative flex flex-col justify-between rounded-2xl border border-[#B0BA99] bg-[#FFFFFF] p-4.5 shadow-xs transition-all duration-150 hover:border-[#9D6638] hover:shadow-md"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex size-8 items-center justify-center rounded-xl bg-[#EDE5CD] text-[#9D6638] group-hover:bg-[#9D6638] group-hover:text-[#FDFBF7] transition-all">
                    <FolderTree className="size-4" />
                  </div>
                  <button
                    onClick={(e) => remove(ws.id, e)}
                    className="rounded-lg p-1.5 text-[#7C5339] transition-colors hover:bg-[#A83232]/15 hover:text-[#A83232]"
                    title="Delete workspace"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold tracking-tight text-[#4E220F] group-hover:text-[#9D6638] transition-colors">
                    {ws.name}
                  </h2>
                  <ArrowUpRight className="size-4 text-[#7C5339] group-hover:text-[#9D6638] transition-colors" />
                </div>
                <p className="font-mono text-[10px] text-[#7C5339] mt-0.5">ID: {ws.id}</p>
              </div>

              <div className="mt-4 pt-3 border-t border-[#B0BA99]/40 flex items-center justify-between font-mono text-[10px] text-[#7C5339]">
                <span className="flex items-center gap-1 font-medium">
                  <Layers className="size-3 text-[#9D6638]" />
                  {ws.templates?.length || 0} templates
                </span>
                <span className="font-semibold text-[#4E220F] flex items-center gap-1">
                  <HardDrive className="size-3 text-[#9D6638]" />
                  {ws.runs?.length || 0} runs executed
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        /* FORMAT 2: TABLE VIEW FOR WORKSPACES */
        <div className="overflow-hidden rounded-2xl border border-[#B0BA99] bg-[#FFFFFF] shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[#4E220F]">
              <thead className="border-b border-[#B0BA99] bg-[#EDE5CD]/70 font-mono text-[10px] uppercase text-[#7C5339]">
                <tr>
                  <th className="px-4 py-3 font-bold">Workspace Name & Identifier</th>
                  <th className="px-4 py-3 font-bold">Pipeline Templates</th>
                  <th className="px-4 py-3 font-bold">Total Runs Executed</th>
                  <th className="px-4 py-3 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#B0BA99]/40 font-medium">
                {workspaces.map((ws) => (
                  <tr key={ws.id} className="hover:bg-[#EDE5CD]/40 transition-colors">
                    <td className="px-4 py-3">
                      <Link to={`/workspaces/${ws.id}`} className="flex items-center gap-2.5 group">
                        <div className="flex size-7 items-center justify-center rounded-lg bg-[#EDE5CD] text-[#9D6638] group-hover:bg-[#9D6638] group-hover:text-[#FDFBF7] transition-all">
                          <FolderTree className="size-3.5" />
                        </div>
                        <div>
                          <p className="font-bold text-[#4E220F] group-hover:text-[#9D6638] transition-colors">{ws.name}</p>
                          <p className="font-mono text-[10px] text-[#7C5339]">{ws.id}</p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px]">
                      <span className="rounded bg-[#EDE5CD] px-2 py-0.5 border border-[#B0BA99]/50 font-semibold">
                        {ws.templates?.length || 0} templates saved
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px]">
                      <span className="rounded bg-[#B0BA99]/30 px-2 py-0.5 border border-[#B0BA99] font-bold text-[#4E220F]">
                        {ws.runs?.length || 0} runs
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          to={`/workspaces/${ws.id}`}
                          className="inline-flex items-center gap-1 rounded-lg bg-[#9D6638] px-2.5 py-1 text-xs font-bold text-[#FDFBF7] hover:bg-[#86542C] transition-all"
                        >
                          <span>Open</span>
                          <ArrowUpRight className="size-3" />
                        </Link>
                        <button
                          onClick={(e) => remove(ws.id, e)}
                          className="rounded-lg border border-[#B0BA99] bg-[#EDE5CD] p-1.5 text-[#7C5339] hover:bg-[#A83232]/15 hover:text-[#A83232] transition-colors"
                          title="Delete Workspace"
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
    </div>
  )
}

