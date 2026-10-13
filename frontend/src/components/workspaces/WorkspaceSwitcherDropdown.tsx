import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FolderTree,
  ChevronDown,
  Plus,
  Layers,
  Check,
  Search,
} from 'lucide-react'
import { api, type Workspace } from '../../lib/api'
import { useEscapeToClose } from '../../hooks/useEscapeToClose'

export default function WorkspaceSwitcherDropdown({
  currentWorkspaceId,
  onSwitch,
}: {
  currentWorkspaceId?: string
  onSwitch?: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [search, setSearch] = useState('')
  const [newWsName, setNewWsName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const refreshWorkspaces = () => {
    api.listWorkspaces().then(({ workspaces }) => {
      setWorkspaces(workspaces)
    }).catch(() => {})
  }

  useEffect(() => {
    refreshWorkspaces()
  }, [])

  // Outside clicks are not the only way this closes; Escape has to work too,
  // and the trigger has to say what it opens.
  useEscapeToClose(open, () => setOpen(false))

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const handleSelect = (id: string) => {
    setOpen(false)
    if (onSwitch) {
      onSwitch(id)
    } else {
      navigate(`/workspaces/${id}`)
    }
  }

  const handleCreate = async () => {
    if (!newWsName.trim()) return
    try {
      const created = await api.createWorkspace(newWsName.trim())
      setNewWsName('')
      setIsCreating(false)
      refreshWorkspaces()
      handleSelect(created.id)
    } catch {
      /* ignore */
    }
  }

  const filtered = workspaces.filter((w) =>
    (w.name || w.id).toLowerCase().includes(search.toLowerCase()),
  )

  const activeWs = workspaces.find((w) => w.id === currentWorkspaceId)

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Switcher Trigger Button */}
      <button
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="workspace-switcher-panel"
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-brand-sage bg-brand-cream-dark/90 hover:bg-brand-cream-dark text-brand-espresso text-xs font-bold transition-all shadow-2xs group"
        title="Switch active workspace session"
      >
        <FolderTree className="size-3.5 text-brand-caramel" />
        <span className="font-mono text-xs max-w-[140px] truncate">
          {activeWs?.name || currentWorkspaceId || 'Select Workspace'}
        </span>
        <ChevronDown className={`size-3 text-brand-caramel-text transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {open && (
        <div
          id="workspace-switcher-panel"
          className="absolute left-0 mt-1.5 w-72 origin-top-left rounded-2xl border border-brand-sage bg-surface-white shadow-xl z-modal overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="p-2.5 border-b border-brand-sage/40 bg-brand-cream/60 flex items-center justify-between">
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-brand-caramel-text">
              Workspace Sessions ({workspaces.length})
            </span>
            <button
              onClick={() => setIsCreating(true)}
              className="inline-flex items-center gap-1 text-xs font-bold text-brand-caramel hover:text-brand-caramel-hover transition-colors"
            >
              <Plus className="size-3" /> New
            </button>
          </div>

          {/* Quick Search */}
          <div className="p-2 border-b border-brand-sage/30">
            <div className="relative">
              <Search className="absolute left-2.5 top-2 size-3 text-brand-caramel-text" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search workspaces..."
                className="w-full pl-7 pr-3 py-1.5 text-xs rounded-xl border border-brand-sage/60 bg-brand-cream/30 text-brand-espresso placeholder-placeholder outline-none focus:border-brand-caramel font-mono"
              />
            </div>
          </div>

          {/* Workspace List */}
          <div role="menu" aria-label="Workspace sessions" className="max-h-56 overflow-y-auto p-1.5 space-y-0.5">
            {filtered.length === 0 ? (
              <div className="py-4 text-center text-xs text-brand-caramel-text">
                No workspace found
              </div>
            ) : (
              filtered.map((w) => {
                const isSelected = w.id === currentWorkspaceId
                return (
                  <button
                    key={w.id}
                    role="menuitem"
                    onClick={() => handleSelect(w.id)}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-left text-xs transition-colors ${
                      isSelected
                        ? 'bg-brand-caramel text-brand-cream-light font-bold shadow-2xs'
                        : 'text-brand-espresso hover:bg-brand-cream-dark/60 font-medium'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Layers className={`size-3.5 shrink-0 ${isSelected ? 'text-brand-cream-light' : 'text-brand-caramel'}`} />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-mono">{w.name || w.id}</p>
                        <p className={`text-xs truncate ${isSelected ? 'text-brand-cream-light/80' : 'text-brand-caramel-text'}`}>
                          {w.runs?.length || 0} run{w.runs?.length === 1 ? '' : 's'}
                        </p>
                      </div>
                    </div>
                    {isSelected && <Check className="size-3.5 shrink-0" />}
                  </button>
                )
              })
            )}
          </div>

          {/* Inline Create Workspace Form */}
          {isCreating && (
            <div className="p-2.5 border-t border-brand-sage/40 bg-brand-cream-dark/30 space-y-2">
              <span className="font-mono text-xs font-bold text-brand-espresso uppercase tracking-wider">
                Create New Workspace
              </span>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={newWsName}
                  onChange={(e) => setNewWsName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                  placeholder="Session name..."
                  autoFocus
                  className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-brand-sage bg-surface-white text-brand-espresso outline-none focus:border-brand-caramel"
                />
                <button
                  onClick={handleCreate}
                  disabled={!newWsName.trim()}
                  className="px-3 py-1.5 rounded-xl bg-brand-caramel text-brand-cream-light text-xs font-bold hover:bg-brand-caramel-hover disabled:opacity-40 shrink-0"
                >
                  Create
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
