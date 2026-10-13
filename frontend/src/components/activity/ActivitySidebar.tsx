import { useState, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import {
  X,
  Activity,
  Layers,
  Wrench,
  ArrowDownToLine,
  RefreshCw,
  Search,
  Check,
} from 'lucide-react'
import { api, type DownloadTask } from '../../lib/api'
import { useEscapeToClose } from '../../hooks/useEscapeToClose'
import {
  artifactsStore,
  activityStreamCoordinator,
  useArtifacts,
} from '../../lib/activityStore'
import {
  useActivityTracker,
  ActivityProvider,
  type ToolExecutionRecord,
  type ActivityTabType,
} from './ActivityContext'
import { DownloadsTab } from './tabs/DownloadsTab'
import { ArtifactsTab } from './tabs/ArtifactsTab'
import { ToolRunsTab } from './tabs/ToolRunsTab'

export { ActivityProvider, useActivityTracker, type ToolExecutionRecord }

export default function ActivitySidebar({
  onOpenAudioPlayer,
  onSendToTool,
}: {
  onOpenAudioPlayer?: (artifact: { name: string; path: string; kind?: string }) => void
  onSendToTool?: (toolId: string, inputPath: string) => void
}) {
  const {
    open,
    setOpen,
    activeTab,
    setActiveTab,
    autoOpened,
    setAutoOpened,
    toolExecutions,
    clearToolExecutions,
    removeToolExecution,
  } = useActivityTracker()

  // The drawer covers the app and dismisses on a backdrop click, so it is a
  // dialog: it needs the name, role and Escape key the shell's other overlays
  // already have.
  useEscapeToClose(open, () => setOpen(false))

  // Downloads tasks subscribed via singleton coordinator
  const downloadTasks = useSyncExternalStore<DownloadTask[]>(
    (listener) => activityStreamCoordinator.subscribeTasks(listener),
    () => activityStreamCoordinator.getTasks(),
    () => []
  )

  // Disk artifacts cached via SWR store
  const artifacts = useArtifacts()

  const [filterQuery, setFilterQuery] = useState('')
  const [filterKind, setFilterKind] = useState<string>('ALL')
  const [clearing, setClearing] = useState(false)
  const [clearNotice, setClearNotice] = useState<string | null>(null)

  // Initial load and sync
  useEffect(() => {
    activityStreamCoordinator.loadTasks()
    artifactsStore.fetchArtifacts()
  }, [])

  // Invalidate and refresh on demand
  const handleRefresh = () => {
    activityStreamCoordinator.loadTasks()
    artifactsStore.invalidate()
    artifactsStore.fetchArtifacts(true)
  }

  const handleCancelDownload = async (taskId: string) => {
    try {
      await api.cancelDownload(taskId)
      activityStreamCoordinator.loadTasks()
    } catch {
      // Ignore error
    }
  }

  const handleRemoveDownload = async (taskId: string) => {
    try {
      await api.removeDownload(taskId)
      activityStreamCoordinator.loadTasks()
    } catch {
      // Ignore error
    }
  }

  const handleClearDownloads = async () => {
    setClearing(true)
    try {
      const res = await api.clearDownloads()
      setClearNotice(`Cleared ${res.cleared} finished task(s)`)
      setTimeout(() => setClearNotice(null), 3000)
      activityStreamCoordinator.loadTasks()
    } catch {
      setClearNotice('Failed to clear download history')
      setTimeout(() => setClearNotice(null), 3000)
    } finally {
      setClearing(false)
    }
  }

  const activeDownloads = useMemo(
    () => downloadTasks.filter((t) => t.status === 'running' || t.status === 'queued').length,
    [downloadTasks]
  )

  const activeTools = useMemo(
    () => toolExecutions.filter((t) => t.status === 'running').length,
    [toolExecutions]
  )

  const totalActive = activeDownloads + activeTools

  // Auto-close only drawers that were auto-opened for a live run, once activity
  // has actually been observed and then drains. Manually opened drawers are
  // never yanked. The sawActivity guard covers the gap between run start
  // (auto-open) and task registration.
  const sawActivityRef = useRef(false)
  useEffect(() => {
    if (totalActive > 0) {
      sawActivityRef.current = true
      return
    }
    if (autoOpened && sawActivityRef.current && open) {
      sawActivityRef.current = false
      setOpen(false)
      setAutoOpened(false)
    }
  }, [autoOpened, totalActive, open, setOpen, setAutoOpened])

  // Auto-select first non-empty tab on drawer open (downloads → artifacts → runs)
  const prevOpenRef = useRef(open)
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      if (downloadTasks.length > 0) setActiveTab('downloads')
      else if (artifacts.length > 0) setActiveTab('artifacts')
      else if (toolExecutions.length > 0) setActiveTab('runs')
      else setActiveTab('downloads')
    }
    prevOpenRef.current = open
  }, [open, downloadTasks.length, artifacts.length, toolExecutions.length, setActiveTab])

  // Map backwards-compatible tab names if needed
  const normalizedTab: ActivityTabType =
    (activeTab as string) === 'history'
      ? 'artifacts'
      : (activeTab as string) === 'activity'
      ? 'runs'
      : activeTab

  return (
    <>
      {/* Floating Bottom-Right Combined Activity & Downloads Pill */}
      <button
        onClick={() => setOpen(!open)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="fixed bottom-5 right-5 z-drawer inline-flex items-center gap-2.5 rounded-full border border-brand-sage bg-brand-cream px-4 py-2.5 text-xs font-semibold text-brand-espresso shadow-xl transition-all duration-150 hover:bg-brand-cream-dark hover:border-brand-caramel active:scale-[0.98] group cursor-pointer"
        title="Open Activity & Downloads Panel"
      >
        <div className="flex items-center gap-1.5 text-brand-caramel">
          <ArrowDownToLine className="size-4" />
          <Activity className="size-3.5 opacity-75" />
        </div>
        <span className="tracking-tight font-medium">Activity & Records</span>
        {totalActive > 0 ? (
          <span title={`${downloadTasks.length} downloads · ${artifacts.length} artifacts · ${toolExecutions.length} runs`} className="flex items-center gap-1.5 font-mono text-xs font-bold text-brand-espresso bg-brand-sage/40 border border-brand-caramel/40 px-2 py-0.5 rounded-full">
            <span className="h-2 w-2 rounded-full bg-brand-caramel animate-pulse" />
            {totalActive} active
          </span>
        ) : (
          <span title={`${downloadTasks.length} downloads · ${artifacts.length} artifacts · ${toolExecutions.length} runs`} className="font-mono text-xs text-brand-caramel-text bg-brand-cream-dark px-2 py-0.5 rounded-full">
            {downloadTasks.length + artifacts.length + toolExecutions.length}
          </span>
        )}
      </button>

      {/* Slide-over Drawer */}
      {open && (
        <div className="fixed inset-0 z-modal flex justify-end bg-brand-espresso/20 backdrop-blur-[2px]">
          <div className="absolute inset-0" onClick={() => setOpen(false)} aria-hidden="true" />
          <aside
            aria-labelledby="activity-drawer-title"
            aria-modal="true"
            role="dialog"
            tabIndex={-1}
            className="relative flex h-full w-[560px] max-w-[95vw] flex-col border-l border-brand-sage bg-brand-cream text-brand-espresso shadow-2xl outline-none"
          >
            {/* Drawer Header */}
            <header className="flex items-center justify-between border-b border-brand-sage/60 px-5 py-3.5 bg-brand-cream-dark/70 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-lg border border-brand-sage bg-brand-cream text-brand-caramel shadow-xs">
                  <ArrowDownToLine className="size-4" />
                </div>
                <div>
                  <h2 id="activity-drawer-title" className="text-xs font-bold uppercase tracking-wider text-brand-espresso">
                    Activity & Records
                  </h2>
                  <p className="font-mono text-xs text-brand-caramel-text">
                    {activeDownloads} downloading • {activeTools} tools running
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleRefresh}
                  className="rounded-lg p-1.5 text-brand-caramel-text transition-colors hover:bg-brand-sage/30 hover:text-brand-espresso cursor-pointer"
                  title="Refresh tasks & files"
                >
                  <RefreshCw className="size-3.5" />
                </button>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close activity panel"
                  className="rounded-lg p-1.5 text-brand-caramel-text transition-colors hover:bg-brand-sage/30 hover:text-brand-espresso cursor-pointer"
                >
                  <X className="size-4" />
                </button>
              </div>
            </header>

            {/* Navigation Tabs Bar */}
            <div className="flex items-center justify-between border-b border-brand-sage/60 bg-brand-cream-dark/40 px-5 py-2 shrink-0">
              <div className="inline-flex rounded-lg border border-brand-sage bg-brand-cream p-0.5 text-xs font-semibold">
                <button
                  onClick={() => setActiveTab('downloads')}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs transition-all cursor-pointer ${
                    normalizedTab === 'downloads'
                      ? 'bg-brand-caramel text-brand-cream-light shadow-xs font-bold'
                      : 'text-brand-espresso hover:bg-brand-cream-dark'
                  }`}
                >
                  <ArrowDownToLine className="size-3.5" />
                  <span>Downloads</span>
                  {activeDownloads > 0 ? (
                    <span className="ml-1 rounded-full bg-brand-cream-light px-1.5 py-0.2 text-xs font-bold text-brand-caramel">
                      {activeDownloads}
                    </span>
                  ) : (
                    <span className="font-mono text-xs opacity-75">
                      ({downloadTasks.length})
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setActiveTab('artifacts')}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs transition-all cursor-pointer ${
                    normalizedTab === 'artifacts'
                      ? 'bg-brand-caramel text-brand-cream-light shadow-xs font-bold'
                      : 'text-brand-espresso hover:bg-brand-cream-dark'
                  }`}
                >
                  <Layers className="size-3.5" />
                  <span>Saved Files</span>
                  <span className="font-mono text-xs opacity-75">
                    ({artifacts.length})
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab('runs')}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs transition-all cursor-pointer ${
                    normalizedTab === 'runs'
                      ? 'bg-brand-caramel text-brand-cream-light shadow-xs font-bold'
                      : 'text-brand-espresso hover:bg-brand-cream-dark'
                  }`}
                >
                  <Wrench className="size-3.5" />
                  <span>Tool Runs (this session)</span>
                  {activeTools > 0 ? (
                    <span className="ml-1 rounded-full bg-brand-cream-light px-1.5 py-0.2 text-xs font-bold text-brand-caramel">
                      {activeTools}
                    </span>
                  ) : (
                    <span className="font-mono text-xs opacity-75">
                      ({toolExecutions.length})
                    </span>
                  )}
                </button>
              </div>

              {/* Clear History Button for Downloads or Tool Runs */}
              {normalizedTab === 'downloads' && downloadTasks.length > 0 && (
                <button
                  onClick={handleClearDownloads}
                  disabled={clearing}
                  className="inline-flex items-center gap-1 rounded-md border border-brand-sage bg-brand-cream px-2 py-1 font-mono text-xs font-bold text-brand-caramel-text hover:bg-brand-cream-dark hover:text-accent-contrast transition-colors cursor-pointer"
                >
                  <span>{clearing ? 'Clearing...' : 'Clear Finished'}</span>
                </button>
              )}

              {normalizedTab === 'runs' && toolExecutions.length > 0 && (
                <button
                  onClick={clearToolExecutions}
                  className="inline-flex items-center gap-1 rounded-md border border-brand-sage bg-brand-cream px-2 py-1 font-mono text-xs font-bold text-brand-caramel-text hover:bg-brand-cream-dark hover:text-accent-contrast transition-colors cursor-pointer"
                >
                  <span>Clear History</span>
                </button>
              )}
            </div>

            {/* Live progress strip: persists across tabs while streams run */}
            {totalActive > 0 && (
              <button
                onClick={() => setActiveTab('downloads')}
                className="mx-5 mt-2 flex items-center gap-2 rounded-lg border border-brand-caramel/40 bg-brand-cream-dark px-3 py-1.5 font-mono text-xs font-bold text-brand-espresso hover:bg-brand-sage/30 transition-colors text-left"
                title="Jump to live downloads"
              >
                <span className="h-2 w-2 rounded-full bg-brand-caramel animate-pulse shrink-0" />
                <span>
                  {activeDownloads > 0 && `${activeDownloads} downloading`}
                  {activeDownloads > 0 && activeTools > 0 && ' • '}
                  {activeTools > 0 && `${activeTools} tool${activeTools === 1 ? '' : 's'} running`}
                </span>
                {normalizedTab !== 'downloads' && (
                  <span className="ml-auto text-xs text-brand-caramel underline underline-offset-2 shrink-0">View live →</span>
                )}
              </button>
            )}

            {/* Notice Toast */}
            {clearNotice && (
              <div className="mx-5 mt-2 rounded-lg border border-brand-sage bg-brand-cream-dark p-2 text-center font-mono text-xs text-brand-espresso flex items-center justify-center gap-1.5">
                <Check className="size-3 text-brand-caramel" />
                {clearNotice}
              </div>
            )}

            {/* Sticky Search & Format Filter Bar */}
            <div className="border-b border-brand-sage/40 bg-brand-cream px-5 py-2.5 space-y-2 shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 size-3.5 text-brand-caramel-text" />
                <input
                  type="text"
                  placeholder="Filter records by name, URL, or status..."
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  className="w-full rounded-lg border border-brand-sage bg-brand-cream-dark/50 pl-8 pr-3 py-1.5 font-mono text-xs text-brand-espresso placeholder:text-placeholder focus:border-brand-caramel focus:bg-surface-white focus:outline-none transition-all"
                />
                {filterQuery && (
                  <button
                    onClick={() => setFilterQuery('')}
                    className="absolute right-2 top-2 p-0.5 text-brand-caramel-text hover:text-brand-espresso"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>

              {/* Format Filter Chips for Saved Files */}
              {normalizedTab === 'artifacts' && (
                <div className="flex items-center gap-1 overflow-x-auto pb-0.5 text-xs font-mono">
                  {['ALL', 'AUDIO', 'VIDEO', 'SRT', 'DOC'].map((kind) => (
                    <button
                      key={kind}
                      onClick={() => setFilterKind(kind)}
                      className={`px-2 py-0.5 rounded-md border transition-all cursor-pointer ${
                        filterKind === kind
                          ? 'border-brand-caramel bg-brand-caramel text-brand-cream-light font-bold shadow-2xs'
                          : 'border-brand-sage bg-brand-cream-dark/50 text-brand-caramel-text hover:bg-brand-cream-dark'
                      }`}
                    >
                      {kind}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Drawer Content Body: Render Only the Active Tab (Instant Switch) */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {normalizedTab === 'downloads' && (
                <DownloadsTab
                  tasks={downloadTasks}
                  filterQuery={filterQuery}
                  onCancel={handleCancelDownload}
                  onRemove={handleRemoveDownload}
                  onPlayMedia={onOpenAudioPlayer}
                  onBrowseFiles={() => setActiveTab('artifacts')}
                />
              )}

              {normalizedTab === 'artifacts' && (
                <ArtifactsTab
                  artifacts={artifacts}
                  filterQuery={filterQuery}
                  filterKind={filterKind}
                  onOpenAudioPlayer={onOpenAudioPlayer}
                  onSendToTool={onSendToTool}
                />
              )}

              {normalizedTab === 'runs' && (
                <ToolRunsTab
                  executions={toolExecutions}
                  filterQuery={filterQuery}
                  onRemove={removeToolExecution}
                />
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  )
}
