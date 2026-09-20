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
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[#B0BA99] bg-[#EDE5CD]/90 hover:bg-[#EDE5CD] text-[#4E220F] text-xs font-bold transition-all shadow-2xs group"
        title="Switch active workspace session"
      >
        <FolderTree className="size-3.5 text-[#9D6638]" />
        <span className="font-mono text-xs max-w-[140px] truncate">
          {activeWs?.name || currentWorkspaceId || 'Select Workspace'}
        </span>
        <ChevronDown className={`size-3 text-[#7C5339] transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {open && (
        <div className="absolute left-0 mt-1.5 w-72 origin-top-left rounded-2xl border border-[#B0BA99] bg-[#FFFFFF] shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          <div className="p-2.5 border-b border-[#B0BA99]/40 bg-[#F7F1DE]/60 flex items-center justify-between">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#7C5339]">
              Workspace Sessions ({workspaces.length})
            </span>
            <button
              onClick={() => setIsCreating(true)}
              className="inline-flex items-center gap-1 text-[10px] font-bold text-[#9D6638] hover:text-[#86542C] transition-colors"
            >
              <Plus className="size-3" /> New
            </button>
          </div>

          {/* Quick Search */}
          <div className="p-2 border-b border-[#B0BA99]/30">
            <div className="relative">
              <Search className="absolute left-2.5 top-2 size-3 text-[#7C5339]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search workspaces..."
                className="w-full pl-7 pr-3 py-1.5 text-xs rounded-xl border border-[#B0BA99]/60 bg-[#F7F1DE]/30 text-[#4E220F] placeholder-[#7C5339]/60 outline-none focus:border-[#9D6638] font-mono"
              />
            </div>
          </div>

          {/* Workspace List */}
          <div className="max-h-56 overflow-y-auto p-1.5 space-y-0.5">
            {filtered.length === 0 ? (
              <div className="py-4 text-center text-xs text-[#7C5339]">
                No workspace found
              </div>
            ) : (
              filtered.map((w) => {
                const isSelected = w.id === currentWorkspaceId
                return (
                  <button
                    key={w.id}
                    onClick={() => handleSelect(w.id)}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-left text-xs transition-colors ${
                      isSelected
                        ? 'bg-[#9D6638] text-[#FDFBF7] font-bold shadow-2xs'
                        : 'text-[#4E220F] hover:bg-[#EDE5CD]/60 font-medium'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Layers className={`size-3.5 shrink-0 ${isSelected ? 'text-[#FDFBF7]' : 'text-[#9D6638]'}`} />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-mono">{w.name || w.id}</p>
                        <p className={`text-[10px] truncate ${isSelected ? 'text-[#FDFBF7]/80' : 'text-[#7C5339]'}`}>
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
            <div className="p-2.5 border-t border-[#B0BA99]/40 bg-[#EDE5CD]/30 space-y-2">
              <span className="font-mono text-[10px] font-bold text-[#4E220F] uppercase tracking-wider">
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
                  className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-[#B0BA99] bg-[#FFFFFF] text-[#4E220F] outline-none focus:border-[#9D6638]"
                />
                <button
                  onClick={handleCreate}
                  disabled={!newWsName.trim()}
                  className="px-3 py-1.5 rounded-xl bg-[#9D6638] text-[#FDFBF7] text-xs font-bold hover:bg-[#86542C] disabled:opacity-40 shrink-0"
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
