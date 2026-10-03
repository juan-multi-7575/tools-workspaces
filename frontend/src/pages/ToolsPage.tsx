import { useEffect, useState, useMemo, useRef } from 'react'
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
import { api, API_BASE, errorMessage, type ToolManifest } from '../lib/api'
import { formatFileName, getArtifactBadge, getCategoryIcon } from '../lib/utils'
import { ToolForm } from '../lib/toolForms'
import ErrorBoundary, { BoundaryContent } from '../components/common/ErrorBoundary'
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
  const modalBodyRef = useRef<HTMLDivElement>(null)
  const toolModalRef = useRef<HTMLDivElement>(null)
  const currentToolState = runTarget ? toolStates[runTarget.id] : undefined

  useEffect(() => {
    if (currentToolState?.status === 'failed') {
      modalBodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [currentToolState?.status])

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
    const previousFocus = document.activeElement as HTMLElement | null
    const modal = toolModalRef.current
    if (modal) {
      const focusable = modal.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length) focusable[0].focus()
      else modal.focus()
    }
    return () => {
      previousFocus?.focus()
    }
  }, [runTarget])

  useEffect(() => {
    if (!runTarget) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        setRunTarget(null)
        return
      }
      if (e.key === 'Tab' && toolModalRef.current) {
        const modal = toolModalRef.current
        const focusableSelector =
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        const nodes = Array.from(modal.querySelectorAll<HTMLElement>(focusableSelector)).filter(
          (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true',
        )
        if (nodes.length === 0) {
          e.preventDefault()
          return
        }
        const first = nodes[0]
        const last = nodes[nodes.length - 1]
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault()
            last.focus()
          }
        } else if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
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
        const detailedErr = errorMessage(res.error) || `Tool "${runTarget.name}" failed during execution.`
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
        modalBodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' })

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
      modalBodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' })

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
            const st = toolStates[tool.id]
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

                  {/* Per-tool status badge / mini progress indicator on Card */}
                  {st && st.status !== 'idle' && (
                    <div className="mt-3 pt-2 border-t border-brand-sage/30">
                      {st.status === 'executing' && (
                        <div className="space-y-1 rounded-lg bg-brand-cream-dark/80 p-2 border border-brand-caramel/40">
                          <div className="flex items-center justify-between font-mono text-xs text-brand-espresso font-bold">
                            <span className="flex items-center gap-1">
                              <Loader2 className="size-3 animate-spin text-brand-caramel" /> Executing ({st.elapsedSeconds.toFixed(1)}s)
                            </span>
                            <span className="text-brand-caramel font-extrabold">{st.progressPercent}%</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-surface-white border border-brand-sage/50 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-brand-caramel transition-all duration-200"
                              style={{ width: `${st.progressPercent}%` }}
                            />
                          </div>
                        </div>
                      )}
                      {st.status === 'failed' && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-accent-contrast/15 px-2 py-0.5 font-mono text-xs font-bold text-accent-contrast border border-accent-contrast/30">
                          <AlertCircle className="size-3" /> Execution Failed
                        </span>
                      )}
                      {st.status === 'completed' && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-brand-sage/40 px-2 py-0.5 font-mono text-xs font-bold text-brand-espresso border border-brand-sage">
                          <CheckCircle2 className="size-3 text-brand-caramel" /> Completed ({st.elapsedSeconds.toFixed(1)}s)
                        </span>
                      )}
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
                      openRun(tool)
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
                  <th className="px-4 py-3 font-bold">Status</th>
                  <th className="px-4 py-3 font-bold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-sage/40 font-medium">
                {filteredTools.map((tool) => {
                  const st = toolStates[tool.id]
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
                      <td className="px-4 py-3">
                        {st?.status === 'executing' ? (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-brand-cream-dark px-2 py-0.5 font-mono text-xs font-bold text-brand-caramel border border-brand-caramel/40">
                            <Loader2 className="size-3 animate-spin text-brand-caramel" />
                            {st.progressPercent}%
                          </span>
                        ) : st?.status === 'failed' ? (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-accent-contrast/15 px-2 py-0.5 font-mono text-xs font-bold text-accent-contrast border border-accent-contrast/30">
                            <AlertCircle className="size-3" /> Failed
                          </span>
                        ) : st?.status === 'completed' ? (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-brand-sage/40 px-2 py-0.5 font-mono text-xs font-bold text-brand-espresso border border-brand-sage">
                            <CheckCircle2 className="size-3 text-brand-caramel" /> Ready
                          </span>
                        ) : (
                          <span className="font-mono text-xs text-brand-caramel-text">Idle</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            openRun(tool)
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
              const st = toolStates[t.id]
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
                    {st?.status === 'executing' && (
                      <Loader2 className="size-3 animate-spin text-brand-caramel" />
                    )}
                    {st?.status === 'failed' && (
                      <AlertCircle className="size-3 text-accent-contrast" />
                    )}
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
                  onClick={() => openRun(inspectorTool)}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-caramel px-4 py-2 text-xs font-bold text-brand-cream-light shadow-sm transition-all hover:bg-brand-caramel-hover active:scale-95"
                >
                  <Play className="size-3.5 fill-current" />
                  Execute Standalone Tool
                </button>
              </div>

              {/* Per-Tool Inspector Progress & Error Panel if available */}
              {toolStates[inspectorTool.id] && toolStates[inspectorTool.id].status !== 'idle' && (() => {
                const ist = toolStates[inspectorTool.id]
                return (
                  <div className="rounded-xl border border-brand-sage bg-brand-cream-dark/40 p-4 space-y-3 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold uppercase tracking-wider text-brand-caramel-text">
                        Last Tool Execution Progress & Output
                      </span>
                      <span className="font-mono text-xs text-brand-caramel-text">
                        {ist.elapsedSeconds ? `${ist.elapsedSeconds.toFixed(1)}s elapsed` : ''}
                      </span>
                    </div>

                    {ist.status === 'executing' && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs font-mono font-bold text-brand-espresso">
                          <span className="flex items-center gap-1.5">
                            <Loader2 className="size-3.5 animate-spin text-brand-caramel" />
                            {ist.phase}
                          </span>
                          <span className="text-brand-caramel">{ist.progressPercent}%</span>
                        </div>
                        <div className="h-2.5 w-full rounded-full bg-surface-white border border-brand-sage overflow-hidden">
                          <div
                            className="h-full rounded-full bg-brand-caramel transition-all duration-300"
                            style={{ width: `${ist.progressPercent}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {ist.status === 'failed' && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs font-bold text-accent-contrast">
                          <span className="flex items-center gap-1.5">
                            <AlertCircle className="size-4 text-accent-contrast" />
                            Tool Execution Failed
                          </span>
                          <button
                            onClick={() => copyErrorToClipboard(ist.error || '')}
                            className="inline-flex items-center gap-1 rounded bg-surface-white px-2 py-0.5 font-mono text-xs text-brand-espresso border border-accent-contrast/40"
                          >
                            <Copy className="size-3 text-brand-caramel-text" />
                            Copy Error
                          </button>
                        </div>
                        <pre className="p-3 rounded-lg bg-surface-dark-red text-error-light font-mono text-xs whitespace-pre-wrap break-all border border-accent-contrast/40 max-h-48 overflow-y-auto leading-relaxed">
                          {ist.error || 'Execution failed.'}
                        </pre>
                      </div>
                    )}

                    {ist.status === 'completed' && (
                      <div className="flex items-center justify-between text-xs text-brand-espresso font-semibold">
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 className="size-4 text-brand-caramel" />
                          Execution Completed Successfully
                        </span>
                        <span className="font-mono text-xs text-brand-caramel-text">
                          Artifacts: {ist.artifacts?.length || 0}
                        </span>
                      </div>
                    )}
                  </div>
                )
              })()}

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

      {/* Standalone Execution Modal Window */}
      {runTarget && (
        <div
          onClick={() => {
            if (!busy) setRunTarget(null)
          }}
          className="fixed inset-0 z-modal flex items-center justify-center p-2 sm:p-4 bg-brand-espresso/40 backdrop-blur-[2px] overflow-hidden"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="tool-modal-title"
            ref={toolModalRef}
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-3xl max-h-[92vh] flex flex-col rounded-2xl border-2 border-brand-sage bg-brand-cream shadow-2xl p-4 sm:p-6 text-brand-espresso"
          >
            {/* Modal Header */}
            <div className="mb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-brand-sage/60 pb-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-xl bg-brand-caramel text-brand-cream-light shadow-xs">
                  <SlidersHorizontal className="size-4" />
                </div>
                <div>
                  <h3 id="tool-modal-title" className="text-sm font-bold text-brand-espresso flex items-center gap-2">
                    {runTarget.name}
                    <span className="font-mono text-xs font-bold text-brand-espresso px-2 py-0.5 rounded-full bg-brand-sage/40 border border-brand-sage">
                      {runTarget.category || 'General'}
                    </span>
                  </h3>
                  <p className="font-mono text-xs text-brand-caramel-text">STANDALONE EXECUTION WORKBENCH</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {toolStates[runTarget.id]?.status === 'completed' && (
                  <div className="flex items-center gap-1 bg-brand-cream-dark p-1 rounded-xl border border-brand-sage/60 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setModalTab('form')}
                      className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                        modalTab === 'form'
                          ? 'bg-brand-caramel text-brand-cream-light shadow-xs'
                          : 'text-brand-caramel-text hover:text-brand-espresso'
                      }`}
                    >
                      Parameters
                    </button>
                    <button
                      type="button"
                      onClick={() => setModalTab('results')}
                      className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                        modalTab === 'results'
                          ? 'bg-brand-caramel text-brand-cream-light shadow-xs'
                          : 'text-brand-caramel-text hover:text-brand-espresso'
                      }`}
                    >
                      Live Results
                    </button>
                  </div>
                )}

                <button
                  onClick={() => setRunTarget(null)}
                  aria-label="Close"
                  className="rounded-lg p-1.5 text-brand-caramel-text hover:bg-brand-sage/30 hover:text-brand-espresso transition-colors"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            {/* Scrollable Form & Status Body */}
            <div ref={modalBodyRef} className="flex-1 overflow-x-hidden overflow-y-auto pr-1 min-h-0 space-y-4">
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
                        <div className="rounded-xl border border-brand-caramel/50 bg-brand-cream-dark/70 p-4 space-y-3 shadow-xs">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-xs font-bold text-brand-espresso">
                              <Loader2 className="size-4 animate-spin text-brand-caramel" />
                              <span>Executing {runTarget.name}...</span>
                            </div>
                            <div className="flex items-center gap-1 font-mono text-xs text-brand-caramel-text font-bold bg-surface-white/80 px-2 py-0.5 rounded border border-brand-sage">
                              <Clock className="size-3 text-brand-caramel" />
                              <span>{st.elapsedSeconds.toFixed(1)}s</span>
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between font-mono text-xs text-brand-caramel-text font-bold">
                              <span className="truncate max-w-[70%]">{st.phase}</span>
                              <span className="text-brand-caramel font-extrabold">{st.progressPercent}%</span>
                            </div>
                            <div className="h-3 w-full rounded-full bg-surface-white border border-brand-sage overflow-hidden p-0.5 shadow-inner">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-brand-caramel via-brand-caramel-hover to-brand-caramel transition-all duration-300 relative overflow-hidden"
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
                        <div className="rounded-xl border border-accent-contrast/50 bg-accent-contrast/10 p-4 space-y-3 shadow-xs">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-xs font-bold text-accent-contrast">
                              <AlertCircle className="size-4 text-accent-contrast shrink-0" />
                              <span>Tool Execution Failed</span>
                              <span className="font-mono text-xs text-accent-contrast/80 font-normal">
                                ({st.elapsedSeconds.toFixed(1)}s elapsed)
                              </span>
                            </div>
                            <button
                              onClick={() => copyErrorToClipboard(st.error || '')}
                              className="inline-flex items-center gap-1 rounded-lg border border-accent-contrast/40 bg-surface-white/90 px-2.5 py-1 font-mono text-xs font-bold text-brand-espresso hover:bg-surface-white transition-all"
                              title="Copy detailed error message / stderr output"
                            >
                              {copiedToolError === st.error ? (
                                <>
                                  <Check className="size-3 text-brand-caramel" />
                                  <span>Copied Stderr</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="size-3 text-brand-caramel-text" />
                                  <span>Copy Error Log</span>
                                </>
                              )}
                            </button>
                          </div>

                          <div className="space-y-1">
                            <div className="flex items-center justify-between font-mono text-xs font-bold text-accent-contrast uppercase">
                              <span className="flex items-center gap-1">
                                <Terminal className="size-3" /> Detailed Error Output / Stderr Trace
                              </span>
                            </div>
                            <pre className="p-3.5 rounded-xl bg-surface-dark-red text-error-light font-mono text-xs whitespace-pre-wrap break-all border border-accent-contrast/40 max-h-56 overflow-y-auto leading-relaxed shadow-inner font-medium">
                              {st.error || 'No detailed stderr or error message produced.'}
                            </pre>
                          </div>
                        </div>
                      )
                    }

                    if (st.status === 'completed') {
                      return (
                        <div className="rounded-2xl border border-brand-sage bg-brand-cream-dark/60 p-4 space-y-3 shadow-xs">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-brand-sage/60 pb-2.5">
                            <div className="flex items-center gap-2 text-xs font-bold text-brand-espresso">
                              <span className="flex size-6 items-center justify-center rounded-lg bg-brand-caramel text-surface-white shadow-xs">
                                <CheckCircle2 className="size-3.5" />
                              </span>
                              <span className="text-sm">Execution Completed</span>
                              <span className="font-mono text-xs text-brand-caramel-text bg-surface-white px-2 py-0.5 rounded-full border border-brand-sage">
                                {st.elapsedSeconds.toFixed(1)}s elapsed
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setModalTab('results')}
                                className="inline-flex items-center gap-1 rounded-xl bg-brand-caramel px-3 py-1.5 text-xs font-bold text-surface-white hover:bg-brand-caramel-hover transition-all shadow-xs"
                              >
                                <Sparkles className="size-3" />
                                <span>Interactive Results</span>
                              </button>
                            </div>
                          </div>

                          {/* Saved Outputs Quick Actions */}
                          {st.artifacts && st.artifacts.length > 0 ? (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between font-mono text-xs font-bold text-brand-caramel-text uppercase">
                                <span className="flex items-center gap-1">
                                  <Layers className="size-3 text-brand-caramel" />
                                  Saved Outputs ({st.artifacts.length} file{st.artifacts.length === 1 ? '' : 's'})
                                </span>
                                <span className="text-xs text-brand-caramel-text/80 lowercase font-normal">
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
                                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-xl border border-brand-sage bg-surface-white p-2.5 shadow-2xs transition-all hover:border-brand-caramel/70"
                                    >
                                      <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <span className={`font-mono text-xs font-extrabold px-1.5 py-0.5 rounded border uppercase shrink-0 ${badge.color}`}>
                                          {badge.label}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                          <p className="font-mono text-xs font-bold text-brand-espresso truncate" title={art.name}>
                                            {formatFileName(art.name, 45)}
                                          </p>
                                          <p className="font-mono text-xs text-brand-caramel-text/80 truncate select-all" title={filePath}>
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
                                              : 'border-brand-sage bg-brand-cream-dark text-brand-espresso hover:bg-brand-sage/40 hover:text-brand-caramel'
                                          }`}
                                          title="Copy exact absolute file path to clipboard"
                                        >
                                          {isCopied ? <Check className="size-3 text-emerald-700" /> : <Copy className="size-3 text-brand-caramel" />}
                                          <span>{isCopied ? 'Path Copied!' : 'Copy Path'}</span>
                                        </button>

                                        {/* 1-Click Download / Open */}
                                        <a
                                          href={downloadUrl}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="inline-flex items-center gap-1 rounded-xl border border-brand-sage bg-brand-cream-dark px-2.5 py-1 text-xs font-mono font-bold text-brand-espresso hover:bg-brand-sage/40 hover:text-brand-caramel transition-all shadow-xs"
                                          title="Download or open file directly"
                                        >
                                          <Download className="size-3 text-brand-caramel" />
                                          <span>Get File</span>
                                        </a>

                                        {/* 1-Click Use as Input */}
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setParams((prev) => ({ ...prev, input_path: filePath || art.name }))
                                          }}
                                          className="inline-flex items-center gap-1 rounded-xl border border-brand-sage/60 bg-brand-cream px-2 py-1 text-xs font-mono font-medium text-brand-caramel-text hover:bg-brand-cream-dark hover:text-brand-espresso transition-all"
                                          title="Set as input_path for next operation"
                                        >
                                          <ArrowRight className="size-3 text-brand-caramel" />
                                          <span>Use as Input</span>
                                        </button>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs text-brand-caramel-text font-mono">
                              Execution finished with no output files.
                            </p>
                          )}
                        </div>
                      )
                    }

                    return null
                  })()}

                  <ErrorBoundary name="Tool parameters" resetKey={runTarget.id}>
                    <ToolForm toolId={runTarget.id} schema={runTarget.parameters_schema || {}} value={params} onChange={setParams} />
                  </ErrorBoundary>
                </>
              )}
            </div>

            {/* Execution action bar */}
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-brand-sage/60 pt-3 shrink-0">
              <span className="font-mono text-xs text-brand-caramel-text shrink-0">
                Target ID: {runTarget.id}
              </span>
              <div className="flex items-center gap-2 min-w-0">
                <button
                  onClick={() => setRunTarget(null)}
                  className="rounded-xl px-3.5 py-1.5 text-xs font-semibold text-brand-caramel-text hover:bg-brand-cream-dark hover:text-brand-espresso transition-colors shrink-0"
                >
                  Close
                </button>
                {currentToolState?.status === 'failed' && (
                  <span
                    className="text-xs font-semibold text-accent-contrast truncate max-w-xs flex items-center gap-1"
                    title={currentToolState.error || 'Execution failed'}
                  >
                    <AlertCircle className="size-3.5 shrink-0" />
                    <span className="truncate">{currentToolState.error || 'Execution failed'}</span>
                  </span>
                )}
                {modalTab === 'results' ? (
                  <button
                    onClick={() => setModalTab('form')}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-brand-sage bg-surface-white px-3.5 py-1.5 text-xs font-bold text-brand-espresso hover:bg-brand-cream-dark transition-all shrink-0"
                  >
                    <RotateCcw className="size-3.5 text-brand-caramel" />
                    Edit Parameters
                  </button>
                ) : (
                  <button
                    onClick={run}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-brand-caramel px-4 py-2 text-xs font-bold text-brand-cream-light shadow-md transition-all hover:bg-brand-caramel-hover active:scale-95 disabled:opacity-50 shrink-0"
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
    </div>
      )} />
    </ErrorBoundary>
  )
}
