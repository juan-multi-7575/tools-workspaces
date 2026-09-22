import { useState, useMemo } from 'react'
import {
  Search,
  Plus,
  Video,
  Music,
  FileText,
  Mic,
  Cpu,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Info,
} from 'lucide-react'
import { type ToolManifest } from '../../lib/api'

const CATEGORY_ICONS: Record<string, typeof Video> = {
  video: Video,
  audio: Music,
  speech: Mic,
  transcription: Mic,
  text: FileText,
  summary: Sparkles,
  ai: Cpu,
}

export default function ToolPaletteDrawer({
  tools,
  onAddTool,
  collapsed,
  onToggleCollapse,
}: {
  tools: ToolManifest[]
  onAddTool: (tool: ToolManifest) => void
  collapsed: boolean
  onToggleCollapse: () => void
}) {
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const categories = useMemo(() => {
    const counts = new Map<string, number>()
    tools.forEach((t) => {
      if (t.category) counts.set(t.category, (counts.get(t.category) || 0) + 1)
    })
    return [{ name: 'all', count: tools.length }, ...Array.from(counts.entries()).map(([name, count]) => ({ name, count }))]
  }, [tools])

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const filteredTools = useMemo(() => {
    return tools.filter((t) => {
      const matchesCategory =
        selectedCategory === 'all' || (t.category || '').toLowerCase() === selectedCategory.toLowerCase()
      const matchesSearch =
        !search.trim() ||
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.id.toLowerCase().includes(search.toLowerCase()) ||
        (t.description || '').toLowerCase().includes(search.toLowerCase())
      return matchesCategory && matchesSearch
    })
  }, [tools, selectedCategory, search])

  if (collapsed) {
    return (
      <div className="flex flex-col items-center py-3 px-1.5 border-r border-[#B0BA99] bg-[#EDE5CD]/70 shrink-0 w-12 transition-all">
        <button
          onClick={onToggleCollapse}
          className="p-1.5 rounded-xl border border-[#B0BA99] bg-[#FFFFFF] text-[#4E220F] hover:bg-[#EDE5CD] shadow-2xs transition-transform active:scale-95"
          title="Expand Tool Palette"
        >
          <ChevronRight className="size-4 text-[#9D6638]" />
        </button>
        <span className="mt-6 font-mono text-[10px] font-bold text-[#7C5339] uppercase tracking-wider [writing-mode:vertical-rl] rotate-180">
          Tools ({tools.length})
        </span>
      </div>
    )
  }

  return (
    <div className="flex flex-col border-r border-[#B0BA99] bg-[#EDE5CD]/50 w-64 shrink-0 transition-all overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-[#B0BA99]/50 flex items-center justify-between bg-[#EDE5CD]/80">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#4E220F]">
            Tool Palette
          </span>
          <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-[#9D6638] text-[#FDFBF7] font-bold">
            {filteredTools.length}
          </span>
        </div>
        <button
          onClick={onToggleCollapse}
          className="p-1 rounded-lg border border-[#B0BA99]/60 hover:bg-[#EDE5CD] text-[#7C5339] hover:text-[#4E220F] transition-colors"
          title="Collapse Drawer"
        >
          <ChevronLeft className="size-3.5" />
        </button>
      </div>

      {/* Search Bar */}
      <div className="p-2.5 border-b border-[#B0BA99]/30">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 size-3 text-[#7C5339]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tools & engines..."
            className="w-full pl-7 pr-3 py-1.5 text-xs rounded-xl border border-[#B0BA99] bg-[#FFFFFF] text-[#4E220F] placeholder-[#7C5339]/60 outline-none focus:border-[#9D6638] font-mono shadow-2xs"
          />
        </div>
      </div>

      {/* Categories Filter Pills (with counts) */}
      <div className="px-2.5 py-2 border-b border-[#B0BA99]/30 flex flex-nowrap gap-1 overflow-x-auto scrollbar-none">
        {categories.map((cat) => (
          <button
            key={cat.name}
            onClick={() => setSelectedCategory(cat.name)}
            className={`px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
              selectedCategory === cat.name
                ? 'bg-[#9D6638] text-[#FDFBF7] shadow-2xs'
                : 'bg-[#FFFFFF] border border-[#B0BA99]/60 text-[#7C5339] hover:bg-[#EDE5CD]'
            }`}
            title={`${cat.count} tool${cat.count === 1 ? '' : 's'}`}
          >
            {cat.name === 'all' ? 'All' : cat.name}{' '}
            <span className="font-mono opacity-75">({cat.count})</span>
          </button>
        ))}
      </div>

      {/* Tools List */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
        {filteredTools.length === 0 ? (
          <div className="p-6 text-center text-xs text-[#7C5339]">
            No tools match search
          </div>
        ) : (
          filteredTools.map((tool) => {
            const IconComponent = CATEGORY_ICONS[tool.category || ''] || Cpu
            const expanded = expandedIds.has(tool.id)
            return (
              <div
                key={tool.id}
                className="group relative rounded-xl border border-[#B0BA99] bg-[#FFFFFF] px-2 py-1.5 hover:border-[#9D6638] hover:shadow-xs transition-all flex flex-col gap-1"
              >
                <div className="flex items-center justify-between gap-1">
                  <button
                    onClick={() => toggleExpanded(tool.id)}
                    className="flex items-center gap-1.5 min-w-0 text-left"
                    title={expanded ? 'Hide description & ports' : `Show description & ports for ${tool.name}`}
                  >
                    {expanded ? (
                      <ChevronLeft className="size-3 text-[#9D6638] shrink-0 -rotate-90" />
                    ) : (
                      <ChevronRight className="size-3 text-[#7C5339] shrink-0" />
                    )}
                    <div className="flex size-6 items-center justify-center rounded-lg bg-[#9D6638]/10 text-[#9D6638] shrink-0">
                      <IconComponent className="size-3.5" />
                    </div>
                    <span className="text-xs font-bold text-[#4E220F] leading-tight line-clamp-2" title={tool.name}>
                      {tool.name}
                    </span>
                  </button>
                  <button
                    onClick={() => onAddTool(tool)}
                    className="flex size-6 items-center justify-center rounded-lg bg-[#9D6638] text-[#FDFBF7] hover:bg-[#86542C] transition-all shrink-0 active:scale-90 shadow-2xs"
                    title={`Add ${tool.name} to canvas`}
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>

                {expanded && (
                  <>
                    <p className="text-[10px] text-[#7C5339] line-clamp-3 leading-relaxed pl-5">
                      {tool.description || 'No description provided.'}
                    </p>

                    {/* Ports / Tags (on expand) */}
                    <div className="flex flex-wrap items-center gap-1 pt-1 ml-5 border-t border-[#B0BA99]/20">
                  {tool.input_kinds?.map((k) => (
                    <span
                      key={k}
                      className="font-mono text-[9px] px-1.5 py-0.2 rounded bg-[#EDE5CD] border border-[#B0BA99]/60 text-[#7C5339]"
                    >
                      in:{k}
                    </span>
                  ))}
                  {tool.output_kinds?.map((k) => (
                    <span
                      key={k}
                      className="font-mono text-[9px] px-1.5 py-0.2 rounded bg-[#9D6638]/10 border border-[#9D6638]/30 text-[#9D6638] font-semibold"
                    >
                      out:{k}
                    </span>
                    ))}
                    </div>
                  </>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Footer Info */}
      <div className="p-2 border-t border-[#B0BA99]/40 bg-[#EDE5CD]/40 text-[10px] text-[#7C5339] flex items-center gap-1.5">
        <Info className="size-3 text-[#9D6638] shrink-0" />
        <span>Click + to place tool on canvas</span>
      </div>
    </div>
  )
}
