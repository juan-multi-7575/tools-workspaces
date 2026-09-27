import { useEffect, useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ArrowRight,
  Wrench,
  X,
  Play,
  CheckCircle2,
  AlertCircle,
  Search,
  SlidersHorizontal,
  Tag,
  LayoutGrid,
  List,
  Columns,
  Cpu,
  Info,
  Clock,
  Loader2,
  Copy,
  Check,
  Terminal,
  RotateCcw,
  Download,
  Layers,
  Sparkles,
} from 'lucide-react'
import { api, API_BASE, type ToolManifest } from '../lib/api'
import { formatFileName, getArtifactBadge, getCategoryIcon } from '../lib/utils'
import DynamicForm from '../components/common/DynamicForm'
import ModelHealthCheckForm from '../components/tools/ModelHealthCheckForm'
import DownloaderForm from '../components/tools/DownloaderForm'
import TranslatorForm from '../components/tools/TranslatorForm'
import ToolResultViewer from '../components/tools/ToolResultViewer'
import { useActivityTracker } from '../components/activity/ActivitySidebar'

type ViewFormat = 'grid' | 'table' | 'inspector'

export interface ToolExecutionProgress {
  toolId: string
  status: 'idle' | 'executing' | 'completed' | 'failed'
  progressPercent: number
  phase: string
  startTime?: number
  elapsedSeconds: number
  error?: string | null
  artifacts?: { name: string; path?: string; kind?: string }[]
  data?: Record<string, any> | null
  outputText?: string | null
}

export default function ToolsPage({
  onOpenAudioPlayer,
}: {
  onOpenAudioPlayer?: (artifact: { name: string; path: string; kind?: string }) => void
}) {
  const [tools, setTools] = useState<ToolManifest[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [viewFormat, setViewFormat] = useState<ViewFormat>('grid')
  const [inspectorToolId, setInspectorToolId] = useState<string | null>(null)
  const [showDeprecated, setShowDeprecated] = useState(false)
  
  const [runTarget, setRunTarget] = useState<ToolManifest | null>(null)
  const [params, setParams] = useState<Record<string, unknown>>({})
  const [busy, setBusy] = useState(false)
  const [modalTab, setModalTab] = useState<'form' | 'results'>('form')
  const [toolStates, setToolStates] = useState<Record<string, ToolExecutionProgress>>({})
  const [copiedToolError, setCopiedToolError] = useState<string | null>(null)
  const [copiedPath, setCopiedPath] = useState<string | null>(null)

  const [searchParams] = useSearchParams()
  const { recordToolExecution, updateToolExecution } = useActivityTracker()

  const loadToolsCatalog = () => {
    setLoading(true)
    setFetchError(null)
    api.listTools()
      .then(({ tools }) => {
        setTools(tools)
        setLoading(false)

        const toolParam = searchParams.get('tool')
        const inputParam = searchParams.get('input')
        if (toolParam) {
          const target = tools.find((t) => t.id === toolParam)
          if (target) {
            setRunTarget(target)
            setInspectorToolId(target.id)
            if (inputParam) {
              setParams({ input_path: inputParam })
            }
          }
        }
      })
      .catch((err) => {
        setFetchError(err instanceof Error ? err.message : 'Failed to connect to backend service')
        setLoading(false)
      })
  }

  useEffect(() => {
    loadToolsCatalog()
  }, [])

  useEffect(() => {
    if (!runTarget) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        setRunTarget(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [runTarget, busy])

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

  const openRun = (tool: ToolManifest) => {
    setRunTarget(tool)
    const initialParams: Record<string, unknown> = {}
    if (tool.parameters_schema) {
      for (const [k, v] of Object.entries(tool.parameters_schema)) {
        if (v && typeof v === 'object' && 'default' in v && (v as any).default !== undefined) {
          initialParams[k] = (v as any).default
        }
      }
    }
    setParams(initialParams)
    // Always show the Parameters / Main section when opening the tool modal
    setModalTab('form')
  }

  const copyErrorToClipboard = (errText: string) => {
    navigator.clipboard.writeText(errText)
    setCopiedToolError(errText)
    setTimeout(() => setCopiedToolError(null), 2500)
  }

  const run = async () => {
    if (!runTarget) return
    const toolId = runTarget.id
    setBusy(true)
    setModalTab('form')
    const execId = Math.random().toString(36).substring(2, 10)
    const startTime = Date.now()

    setToolStates((prev) => ({
      ...prev,
      [toolId]: {
        toolId,
        status: 'executing',
        progressPercent: 10,
        phase: `Initializing execution environment for ${runTarget.name}...`,
        startTime,
        elapsedSeconds: 0,
        error: null,
        artifacts: [],
      },
    }))

    recordToolExecution({
      id: execId,
      toolId,
      toolName: runTarget.name,
      status: 'running',
      startTime,
      params,
    })

    const progressInterval = setInterval(() => {
      setToolStates((prev) => {
        const current = prev[toolId]
        if (!current || current.status !== 'executing') return prev

        const elapsed = (Date.now() - startTime) / 1000
        let nextPercent = 10
        let nextPhase = `Executing ${runTarget.name}...`

        if (elapsed < 1.5) {
          nextPercent = Math.min(35, 10 + elapsed * 16)
          nextPhase = `Validating parameters & preparing runtime environment...`
        } else if (elapsed < 4) {
          nextPercent = Math.min(65, 35 + (elapsed - 1.5) * 12)
          nextPhase = `Processing streams and running tool process...`
        } else if (elapsed < 8) {
          nextPercent = Math.min(88, 65 + (elapsed - 4) * 5)
          nextPhase = `Transcoding media & formatting output artifacts...`
        } else {
          nextPercent = Math.min(95, 88 + (elapsed - 8) * 1)
          nextPhase = `Finalizing output files & wrapping process handles...`
        }

        return {
          ...prev,
          [toolId]: {
            ...current,
            elapsedSeconds: elapsed,
            progressPercent: Math.round(nextPercent),
            phase: nextPhase,
          },
        }
      })
    }, 200)

    try {
      const res = await api.executeTool(toolId, {
        kind: 'standalone',
        destination: '',
        params,
      })
      clearInterval(progressInterval)
      const finalElapsed = (Date.now() - startTime) / 1000
      const finalArtifacts = (res.artifacts as { name: string; path: string; kind?: string }[]) ?? []

      if (res.status === 'completed' || (!res.error && res.status !== 'failed')) {
        const successState: ToolExecutionProgress = {
          toolId,
          status: 'completed',
          progressPercent: 100,
          phase: 'Execution completed successfully',
          elapsedSeconds: finalElapsed,
          error: null,
          artifacts: finalArtifacts,
          data: res.data || null,
          outputText: res.output_text || null,
        }
        setToolStates((prev) => ({ ...prev, [toolId]: successState }))
        setModalTab('results')

        updateToolExecution(execId, {
          status: 'completed',
          error: null,
          artifacts: finalArtifacts,
          endTime: Date.now(),
          durationSeconds: finalElapsed,
        })
      } else {
        const detailedErr = res.error || `Tool "${runTarget.name}" failed during execution.`
        const failState: ToolExecutionProgress = {
          toolId,
          status: 'failed',
          progressPercent: 100,
          phase: 'Execution failed',
          elapsedSeconds: finalElapsed,
          error: detailedErr,
          artifacts: [],
        }
        setToolStates((prev) => ({ ...prev, [toolId]: failState }))

        updateToolExecution(execId, {
          status: 'failed',
          error: detailedErr,
          endTime: Date.now(),
          durationSeconds: finalElapsed,
        })
      }
    } catch (err: unknown) {
      clearInterval(progressInterval)
      const finalElapsed = (Date.now() - startTime) / 1000
      const errMsg = err instanceof Error ? err.message : 'Execution failed with unknown error'
      const failState: ToolExecutionProgress = {
        toolId,
        status: 'failed',
        progressPercent: 100,
        phase: 'Execution failed',
        elapsedSeconds: finalElapsed,
        error: errMsg,
        artifacts: [],
      }
      setToolStates((prev) => ({ ...prev, [toolId]: failState }))

      updateToolExecution(execId, {
        status: 'failed',
        error: errMsg,
        endTime: Date.now(),
        durationSeconds: finalElapsed,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 text-[#4E220F] min-w-0">
      {/* Header bar & View Switcher */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#B0BA99] pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-[#4E220F]">Universal Tool Workbench</h1>
            <span className="font-mono text-xs px-2.5 py-0.5 rounded-full bg-[#B0BA99]/40 border border-[#B0BA99] text-[#4E220F] font-semibold">
              {filteredTools.length === visibleTools.length
                ? `${visibleTools.length} Registered Tools`
                : `${filteredTools.length} of ${visibleTools.length} shown`}
            </span>
          </div>
          <p className="mt-1 text-sm text-[#4E220F]/80">
            Local-first unconstrained tool catalog. Run standalone utilities or inspect parameter schemas.
          </p>
        </div>

        {/* View Switcher & Search Bar */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Format Toggle Buttons */}
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
              <span className="hidden md:inline">Grid</span>
            </button>
            <button
              onClick={() => setViewFormat('table')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-all ${
                viewFormat === 'table'
                  ? 'bg-[#9D6638] text-[#FDFBF7] shadow-xs'
                  : 'text-[#4E220F] hover:bg-[#EDE5CD]'
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
                  ? 'bg-[#9D6638] text-[#FDFBF7] shadow-xs'
                  : 'text-[#4E220F] hover:bg-[#EDE5CD]'
              }`}
              title="Interactive Inspector Split View"
            >
              <Columns className="size-3.5" />
              <span className="hidden md:inline">Inspector</span>
            </button>
          </div>

          {/* Search */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-[#7C5339]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tools, ports..."
              className="w-full rounded-xl border border-[#B0BA99] bg-[#FFFFFF] pl-8 pr-3 py-1.5 text-xs font-semibold text-[#4E220F] placeholder-[#7C5339]/60 transition-all focus:border-[#9D6638] focus:ring-2 focus:ring-[#9D6638]/20 focus:outline-none shadow-xs"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-2.5 text-[#7C5339] hover:text-[#4E220F]"
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
                  ? 'bg-[#9D6638] text-[#FDFBF7] shadow-xs'
                  : 'bg-[#EDE5CD]/70 text-[#4E220F] border border-[#B0BA99]/70 hover:bg-[#EDE5CD] hover:border-[#B0BA99]'
              }`}
            >
              <span>{cat}</span>
              <span
                className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full font-bold ${
                  active ? 'bg-[#FDFBF7]/25 text-[#FDFBF7]' : 'bg-[#B0BA99]/40 text-[#4E220F]'
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
                ? 'bg-[#9D6638] text-[#FDFBF7] shadow-xs'
                : 'bg-[#EDE5CD]/70 text-[#4E220F] border border-dashed border-[#B0BA99]/70 hover:bg-[#EDE5CD] hover:border-[#B0BA99]'
            }`}
          >
            <span>{showDeprecated ? 'Hide deprecated' : `Show deprecated (${deprecatedCount})`}</span>
          </button>
        )}
      </div>

      {/* Main Content Areas based on View Format */}
      {fetchError ? (
        <div className="rounded-2xl border border-[#A83232]/50 bg-[#A83232]/10 p-8 text-center space-y-3">
          <AlertCircle className="mx-auto size-8 text-[#A83232]" />
          <p className="text-sm font-bold text-[#A83232]">{fetchError}</p>
          <p className="text-xs text-[#7C5339]">
            Unable to connect to the backend tools engine at <code className="bg-[#EDE5CD] px-1.5 py-0.5 rounded border border-[#B0BA99] font-bold">{API_BASE || 'localhost:8000'}</code>. Make sure the backend server is running.
          </p>
          <button
            onClick={loadToolsCatalog}
            className="inline-flex items-center gap-2 rounded-xl bg-[#9D6638] px-4 py-2 text-xs font-bold text-[#FDFBF7] shadow-xs hover:bg-[#86542C] active:scale-95 transition-all"
          >
            <RotateCcw className="size-3.5" />
            Retry Connection
          </button>
        </div>
      ) : loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-44 rounded-2xl border border-[#B0BA99]/60 bg-[#EDE5CD]/40 animate-pulse" />
          ))}
        </div>
      ) : filteredTools.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#B0BA99] bg-[#EDE5CD]/30 p-10 text-center">
          <Wrench className="mx-auto size-7 text-[#9D6638] mb-2 opacity-60" />
          <p className="text-sm font-bold text-[#4E220F]">No matching tools found</p>
          <p className="mt-1 text-xs text-[#7C5339]">Try selecting another category or clearing your search filter.</p>
          <button
            onClick={() => {
              setSearch('')
              setSelectedCategory('All')
            }}
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-[#B0BA99] bg-[#FFFFFF] px-4 py-2 text-xs font-bold text-[#4E220F] hover:bg-[#EDE5CD] transition-colors"
          >
            Clear search & filters
          </button>
        </div>
      ) : viewFormat === 'grid' ? (
        /* FORMAT 1: GRID CARDS */
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredTools.map((tool) => {
            const st = toolStates[tool.id]
            const CategoryIcon = getCategoryIcon(tool.category)
            return (
              <article
                key={tool.id}
                onClick={() => setInspectorToolId(tool.id)}
                className="group flex flex-col justify-between rounded-2xl border border-[#B0BA99] bg-[#FFFFFF] p-4 shadow-xs transition-all duration-150 hover:border-[#9D6638] hover:shadow-md cursor-pointer relative"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2.5">
                    <div className="flex items-center gap-2">
                      <div className="flex size-7 items-center justify-center rounded-lg bg-[#EDE5CD] text-[#9D6638] group-hover:bg-[#9D6638] group-hover:text-[#FDFBF7] transition-all">
                        <CategoryIcon className="size-3.5" />
                      </div>
                      <span className="font-mono text-[10px] font-bold tracking-wide text-[#7C5339] uppercase">
                        {tool.id}
                      </span>
                    </div>
                    <span className="rounded-md bg-[#B0BA99]/30 px-2 py-0.5 text-xs font-semibold text-[#4E220F] border border-[#B0BA99]">
                      {tool.category || 'General'}
                    </span>
                  </div>

                  <h2 className="text-base font-bold tracking-tight text-[#4E220F] group-hover:text-[#9D6638] transition-colors">
                    {tool.name}{' '}
                    {isDeprecatedAlias(tool) && (
                      <span className="ml-1 align-middle font-mono text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-[#B0BA99]/40 border border-[#B0BA99] text-[#7C5339]">
                        deprecated
                      </span>
                    )}
                  </h2>
                  <p className="mt-1.5 text-sm leading-relaxed text-[#7C5339] line-clamp-2">
                    {tool.description}
                  </p>

                  {tool.tags && tool.tags.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1">
                      {tool.tags.slice(0, 3).map((tag: string) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 rounded-md bg-[#EDE5CD]/60 px-1.5 py-0.5 text-[9px] font-mono text-[#7C5339] border border-[#B0BA99]/40"
                        >
                          <Tag className="size-2 text-[#9D6638]" />
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Per-tool status badge / mini progress indicator on Card */}
                  {st && st.status !== 'idle' && (
                    <div className="mt-3 pt-2 border-t border-[#B0BA99]/30">
                      {st.status === 'executing' && (
                        <div className="space-y-1 rounded-lg bg-[#EDE5CD]/80 p-2 border border-[#9D6638]/40">
                          <div className="flex items-center justify-between font-mono text-[10px] text-[#4E220F] font-bold">
                            <span className="flex items-center gap-1">
                              <Loader2 className="size-3 animate-spin text-[#9D6638]" /> Executing ({st.elapsedSeconds.toFixed(1)}s)
                            </span>
                            <span className="text-[#9D6638] font-extrabold">{st.progressPercent}%</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-[#FFFFFF] border border-[#B0BA99]/50 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[#9D6638] transition-all duration-200"
                              style={{ width: `${st.progressPercent}%` }}
                            />
                          </div>
                        </div>
                      )}
                      {st.status === 'failed' && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-[#A83232]/15 px-2 py-0.5 font-mono text-[10px] font-bold text-[#A83232] border border-[#A83232]/30">
                          <AlertCircle className="size-3" /> Execution Failed
                        </span>
                      )}
                      {st.status === 'completed' && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-[#B0BA99]/40 px-2 py-0.5 font-mono text-[10px] font-bold text-[#4E220F] border border-[#B0BA99]">
                          <CheckCircle2 className="size-3 text-[#9D6638]" /> Completed ({st.elapsedSeconds.toFixed(1)}s)
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-[#B0BA99]/40 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-1 font-mono text-xs text-[#7C5339]">
                    <span className="rounded bg-[#EDE5CD] px-1.5 py-0.5 border border-[#B0BA99]/50 font-medium">
                      in: {tool.input_kinds.join(', ')}
                    </span>
                    <ArrowRight className="size-3 text-[#9D6638]" />
                    <span className="rounded bg-[#EDE5CD] px-1.5 py-0.5 border border-[#B0BA99]/50 font-medium">
                      out: {tool.output_kinds.join(', ')}
                    </span>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      openRun(tool)
                    }}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#9D6638] px-3 py-1.5 text-xs font-bold text-[#FDFBF7] shadow-xs transition-all hover:bg-[#86542C] active:scale-95"
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
        <div className="overflow-hidden rounded-2xl border border-[#B0BA99] bg-[#FFFFFF] shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[#4E220F]">
              <thead className="border-b border-[#B0BA99] bg-[#EDE5CD]/70 font-mono text-[10px] uppercase text-[#7C5339]">
                <tr>
                  <th className="px-4 py-3 font-bold">Tool Identifier</th>
                  <th className="px-4 py-3 font-bold">Category</th>
                  <th className="px-4 py-3 font-bold">Input Ports</th>
                  <th className="px-4 py-3 font-bold">Output Ports</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                  <th className="px-4 py-3 font-bold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#B0BA99]/40 font-medium">
                {filteredTools.map((tool) => {
                  const st = toolStates[tool.id]
                  const CategoryIcon = getCategoryIcon(tool.category)
                  return (
                    <tr
                      key={tool.id}
                      onClick={() => setInspectorToolId(tool.id)}
                      className="hover:bg-[#EDE5CD]/40 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <CategoryIcon className="size-3.5 text-[#9D6638]" />
                          <div>
                            <p className="text-sm font-bold text-[#4E220F]">{tool.name}</p>
                            <p className="font-mono text-[10px] text-[#7C5339]">{tool.id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-md bg-[#B0BA99]/30 px-2 py-0.5 text-xs font-medium text-[#4E220F] border border-[#B0BA99]">
                          {tool.category || 'General'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        <span className="rounded bg-[#EDE5CD] px-1.5 py-0.5 border border-[#B0BA99]/50 font-medium">
                          {tool.input_kinds.join(', ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        <span className="rounded bg-[#EDE5CD] px-1.5 py-0.5 border border-[#B0BA99]/50 font-medium">
                          {tool.output_kinds.join(', ')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {st?.status === 'executing' ? (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-[#EDE5CD] px-2 py-0.5 font-mono text-[10px] font-bold text-[#9D6638] border border-[#9D6638]/40">
                            <Loader2 className="size-3 animate-spin text-[#9D6638]" />
                            {st.progressPercent}%
                          </span>
                        ) : st?.status === 'failed' ? (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-[#A83232]/15 px-2 py-0.5 font-mono text-[10px] font-bold text-[#A83232] border border-[#A83232]/30">
                            <AlertCircle className="size-3" /> Failed
                          </span>
                        ) : st?.status === 'completed' ? (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-[#B0BA99]/40 px-2 py-0.5 font-mono text-[10px] font-bold text-[#4E220F] border border-[#B0BA99]">
                            <CheckCircle2 className="size-3 text-[#9D6638]" /> Ready
                          </span>
                        ) : (
                          <span className="font-mono text-[10px] text-[#7C5339]">Idle</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            openRun(tool)
                          }}
                          className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg bg-[#9D6638] px-2.5 py-1 text-xs font-bold text-[#FDFBF7] hover:bg-[#86542C] transition-all"
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
          <div className="rounded-2xl border border-[#B0BA99] bg-[#FFFFFF] p-3.5 space-y-2 shadow-xs max-h-[700px] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-[#B0BA99]/50 px-1">
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#7C5339]">
                Catalog Items
              </span>
              <span className="font-mono text-[10px] text-[#7C5339]">{filteredTools.length} tools</span>
            </div>

            {filteredTools.map((t) => {
              const isSelected = inspectorTool?.id === t.id
              const st = toolStates[t.id]
              const CategoryIcon = getCategoryIcon(t.category)
              return (
                <div
                  key={t.id}
                  onClick={() => setInspectorToolId(t.id)}
                  className={`flex cursor-pointer items-center justify-between rounded-xl border p-2.5 transition-all ${
                    isSelected
                      ? 'border-[#9D6638] bg-[#EDE5CD] text-[#4E220F] shadow-2xs'
                      : 'border-[#B0BA99]/60 bg-[#F7F1DE]/50 hover:bg-[#EDE5CD]/50'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`flex size-7 items-center justify-center rounded-lg ${
                      isSelected ? 'bg-[#9D6638] text-[#FDFBF7]' : 'bg-[#EDE5CD] text-[#9D6638]'
                    }`}>
                      <CategoryIcon className="size-3.5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-[#4E220F]">{t.name}</p>
                      <p className="font-mono text-[10px] text-[#7C5339]">{t.id}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {st?.status === 'executing' && (
                      <Loader2 className="size-3 animate-spin text-[#9D6638]" />
                    )}
                    {st?.status === 'failed' && (
                      <AlertCircle className="size-3 text-[#A83232]" />
                    )}
                    <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-[#B0BA99]/30 text-[#4E220F] border border-[#B0BA99]/50 whitespace-nowrap">
                      {t.category || 'Gen'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Right Detail Workbench Inspector */}
          {inspectorTool && (
            <div className="rounded-2xl border-2 border-[#B0BA99] bg-[#FFFFFF] p-6 space-y-5 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#B0BA99]/60 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-[#9D6638] text-[#FDFBF7] shadow-xs">
                    <Cpu className="size-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-[#4E220F]">{inspectorTool.name}</h2>
                      <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-full bg-[#B0BA99]/40 border border-[#B0BA99] text-[#4E220F]">
                        {inspectorTool.category || 'General'}
                      </span>
                    </div>
                    <p className="font-mono text-[10px] text-[#7C5339] mt-0.5">TOOL ID: {inspectorTool.id}</p>
                  </div>
                </div>

                <button
                  onClick={() => openRun(inspectorTool)}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#9D6638] px-4 py-2 text-xs font-bold text-[#FDFBF7] shadow-sm transition-all hover:bg-[#86542C] active:scale-95"
                >
                  <Play className="size-3.5 fill-current" />
                  Execute Standalone Tool
                </button>
              </div>

              {/* Per-Tool Inspector Progress & Error Panel if available */}
              {toolStates[inspectorTool.id] && toolStates[inspectorTool.id].status !== 'idle' && (() => {
                const ist = toolStates[inspectorTool.id]
                return (
                  <div className="rounded-xl border border-[#B0BA99] bg-[#EDE5CD]/40 p-4 space-y-3 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#7C5339]">
                        Last Tool Execution Progress & Output
                      </span>
                      <span className="font-mono text-[10px] text-[#7C5339]">
                        {ist.elapsedSeconds ? `${ist.elapsedSeconds.toFixed(1)}s elapsed` : ''}
                      </span>
                    </div>

                    {ist.status === 'executing' && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs font-mono font-bold text-[#4E220F]">
                          <span className="flex items-center gap-1.5">
                            <Loader2 className="size-3.5 animate-spin text-[#9D6638]" />
                            {ist.phase}
                          </span>
                          <span className="text-[#9D6638]">{ist.progressPercent}%</span>
                        </div>
                        <div className="h-2.5 w-full rounded-full bg-[#FFFFFF] border border-[#B0BA99] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[#9D6638] transition-all duration-300"
                            style={{ width: `${ist.progressPercent}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {ist.status === 'failed' && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs font-bold text-[#A83232]">
                          <span className="flex items-center gap-1.5">
                            <AlertCircle className="size-4 text-[#A83232]" />
                            Tool Execution Failed
                          </span>
                          <button
                            onClick={() => copyErrorToClipboard(ist.error || '')}
                            className="inline-flex items-center gap-1 rounded bg-[#FFFFFF] px-2 py-0.5 font-mono text-[10px] text-[#4E220F] border border-[#A83232]/40"
                          >
                            <Copy className="size-3 text-[#7C5339]" />
                            Copy Error
                          </button>
                        </div>
                        <pre className="p-3 rounded-lg bg-[#231212] text-[#FF9999] font-mono text-xs whitespace-pre-wrap break-all border border-[#A83232]/40 max-h-48 overflow-y-auto leading-relaxed">
                          {ist.error || 'Execution failed.'}
                        </pre>
                      </div>
                    )}

                    {ist.status === 'completed' && (
                      <div className="flex items-center justify-between text-xs text-[#4E220F] font-semibold">
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 className="size-4 text-[#9D6638]" />
                          Execution Completed Successfully
                        </span>
                        <span className="font-mono text-[10px] text-[#7C5339]">
                          Artifacts: {ist.artifacts?.length || 0}
                        </span>
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Description & Tags */}
              <div className="rounded-xl border border-[#B0BA99]/70 bg-[#F7F1DE]/70 p-4 space-y-2">
                <h3 className="text-xs font-bold text-[#4E220F] flex items-center gap-1.5">
                  <Info className="size-3.5 text-[#9D6638]" />
                  Tool Description
                </h3>
                <p className="text-sm leading-relaxed text-[#7C5339]">{inspectorTool.description}</p>
                {inspectorTool.tags && inspectorTool.tags.length > 0 && (
                  <div className="pt-1 flex flex-wrap gap-1.5">
                    {inspectorTool.tags.map((tag: string) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 rounded-md bg-[#EDE5CD] px-2 py-0.5 text-[10px] font-mono text-[#7C5339] border border-[#B0BA99]"
                      >
                        <Tag className="size-2.5 text-[#9D6638]" />
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Typed Port Mapping Connector Diagram */}
              <div className="rounded-xl border border-[#B0BA99]/70 bg-[#EDE5CD]/50 p-4 space-y-3">
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#7C5339] block">
                  Hardware Port Mapping
                </span>
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex-1 w-full rounded-xl border border-[#B0BA99] bg-[#FFFFFF] p-3 text-center">
                    <p className="font-mono text-[9px] text-[#7C5339] uppercase font-bold">Input Ports</p>
                    <div className="mt-1 flex flex-wrap justify-center gap-1">
                      {inspectorTool.input_kinds.map((k: string) => (
                        <span key={k} className="font-mono text-xs font-bold text-[#9D6638] bg-[#EDE5CD] px-2 py-0.5 rounded border border-[#B0BA99]/60">
                          {k}
                        </span>
                      ))}
                    </div>
                  </div>

                  <ArrowRight className="size-5 text-[#9D6638] shrink-0 rotate-90 sm:rotate-0" />

                  <div className="flex-1 w-full rounded-xl border border-[#B0BA99] bg-[#FFFFFF] p-3 text-center">
                    <p className="font-mono text-[9px] text-[#7C5339] uppercase font-bold">Output Ports</p>
                    <div className="mt-1 flex flex-wrap justify-center gap-1">
                      {inspectorTool.output_kinds.map((k: string) => (
                        <span key={k} className="font-mono text-xs font-bold text-[#4E220F] bg-[#B0BA99]/40 px-2 py-0.5 rounded border border-[#B0BA99]">
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
                  <h3 className="text-xs font-bold text-[#4E220F] flex items-center gap-1.5">
                    <SlidersHorizontal className="size-3.5 text-[#9D6638]" />
                    Declared Parameters Schema
                  </h3>
                  <div className="rounded-xl border border-[#B0BA99] bg-[#F7F1DE] p-3 font-mono text-[11px] text-[#4E220F] max-h-48 overflow-y-auto">
                    <pre className="whitespace-pre-wrap">{JSON.stringify(inspectorTool.parameters_schema, null, 2)}</pre>
                  </div>
                </div>
              )}
            </div>
          )}
          {!inspectorTool && (
            <div className="rounded-2xl border-2 border-dashed border-[#B0BA99] bg-[#EDE5CD]/30 p-10 text-center space-y-2">
              <Cpu className="mx-auto size-8 text-[#9D6638] opacity-60" />
              <p className="text-sm font-bold text-[#4E220F]">Select a tool to inspect</p>
              <p className="text-xs text-[#7C5339]">Click any card or list row to see its description, port mapping, and parameter schema.</p>
            </div>
          )}
        </div>
      )}

      {/* Standalone Execution Modal Window */}
      {runTarget && (
        <div
          onClick={() => {
            if (!busy) setRunTarget(null)
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-[#4E220F]/40 backdrop-blur-[2px] overflow-hidden"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="tool-modal-title"
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-3xl max-h-[92vh] flex flex-col rounded-2xl border-2 border-[#B0BA99] bg-[#F7F1DE] shadow-2xl p-4 sm:p-6 text-[#4E220F]"
          >
            {/* Modal Header */}
            <div className="mb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#B0BA99]/60 pb-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-xl bg-[#9D6638] text-[#FDFBF7] shadow-xs">
                  <SlidersHorizontal className="size-4" />
                </div>
                <div>
                  <h3 id="tool-modal-title" className="text-sm font-bold text-[#4E220F] flex items-center gap-2">
                    {runTarget.name}
                    <span className="font-mono text-[10px] font-bold text-[#4E220F] px-2 py-0.5 rounded-full bg-[#B0BA99]/40 border border-[#B0BA99]">
                      {runTarget.category || 'General'}
                    </span>
                  </h3>
                  <p className="font-mono text-[10px] text-[#7C5339]">STANDALONE EXECUTION WORKBENCH</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {toolStates[runTarget.id]?.status === 'completed' && (
                  <div className="flex items-center gap-1 bg-[#EDE5CD] p-1 rounded-xl border border-[#B0BA99]/60 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setModalTab('form')}
                      className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                        modalTab === 'form'
                          ? 'bg-[#9D6638] text-[#FDFBF7] shadow-xs'
                          : 'text-[#7C5339] hover:text-[#4E220F]'
                      }`}
                    >
                      Parameters
                    </button>
                    <button
                      type="button"
                      onClick={() => setModalTab('results')}
                      className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                        modalTab === 'results'
                          ? 'bg-[#9D6638] text-[#FDFBF7] shadow-xs'
                          : 'text-[#7C5339] hover:text-[#4E220F]'
                      }`}
                    >
                      Live Results
                    </button>
                  </div>
                )}

                <button
                  onClick={() => setRunTarget(null)}
                  className="rounded-lg p-1.5 text-[#7C5339] hover:bg-[#B0BA99]/30 hover:text-[#4E220F] transition-colors"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            {/* Scrollable Form & Status Body */}
            <div className="flex-1 overflow-x-hidden overflow-y-auto pr-1 min-h-0 space-y-4">
              {modalTab === 'results' && toolStates[runTarget.id]?.status === 'completed' ? (
                <ToolResultViewer
                  toolId={runTarget.id}
                  toolName={runTarget.name}
                  status={toolStates[runTarget.id].status}
                  artifacts={(toolStates[runTarget.id].artifacts as any) || []}
                  data={toolStates[runTarget.id].data}
                  outputText={toolStates[runTarget.id].outputText}
                  elapsedSeconds={toolStates[runTarget.id].elapsedSeconds}
                  onRerun={() => setModalTab('form')}
                  onOpenAudioPlayer={(media) => {
                    if (onOpenAudioPlayer) {
                      onOpenAudioPlayer({ name: media.name, path: media.url, kind: 'audio' })
                    }
                  }}
                />
              ) : (
                <>
                  {/* Dedicated Per-Tool Execution Progress & Status Panel at the Focus/Top */}
                  {toolStates[runTarget.id] && (() => {
                    const st = toolStates[runTarget.id]
                    if (st.status === 'executing') {
                      return (
                        <div className="rounded-xl border border-[#9D6638]/50 bg-[#EDE5CD]/70 p-4 space-y-3 shadow-xs">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-xs font-bold text-[#4E220F]">
                              <Loader2 className="size-4 animate-spin text-[#9D6638]" />
                              <span>Executing {runTarget.name}...</span>
                            </div>
                            <div className="flex items-center gap-1 font-mono text-[11px] text-[#7C5339] font-bold bg-[#FFFFFF]/80 px-2 py-0.5 rounded border border-[#B0BA99]">
                              <Clock className="size-3 text-[#9D6638]" />
                              <span>{st.elapsedSeconds.toFixed(1)}s</span>
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between font-mono text-[10px] text-[#7C5339] font-bold">
                              <span className="truncate max-w-[70%]">{st.phase}</span>
                              <span className="text-[#9D6638] font-extrabold">{st.progressPercent}%</span>
                            </div>
                            <div className="h-3 w-full rounded-full bg-[#FFFFFF] border border-[#B0BA99] overflow-hidden p-0.5 shadow-inner">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-[#9D6638] via-[#86542C] to-[#9D6638] transition-all duration-300 relative overflow-hidden"
                                style={{ width: `${st.progressPercent}%` }}
                              >
                                <div className="absolute inset-0 bg-white/25 animate-pulse" />
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    }

                    if (st.status === 'failed') {
                      return (
                        <div className="rounded-xl border border-[#A83232]/50 bg-[#A83232]/10 p-4 space-y-3 shadow-xs">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-xs font-bold text-[#A83232]">
                              <AlertCircle className="size-4 text-[#A83232] shrink-0" />
                              <span>Tool Execution Failed</span>
                              <span className="font-mono text-[10px] text-[#A83232]/80 font-normal">
                                ({st.elapsedSeconds.toFixed(1)}s elapsed)
                              </span>
                            </div>
                            <button
                              onClick={() => copyErrorToClipboard(st.error || '')}
                              className="inline-flex items-center gap-1 rounded-lg border border-[#A83232]/40 bg-[#FFFFFF]/90 px-2.5 py-1 font-mono text-[10px] font-bold text-[#4E220F] hover:bg-[#FFFFFF] transition-all"
                              title="Copy detailed error message / stderr output"
                            >
                              {copiedToolError === st.error ? (
                                <>
                                  <Check className="size-3 text-[#9D6638]" />
                                  <span>Copied Stderr</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="size-3 text-[#7C5339]" />
                                  <span>Copy Error Log</span>
                                </>
                              )}
                            </button>
                          </div>

                          <div className="space-y-1">
                            <div className="flex items-center justify-between font-mono text-[10px] font-bold text-[#A83232] uppercase">
                              <span className="flex items-center gap-1">
                                <Terminal className="size-3" /> Detailed Error Output / Stderr Trace
                              </span>
                            </div>
                            <pre className="p-3.5 rounded-xl bg-[#231212] text-[#FF9999] font-mono text-xs whitespace-pre-wrap break-all border border-[#A83232]/40 max-h-56 overflow-y-auto leading-relaxed shadow-inner font-medium">
                              {st.error || 'No detailed stderr or error message produced.'}
                            </pre>
                          </div>
                        </div>
                      )
                    }

                    if (st.status === 'completed') {
                      return (
                        <div className="rounded-2xl border border-[#B0BA99] bg-[#EDE5CD]/60 p-4 space-y-3 shadow-xs">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#B0BA99]/60 pb-2.5">
                            <div className="flex items-center gap-2 text-xs font-bold text-[#4E220F]">
                              <span className="flex size-6 items-center justify-center rounded-lg bg-[#9D6638] text-[#FFFFFF] shadow-xs">
                                <CheckCircle2 className="size-3.5" />
                              </span>
                              <span className="text-sm">Execution Completed</span>
                              <span className="font-mono text-[10px] text-[#7C5339] bg-[#FFFFFF] px-2 py-0.5 rounded-full border border-[#B0BA99]">
                                {st.elapsedSeconds.toFixed(1)}s elapsed
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setModalTab('results')}
                                className="inline-flex items-center gap-1 rounded-xl bg-[#9D6638] px-3 py-1.5 text-xs font-bold text-[#FFFFFF] hover:bg-[#86542C] transition-all shadow-xs"
                              >
                                <Sparkles className="size-3" />
                                <span>Interactive Results</span>
                              </button>
                            </div>
                          </div>

                          {/* Saved Outputs Quick Actions */}
                          {st.artifacts && st.artifacts.length > 0 ? (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between font-mono text-[10px] font-bold text-[#7C5339] uppercase">
                                <span className="flex items-center gap-1">
                                  <Layers className="size-3 text-[#9D6638]" />
                                  Saved Outputs ({st.artifacts.length} file{st.artifacts.length === 1 ? '' : 's'})
                                </span>
                                <span className="text-[9px] text-[#7C5339]/80 lowercase font-normal">
                                  1-click copy path or download
                                </span>
                              </div>

                              <div className="space-y-2">
                                {st.artifacts.map((art) => {
                                  const filePath = art.path || ''
                                  const badge = getArtifactBadge(art.name)
                                  const downloadUrl = `/api/artifacts/content?path=${encodeURIComponent(filePath)}`
                                  const isCopied = copiedPath === filePath
                                  return (
                                    <div
                                      key={art.name}
                                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-xl border border-[#B0BA99] bg-[#FFFFFF] p-2.5 shadow-2xs transition-all hover:border-[#9D6638]/70"
                                    >
                                      <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <span className={`font-mono text-[9px] font-extrabold px-1.5 py-0.5 rounded border uppercase shrink-0 ${badge.color}`}>
                                          {badge.label}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                          <p className="font-mono text-xs font-bold text-[#4E220F] truncate" title={art.name}>
                                            {formatFileName(art.name, 45)}
                                          </p>
                                          <p className="font-mono text-[10px] text-[#7C5339]/80 truncate select-all" title={filePath}>
                                            {filePath || art.name}
                                          </p>
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                                        {/* 1-Click Copy Path */}
                                        <button
                                          type="button"
                                          onClick={() => {
                                            navigator.clipboard.writeText(filePath || art.name)
                                            setCopiedPath(filePath)
                                            setTimeout(() => setCopiedPath(null), 2000)
                                          }}
                                          className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-1 text-xs font-mono font-bold transition-all shadow-xs ${
                                            isCopied
                                              ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                                              : 'border-[#B0BA99] bg-[#EDE5CD] text-[#4E220F] hover:bg-[#B0BA99]/40 hover:text-[#9D6638]'
                                          }`}
                                          title="Copy exact absolute file path to clipboard"
                                        >
                                          {isCopied ? <Check className="size-3 text-emerald-700" /> : <Copy className="size-3 text-[#9D6638]" />}
                                          <span>{isCopied ? 'Path Copied!' : 'Copy Path'}</span>
                                        </button>

                                        {/* 1-Click Download / Open */}
                                        <a
                                          href={downloadUrl}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="inline-flex items-center gap-1 rounded-xl border border-[#B0BA99] bg-[#EDE5CD] px-2.5 py-1 text-xs font-mono font-bold text-[#4E220F] hover:bg-[#B0BA99]/40 hover:text-[#9D6638] transition-all shadow-xs"
                                          title="Download or open file directly"
                                        >
                                          <Download className="size-3 text-[#9D6638]" />
                                          <span>Get File</span>
                                        </a>

                                        {/* 1-Click Use as Input */}
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setParams((prev) => ({ ...prev, input_path: filePath || art.name }))
                                          }}
                                          className="inline-flex items-center gap-1 rounded-xl border border-[#B0BA99]/60 bg-[#F7F1DE] px-2 py-1 text-xs font-mono font-medium text-[#7C5339] hover:bg-[#EDE5CD] hover:text-[#4E220F] transition-all"
                                          title="Set as input_path for next operation"
                                        >
                                          <ArrowRight className="size-3 text-[#9D6638]" />
                                          <span>Use as Input</span>
                                        </button>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs text-[#7C5339] font-mono">
                              Execution finished with no output files.
                            </p>
                          )}
                        </div>
                      )
                    }

                    return null
                  })()}

                  {runTarget.id === 'ai_model_health_check' ? (
                    <ModelHealthCheckForm value={params} onChange={setParams} />
                  ) : runTarget.id === 'downloader' ? (
                    <DownloaderForm value={params} onChange={setParams} />
                  ) : runTarget.id === 'subtitle_translator' ? (
                    <TranslatorForm value={params} onChange={setParams} />
                  ) : (
                    <DynamicForm
                      schema={runTarget.parameters_schema || {}}
                      value={params}
                      onChange={setParams}
                    />
                  )}
                </>
              )}
            </div>

            {/* Execution action bar */}
            <div className="mt-3 flex items-center justify-between border-t border-[#B0BA99]/60 pt-3 shrink-0">
              <span className="font-mono text-[10px] text-[#7C5339]">
                Target ID: {runTarget.id}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setRunTarget(null)}
                  className="rounded-xl px-3.5 py-1.5 text-xs font-semibold text-[#7C5339] hover:bg-[#EDE5CD] hover:text-[#4E220F] transition-colors"
                >
                  Close
                </button>
                {modalTab === 'results' ? (
                  <button
                    onClick={() => setModalTab('form')}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#B0BA99] bg-[#FFFFFF] px-3.5 py-1.5 text-xs font-bold text-[#4E220F] hover:bg-[#EDE5CD] transition-all"
                  >
                    <RotateCcw className="size-3.5 text-[#9D6638]" />
                    Edit Parameters
                  </button>
                ) : (
                  <button
                    onClick={run}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#9D6638] px-4 py-2 text-xs font-bold text-[#FDFBF7] shadow-md transition-all hover:bg-[#86542C] active:scale-95 disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5 fill-current" />}
                    {busy ? 'Executing Tool...' : 'Execute Tool'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
