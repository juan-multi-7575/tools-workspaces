import { useEffect, useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowRight,
  Wrench,
  X,
  Play,
  AlertCircle,
  Search,
  SlidersHorizontal,
  Tag,
  LayoutGrid,
  List,
  Columns,
  Cpu,
  Info,
  RotateCcw,
} from 'lucide-react'
import { api, API_BASE, type ToolManifest } from '../lib/api'
import { getCategoryIcon } from '../lib/utils'
import ErrorBoundary, { BoundaryContent } from '../components/common/ErrorBoundary'

type ViewFormat = 'grid' | 'table' | 'inspector'

export default function ToolsPage(
  // `onOpenAudioPlayer` stays on the signature because App.tsx and ActivitySidebar still pass it.
  // It is no longer consumed here: tool execution moved to /tools/:toolId, which the route
  // supplies with the player directly.
  _props: {
    onOpenAudioPlayer?: (artifact: { name: string; path: string; kind?: string }) => void
  },
) {
  const [tools, setTools] = useState<ToolManifest[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [viewFormat, setViewFormat] = useState<ViewFormat>('grid')
  const [inspectorToolId, setInspectorToolId] = useState<string | null>(null)
  const [showDeprecated, setShowDeprecated] = useState(false)

  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const loadToolsCatalog = () => {
    setLoading(true)
    setFetchError(null)
    api.listTools()
      .then(({ tools }) => {
        setTools(tools)
        setLoading(false)
      })
      .catch((err) => {
        setFetchError(err instanceof Error ? err.message : 'Failed to connect to backend service')
        setLoading(false)
      })
  }

  useEffect(() => {
    loadToolsCatalog()
  }, [])

  // The legacy ?tool=&input= deep link now points at the dedicated page route.
  useEffect(() => {
    const toolParam = searchParams.get('tool')
    if (!toolParam) return
    const inputParam = searchParams.get('input')
    const query = inputParam ? `?input=${encodeURIComponent(inputParam)}` : ''
    navigate(`/tools/${encodeURIComponent(toolParam)}${query}`, { replace: true })
  }, [searchParams, navigate])

  const isDeprecatedAlias = (tool: { description?: string }) =>
    (tool.description || '').includes('[deprecated alias]')

  const deprecatedCount = useMemo(() => tools.filter(isDeprecatedAlias).length, [tools])

  const visibleTools = useMemo(
    () => (showDeprecated ? tools : tools.filter((t) => !isDeprecatedAlias(t))),
    [tools, showDeprecated],
  )

  const categories = useMemo(() => {
    const set = new Set<string>()
    tools.forEach((t) => {
      if (t.category) set.add(t.category)
    })
    return ['All', ...Array.from(set).sort()]
  }, [tools])

  const filteredTools = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = visibleTools.filter((t) => {
      const matchCategory = selectedCategory === 'All' || (t.category || 'General') === selectedCategory
      if (!matchCategory) return false
      if (!q) return true
      return (
        t.name.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        (t.category && t.category.toLowerCase().includes(q)) ||
        (t.tags && (t.tags as string[]).some((tag: string) => tag.toLowerCase().includes(q))) ||
        t.input_kinds.some((k) => k.toLowerCase().includes(q)) ||
        t.output_kinds.some((k) => k.toLowerCase().includes(q))
      )
    })
    return [...list].sort((a, b) => a.name.localeCompare(b.name))
  }, [visibleTools, search, selectedCategory])

  const inspectorTool = useMemo(() => {
    return tools.find((t) => t.id === inspectorToolId) || null
  }, [tools, inspectorToolId])

  const openToolPage = (tool: ToolManifest) => {
    navigate(`/tools/${encodeURIComponent(tool.id)}`)
  }

  return (
    <ErrorBoundary name="Tool catalog">
      <BoundaryContent render={() => (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="w-full max-w-7xl mx-auto space-y-6 text-brand-espresso min-w-0">
      {/* Header bar & View Switcher */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-brand-sage pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-brand-espresso">Universal Tool Workbench</h1>
            <span className="font-mono text-xs px-2.5 py-0.5 rounded-full bg-brand-sage/40 border border-brand-sage text-brand-espresso font-semibold">
              {filteredTools.length === visibleTools.length
                ? `${visibleTools.length} Registered Tools`
                : `${filteredTools.length} of ${visibleTools.length} shown`}
            </span>
          </div>
          <p className="mt-1 text-sm text-brand-espresso/80">
            Local-first unconstrained tool catalog. Run standalone utilities or inspect parameter schemas.
          </p>
        </div>

        {/* View Switcher & Search Bar */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Format Toggle Buttons */}
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
              <span className="hidden md:inline">Grid</span>
            </button>
            <button
              onClick={() => setViewFormat('table')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-all ${
                viewFormat === 'table'
                  ? 'bg-brand-caramel text-brand-cream-light shadow-xs'
                  : 'text-brand-espresso hover:bg-brand-cream-dark'
              }`}
              title="Compact Table List Format"
            >
              <List className="size-3.5" />
              <span className="hidden md:inline">List</span>
            </button>
            <button
              onClick={() => setViewFormat('inspector')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-all ${
                viewFormat === 'inspector'
                  ? 'bg-brand-caramel text-brand-cream-light shadow-xs'
                  : 'text-brand-espresso hover:bg-brand-cream-dark'
              }`}
              title="Interactive Inspector Split View"
            >
              <Columns className="size-3.5" />
              <span className="hidden md:inline">Inspector</span>
            </button>
          </div>

          {/* Search */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-brand-caramel-text" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tools, ports..."
              className="w-full rounded-xl border border-brand-sage bg-surface-white pl-8 pr-3 py-1.5 text-xs font-semibold text-brand-espresso placeholder-brand-caramel-text/60 transition-all focus:border-brand-caramel focus:ring-2 focus:ring-brand-caramel/20 focus:outline-none shadow-xs"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-2.5 top-2.5 text-brand-caramel-text hover:text-brand-espresso"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Category Pills Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {categories.map((cat) => {
          const count = cat === 'All' ? visibleTools.length : visibleTools.filter((t) => (t.category || 'General') === cat).length
          const active = selectedCategory === cat
          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                active
                  ? 'bg-brand-caramel text-brand-cream-light shadow-xs'
                  : 'bg-brand-cream-dark/70 text-brand-espresso border border-brand-sage/70 hover:bg-brand-cream-dark hover:border-brand-sage'
              }`}
            >
              <span>{cat}</span>
              <span
                className={`text-xs font-mono px-1.5 py-0.2 rounded-full font-bold ${
                  active ? 'bg-brand-cream-light/25 text-brand-cream-light' : 'bg-brand-sage/40 text-brand-espresso'
                }`}
              >
                {count}
              </span>
            </button>
          )
        })}
        {deprecatedCount > 0 && (
          <button
            onClick={() => setShowDeprecated((v) => !v)}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
              showDeprecated
                ? 'bg-brand-caramel text-brand-cream-light shadow-xs'
                : 'bg-brand-cream-dark/70 text-brand-espresso border border-dashed border-brand-sage/70 hover:bg-brand-cream-dark hover:border-brand-sage'
            }`}
          >
            <span>{showDeprecated ? 'Hide deprecated' : `Show deprecated (${deprecatedCount})`}</span>
          </button>
        )}
      </div>

      {/* Main Content Areas based on View Format */}
      {fetchError ? (
        <div className="rounded-2xl border border-accent-contrast/50 bg-accent-contrast/10 p-8 text-center space-y-3">
          <AlertCircle className="mx-auto size-8 text-accent-contrast" />
          <p className="text-sm font-bold text-accent-contrast">{fetchError}</p>
          <p className="text-xs text-brand-caramel-text">
            Unable to connect to the backend tools engine at <code className="bg-brand-cream-dark px-1.5 py-0.5 rounded border border-brand-sage font-bold">{API_BASE || 'localhost:8000'}</code>. Make sure the backend server is running.
          </p>
          <button
            onClick={loadToolsCatalog}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-caramel px-4 py-2 text-xs font-bold text-brand-cream-light shadow-xs hover:bg-brand-caramel-hover active:scale-95 transition-all"
          >
            <RotateCcw className="size-3.5" />
            Retry Connection
          </button>
        </div>
      ) : loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-44 rounded-2xl border border-brand-sage/60 bg-brand-cream-dark/40 animate-pulse" />
          ))}
        </div>
      ) : filteredTools.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-brand-sage bg-brand-cream-dark/30 p-10 text-center">
          <Wrench className="mx-auto size-7 text-brand-caramel mb-2 opacity-60" />
          <p className="text-sm font-bold text-brand-espresso">No matching tools found</p>
          <p className="mt-1 text-xs text-brand-caramel-text">Try selecting another category or clearing your search filter.</p>
          <button
            onClick={() => {
              setSearch('')
              setSelectedCategory('All')
            }}
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-brand-sage bg-surface-white px-4 py-2 text-xs font-bold text-brand-espresso hover:bg-brand-cream-dark transition-colors"
          >
            Clear search & filters
          </button>
        </div>
      ) : viewFormat === 'grid' ? (
        /* FORMAT 1: GRID CARDS */
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredTools.map((tool) => {
            const CategoryIcon = getCategoryIcon(tool.category)
            return (
              <article
                key={tool.id}
                onClick={() => setInspectorToolId(tool.id)}
                className="group flex flex-col justify-between rounded-2xl border border-brand-sage bg-surface-white p-4 shadow-xs transition-all duration-150 hover:border-brand-caramel hover:shadow-md cursor-pointer relative"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2.5">
                    <div className="flex items-center gap-2">
                      <div className="flex size-7 items-center justify-center rounded-lg bg-brand-cream-dark text-brand-caramel group-hover:bg-brand-caramel group-hover:text-brand-cream-light transition-all">
                        <CategoryIcon className="size-3.5" />
                      </div>
                      <span className="font-mono text-xs font-bold tracking-wide text-brand-caramel-text uppercase">
                        {tool.id}
                      </span>
                    </div>
                    <span className="rounded-md bg-brand-sage/30 px-2 py-0.5 text-xs font-semibold text-brand-espresso border border-brand-sage">
                      {tool.category || 'General'}
                    </span>
                  </div>

                  <h2 className="text-base font-bold tracking-tight text-brand-espresso group-hover:text-brand-caramel transition-colors">
                    {tool.name}{' '}
                    {isDeprecatedAlias(tool) && (
                      <span className="ml-1 align-middle font-mono text-xs font-bold uppercase px-1.5 py-0.5 rounded bg-brand-sage/40 border border-brand-sage text-brand-caramel-text">
                        deprecated
                      </span>
                    )}
                  </h2>
                  <p className="mt-1.5 text-sm leading-relaxed text-brand-caramel-text line-clamp-2">
                    {tool.description}
                  </p>

                  {tool.tags && tool.tags.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1">
                      {tool.tags.slice(0, 3).map((tag: string) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 rounded-md bg-brand-cream-dark/60 px-1.5 py-0.5 text-xs font-mono text-brand-caramel-text border border-brand-sage/40"
                        >
                          <Tag className="size-2 text-brand-caramel" />
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                </div>

                <div className="mt-4 pt-3 border-t border-brand-sage/40 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-1 font-mono text-xs text-brand-caramel-text">
                    <span className="rounded bg-brand-cream-dark px-1.5 py-0.5 border border-brand-sage/50 font-medium">
                      in: {tool.input_kinds.join(', ')}
                    </span>
                    <ArrowRight className="size-3 text-brand-caramel" />
                    <span className="rounded bg-brand-cream-dark px-1.5 py-0.5 border border-brand-sage/50 font-medium">
                      out: {tool.output_kinds.join(', ')}
                    </span>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      openToolPage(tool)
                    }}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-brand-caramel px-3 py-1.5 text-xs font-bold text-brand-cream-light shadow-xs transition-all hover:bg-brand-caramel-hover active:scale-95"
                  >
                    <Play className="size-3 fill-current" />
                    Run
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      ) : viewFormat === 'table' ? (
        /* FORMAT 2: HIGH-DENSITY COMPACT TABLE LIST */
        <div className="overflow-hidden rounded-2xl border border-brand-sage bg-surface-white shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-brand-espresso">
              <thead className="border-b border-brand-sage bg-brand-cream-dark/70 font-mono text-xs uppercase text-brand-caramel-text">
                <tr>
                  <th className="px-4 py-3 font-bold">Tool Identifier</th>
                  <th className="px-4 py-3 font-bold">Category</th>
                  <th className="px-4 py-3 font-bold">Input Ports</th>
                  <th className="px-4 py-3 font-bold">Output Ports</th>
                  <th className="px-4 py-3 font-bold">Parameters</th>
                  <th className="px-4 py-3 font-bold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-sage/40 font-medium">
                {filteredTools.map((tool) => {
                  const CategoryIcon = getCategoryIcon(tool.category)
                  return (
                    <tr
                      key={tool.id}
                      onClick={() => setInspectorToolId(tool.id)}
                      className="hover:bg-brand-cream-dark/40 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <CategoryIcon className="size-3.5 text-brand-caramel" />
                          <div>
                            <p className="text-sm font-bold text-brand-espresso">{tool.name}</p>
                            <p className="font-mono text-xs text-brand-caramel-text">{tool.id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-md bg-brand-sage/30 px-2 py-0.5 text-xs font-medium text-brand-espresso border border-brand-sage">
                          {tool.category || 'General'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        <span className="rounded bg-brand-cream-dark px-1.5 py-0.5 border border-brand-sage/50 font-medium">
                          {tool.input_kinds.join(', ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        <span className="rounded bg-brand-cream-dark px-1.5 py-0.5 border border-brand-sage/50 font-medium">
                          {tool.output_kinds.join(', ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-brand-caramel-text">
                        {Object.keys(tool.parameters_schema || {}).length}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            openToolPage(tool)
                          }}
                          className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg bg-brand-caramel px-2.5 py-1 text-xs font-bold text-brand-cream-light hover:bg-brand-caramel-hover transition-all"
                        >
                          <Play className="size-3 fill-current" />
                          Run
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* FORMAT 3: INTERACTIVE INSPECTOR SPLIT VIEW */
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[340px_1fr]">
          {/* Left Master Tools Selector */}
          <div className="rounded-2xl border border-brand-sage bg-surface-white p-3.5 space-y-2 shadow-xs max-h-[700px] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-brand-sage/50 px-1">
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-brand-caramel-text">
                Catalog Items
              </span>
              <span className="font-mono text-xs text-brand-caramel-text">{filteredTools.length} tools</span>
            </div>

            {filteredTools.map((t) => {
              const isSelected = inspectorTool?.id === t.id
              const CategoryIcon = getCategoryIcon(t.category)
              return (
                <div
                  key={t.id}
                  onClick={() => setInspectorToolId(t.id)}
                  className={`flex cursor-pointer items-center justify-between rounded-xl border p-2.5 transition-all ${
                    isSelected
                      ? 'border-brand-caramel bg-brand-cream-dark text-brand-espresso shadow-2xs'
                      : 'border-brand-sage/60 bg-brand-cream/50 hover:bg-brand-cream-dark/50'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`flex size-7 items-center justify-center rounded-lg ${
                      isSelected ? 'bg-brand-caramel text-brand-cream-light' : 'bg-brand-cream-dark text-brand-caramel'
                    }`}>
                      <CategoryIcon className="size-3.5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-brand-espresso">{t.name}</p>
                      <p className="font-mono text-xs text-brand-caramel-text">{t.id}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-brand-sage/30 text-brand-espresso border border-brand-sage/50 whitespace-nowrap">
                      {t.category || 'Gen'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Right Detail Workbench Inspector */}
          {inspectorTool && (
            <div className="rounded-2xl border-2 border-brand-sage bg-surface-white p-6 space-y-5 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-brand-sage/60 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-brand-caramel text-brand-cream-light shadow-xs">
                    <Cpu className="size-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-brand-espresso">{inspectorTool.name}</h2>
                      <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-full bg-brand-sage/40 border border-brand-sage text-brand-espresso">
                        {inspectorTool.category || 'General'}
                      </span>
                    </div>
                    <p className="font-mono text-xs text-brand-caramel-text mt-0.5">TOOL ID: {inspectorTool.id}</p>
                  </div>
                </div>

                <button
                  onClick={() => openToolPage(inspectorTool)}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-caramel px-4 py-2 text-xs font-bold text-brand-cream-light shadow-sm transition-all hover:bg-brand-caramel-hover active:scale-95"
                >
                  <Play className="size-3.5 fill-current" />
                  Execute Standalone Tool
                </button>
              </div>

              {/* Description & Tags */}
              <div className="rounded-xl border border-brand-sage/70 bg-brand-cream/70 p-4 space-y-2">
                <h3 className="text-xs font-bold text-brand-espresso flex items-center gap-1.5">
                  <Info className="size-3.5 text-brand-caramel" />
                  Tool Description
                </h3>
                <p className="text-sm leading-relaxed text-brand-caramel-text">{inspectorTool.description}</p>
                {inspectorTool.tags && inspectorTool.tags.length > 0 && (
                  <div className="pt-1 flex flex-wrap gap-1.5">
                    {inspectorTool.tags.map((tag: string) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 rounded-md bg-brand-cream-dark px-2 py-0.5 text-xs font-mono text-brand-caramel-text border border-brand-sage"
                      >
                        <Tag className="size-2.5 text-brand-caramel" />
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Typed Port Mapping Connector Diagram */}
              <div className="rounded-xl border border-brand-sage/70 bg-brand-cream-dark/50 p-4 space-y-3">
                <span className="font-mono text-xs font-bold uppercase tracking-wider text-brand-caramel-text block">
                  Hardware Port Mapping
                </span>
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex-1 w-full rounded-xl border border-brand-sage bg-surface-white p-3 text-center">
                    <p className="font-mono text-xs text-brand-caramel-text uppercase font-bold">Input Ports</p>
                    <div className="mt-1 flex flex-wrap justify-center gap-1">
                      {inspectorTool.input_kinds.map((k: string) => (
                        <span key={k} className="font-mono text-xs font-bold text-brand-caramel bg-brand-cream-dark px-2 py-0.5 rounded border border-brand-sage/60">
                          {k}
                        </span>
                      ))}
                    </div>
                  </div>

                  <ArrowRight className="size-5 text-brand-caramel shrink-0 rotate-90 sm:rotate-0" />

                  <div className="flex-1 w-full rounded-xl border border-brand-sage bg-surface-white p-3 text-center">
                    <p className="font-mono text-xs text-brand-caramel-text uppercase font-bold">Output Ports</p>
                    <div className="mt-1 flex flex-wrap justify-center gap-1">
                      {inspectorTool.output_kinds.map((k: string) => (
                        <span key={k} className="font-mono text-xs font-bold text-brand-espresso bg-brand-sage/40 px-2 py-0.5 rounded border border-brand-sage">
                          {k}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Schema Inspector Preview */}
              {inspectorTool.parameters_schema && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-brand-espresso flex items-center gap-1.5">
                    <SlidersHorizontal className="size-3.5 text-brand-caramel" />
                    Declared Parameters Schema
                  </h3>
                  <div className="rounded-xl border border-brand-sage bg-brand-cream p-3 font-mono text-xs text-brand-espresso max-h-48 overflow-y-auto">
                    <pre className="whitespace-pre-wrap">{JSON.stringify(inspectorTool.parameters_schema, null, 2)}</pre>
                  </div>
                </div>
              )}
            </div>
          )}
          {!inspectorTool && (
            <div className="rounded-2xl border-2 border-dashed border-brand-sage bg-brand-cream-dark/30 p-10 text-center space-y-2">
              <Cpu className="mx-auto size-8 text-brand-caramel opacity-60" />
              <p className="text-sm font-bold text-brand-espresso">Select a tool to inspect</p>
              <p className="text-xs text-brand-caramel-text">Click any card or list row to see its description, port mapping, and parameter schema.</p>
            </div>
          )}
        </div>
      )}

    </div>
    </div>
      )} />
    </ErrorBoundary>
  )
}
