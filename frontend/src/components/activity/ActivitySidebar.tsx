import { useState, useEffect, useMemo, useSyncExternalStore } from 'react'
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
    toolExecutions,
    clearToolExecutions,
    removeToolExecution,
  } = useActivityTracker()

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
        className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2.5 rounded-full border border-[#B0BA99] bg-[#F7F1DE] px-4 py-2.5 text-xs font-semibold text-[#4E220F] shadow-xl transition-all duration-150 hover:bg-[#EDE5CD] hover:border-[#9D6638] active:scale-[0.98] group cursor-pointer"
        title="Open Activity & Downloads Panel"
      >
        <div className="flex items-center gap-1.5 text-[#9D6638]">
          <ArrowDownToLine className="size-4" />
          <Activity className="size-3.5 opacity-75" />
        </div>
        <span className="tracking-tight font-medium">Activity & Records</span>
        {totalActive > 0 ? (
          <span className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-[#4E220F] bg-[#B0BA99]/40 border border-[#9D6638]/40 px-2 py-0.5 rounded-full">
            <span className="h-2 w-2 rounded-full bg-[#9D6638] animate-pulse" />
            {totalActive} active
          </span>
        ) : (
          <span className="font-mono text-[11px] text-[#7C5339] bg-[#EDE5CD] px-2 py-0.5 rounded-full">
            {downloadTasks.length + artifacts.length + toolExecutions.length}
          </span>
        )}
      </button>

      {/* Slide-over Drawer */}
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-[#4E220F]/20 backdrop-blur-[2px]">
          <div className="absolute inset-0" onClick={() => setOpen(false)} />
          <aside className="relative flex h-full w-[560px] max-w-[95vw] flex-col border-l border-[#B0BA99] bg-[#F7F1DE] text-[#4E220F] shadow-2xl">
            {/* Drawer Header */}
            <header className="flex items-center justify-between border-b border-[#B0BA99]/60 px-5 py-3.5 bg-[#EDE5CD]/70 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-lg border border-[#B0BA99] bg-[#F7F1DE] text-[#9D6638] shadow-xs">
                  <ArrowDownToLine className="size-4" />
                </div>
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-[#4E220F]">
                    Activity & Records
                  </h2>
                  <p className="font-mono text-[10px] text-[#7C5339]">
                    {activeDownloads} downloading • {activeTools} tools running
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleRefresh}
                  className="rounded-lg p-1.5 text-[#7C5339] transition-colors hover:bg-[#B0BA99]/30 hover:text-[#4E220F] cursor-pointer"
                  title="Refresh tasks & files"
                >
                  <RefreshCw className="size-3.5" />
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-lg p-1.5 text-[#7C5339] transition-colors hover:bg-[#B0BA99]/30 hover:text-[#4E220F] cursor-pointer"
                >
                  <X className="size-4" />
                </button>
              </div>
            </header>

            {/* Navigation Tabs Bar */}
            <div className="flex items-center justify-between border-b border-[#B0BA99]/60 bg-[#EDE5CD]/40 px-5 py-2 shrink-0">
              <div className="inline-flex rounded-lg border border-[#B0BA99] bg-[#F7F1DE] p-0.5 text-xs font-semibold">
                <button
                  onClick={() => setActiveTab('downloads')}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs transition-all cursor-pointer ${
                    normalizedTab === 'downloads'
                      ? 'bg-[#9D6638] text-[#FDFBF7] shadow-xs font-bold'
                      : 'text-[#4E220F] hover:bg-[#EDE5CD]'
                  }`}
                >
                  <ArrowDownToLine className="size-3.5" />
                  <span>Downloads</span>
                  {activeDownloads > 0 ? (
                    <span className="ml-1 rounded-full bg-[#FDFBF7] px-1.5 py-0.2 text-[9px] font-bold text-[#9D6638]">
                      {activeDownloads}
                    </span>
                  ) : (
                    <span className="font-mono text-[10px] opacity-75">
                      ({downloadTasks.length})
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setActiveTab('artifacts')}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs transition-all cursor-pointer ${
                    normalizedTab === 'artifacts'
                      ? 'bg-[#9D6638] text-[#FDFBF7] shadow-xs font-bold'
                      : 'text-[#4E220F] hover:bg-[#EDE5CD]'
                  }`}
                >
                  <Layers className="size-3.5" />
                  <span>Saved Files</span>
                  <span className="font-mono text-[10px] opacity-75">
                    ({artifacts.length})
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab('runs')}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs transition-all cursor-pointer ${
                    normalizedTab === 'runs'
                      ? 'bg-[#9D6638] text-[#FDFBF7] shadow-xs font-bold'
                      : 'text-[#4E220F] hover:bg-[#EDE5CD]'
                  }`}
                >
                  <Wrench className="size-3.5" />
                  <span>Tool Runs</span>
                  {activeTools > 0 ? (
                    <span className="ml-1 rounded-full bg-[#FDFBF7] px-1.5 py-0.2 text-[9px] font-bold text-[#9D6638]">
                      {activeTools}
                    </span>
                  ) : (
                    <span className="font-mono text-[10px] opacity-75">
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
                  className="inline-flex items-center gap-1 rounded-md border border-[#B0BA99] bg-[#F7F1DE] px-2 py-1 font-mono text-[10px] font-bold text-[#7C5339] hover:bg-[#EDE5CD] hover:text-[#A83232] transition-colors cursor-pointer"
                >
                  <span>{clearing ? 'Clearing...' : 'Clear Finished'}</span>
                </button>
              )}

              {normalizedTab === 'runs' && toolExecutions.length > 0 && (
                <button
                  onClick={clearToolExecutions}
                  className="inline-flex items-center gap-1 rounded-md border border-[#B0BA99] bg-[#F7F1DE] px-2 py-1 font-mono text-[10px] font-bold text-[#7C5339] hover:bg-[#EDE5CD] hover:text-[#A83232] transition-colors cursor-pointer"
                >
                  <span>Clear History</span>
                </button>
              )}
            </div>

            {/* Notice Toast */}
            {clearNotice && (
              <div className="mx-5 mt-2 rounded-lg border border-[#B0BA99] bg-[#EDE5CD] p-2 text-center font-mono text-xs text-[#4E220F] flex items-center justify-center gap-1.5">
                <Check className="size-3 text-[#9D6638]" />
                {clearNotice}
              </div>
            )}

            {/* Sticky Search & Format Filter Bar */}
            <div className="border-b border-[#B0BA99]/40 bg-[#F7F1DE] px-5 py-2.5 space-y-2 shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 size-3.5 text-[#7C5339]" />
                <input
                  type="text"
                  placeholder="Filter records by name, URL, or status..."
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  className="w-full rounded-lg border border-[#B0BA99] bg-[#EDE5CD]/50 pl-8 pr-3 py-1.5 font-mono text-xs text-[#4E220F] placeholder:text-[#7C5339]/60 focus:border-[#9D6638] focus:bg-[#FFFFFF] focus:outline-none transition-all"
                />
                {filterQuery && (
                  <button
                    onClick={() => setFilterQuery('')}
                    className="absolute right-2 top-2 p-0.5 text-[#7C5339] hover:text-[#4E220F]"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>

              {/* Format Filter Chips for Saved Files */}
              {normalizedTab === 'artifacts' && (
                <div className="flex items-center gap-1 overflow-x-auto pb-0.5 text-[10px] font-mono">
                  {['ALL', 'AUDIO', 'VIDEO', 'SRT', 'DOC'].map((kind) => (
                    <button
                      key={kind}
                      onClick={() => setFilterKind(kind)}
                      className={`px-2 py-0.5 rounded-md border transition-all cursor-pointer ${
                        filterKind === kind
                          ? 'border-[#9D6638] bg-[#9D6638] text-[#FDFBF7] font-bold shadow-2xs'
                          : 'border-[#B0BA99] bg-[#EDE5CD]/50 text-[#7C5339] hover:bg-[#EDE5CD]'
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
