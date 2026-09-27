import { useCallback, useEffect, useState, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  RefreshCw,
  FileArchive,
  Workflow,
  ArrowLeft,
  Scissors,
  X,
  CheckCircle2,
  Film,
  Trash2,
} from 'lucide-react'
import {
  api,
  type Run,
  type ArtifactFile,
  type ToolManifest,
  type PipelineRunGroup,
} from '../lib/api'
import PipelineCanvas from '../components/pipeline/PipelineCanvas'
import WaveformEditor from '../components/waveform/WaveformEditor'
import ArtifactViewerModal from '../components/artifacts/ArtifactViewerModal'
import RunDetailsModal from '../components/workspaces/RunDetailsModal'
import UnifiedMediaRunsHub from '../components/workspaces/UnifiedMediaRunsHub'
import WorkspaceSwitcherDropdown from '../components/workspaces/WorkspaceSwitcherDropdown'
import ToolPaletteDrawer from '../components/studio/ToolPaletteDrawer'
import NodeInspectorPanel from '../components/studio/NodeInspectorPanel'
import BottomArtifactsDock from '../components/studio/BottomArtifactsDock'

export default function WorkspaceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [view, setView] = useState<'pipeline' | 'media_hub'>('pipeline')
  const [tools, setTools] = useState<ToolManifest[]>([])
  const [runs, setRuns] = useState<Run[]>([])
  const [pipelineRuns, setPipelineRuns] = useState<PipelineRunGroup[]>([])
  const [selectedRun, setSelectedRun] = useState<string | null>(null)
  const [, setArtifacts] = useState<ArtifactFile[]>([])
  const [trimTarget, setTrimTarget] = useState<string | null>(null)
  const [previewTarget, setPreviewTarget] = useState<{
    name: string
    size: number
    previewUrl: string
    downloadUrl: string
  } | null>(null)
  const [inspectRunId, setInspectRunId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [paletteCollapsed, setPaletteCollapsed] = useState(false)
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false)
  const [dockExpanded, setDockExpanded] = useState(false)
  const [selectedCanvasNode, setSelectedCanvasNode] = useState<{
    id: string
    toolId: string
    label: string
    params: Record<string, unknown>
    status?: string
    durationSeconds?: number
    errorMessage?: string
    cached?: boolean
  } | null>(null)
  const [graphStats, setGraphStats] = useState({ nodeCount: 0, edgeCount: 0 })

  const addToolRef = useRef<((tool: ToolManifest) => void) | null>(null)
  const updateParamsRef = useRef<((params: Record<string, unknown>) => void) | null>(null)

  const [justCompletedRunId, setJustCompletedRunId] = useState<string | null>(null)
  const [mediaRefreshKey, setMediaRefreshKey] = useState(0)
  const [outputBanner, setOutputBanner] = useState<{ title: string; subtitle?: string } | null>(null)
  const prevPipelineIdsRef = useRef<Set<string>>(new Set())
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearCanvasSelection = () => {
    setSelectedCanvasNode(null)
  }

  const refreshRuns = useCallback(() => {
    if (!id) return
    setRefreshing(true)
    Promise.all([api.listRuns(id), api.listPipelineRuns(id)])
      .then(([{ runs }, { pipeline_runs }]) => {
        // Detect newly arrived pipeline run to trigger focus (uses ref to avoid dep loop)
        const newRuns = pipeline_runs.filter((p) => !prevPipelineIdsRef.current.has(p.pipeline_run_id))
        if (prevPipelineIdsRef.current.size > 0 && newRuns.length > 0 && newRuns[0]?.pipeline_run_id) {
          setJustCompletedRunId(newRuns[0].pipeline_run_id)
          setOutputBanner({
            title: newRuns[0].pipeline_name || 'Pipeline completed',
            subtitle: newRuns[0].bundle_name ? `Bundle: ${newRuns[0].bundle_name}` : undefined,
          })
          setView('media_hub')
          // Auto-dismiss banner after 8s (track timer to avoid leak on workspace switch)
          if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current)
          bannerTimerRef.current = setTimeout(() => {
            setOutputBanner(null)
            bannerTimerRef.current = null
          }, 8000)
        }
        prevPipelineIdsRef.current = new Set(pipeline_runs.map((p) => p.pipeline_run_id))
        setRuns(runs)
        setPipelineRuns(pipeline_runs)
        if (runs.length > 0) {
          if (!selectedRun || !runs.some((r) => r.id === selectedRun)) {
            setSelectedRun(runs[0].id)
          }
        }
        setRefreshing(false)
      })
      .catch(() => setRefreshing(false))
  }, [id, selectedRun])

  useEffect(() => {
    prevPipelineIdsRef.current = new Set()
    setJustCompletedRunId(null)
    setOutputBanner(null)
    if (bannerTimerRef.current) {
      clearTimeout(bannerTimerRef.current)
      bannerTimerRef.current = null
    }
    return () => {
      if (bannerTimerRef.current) {
        clearTimeout(bannerTimerRef.current)
        bannerTimerRef.current = null
      }
    }
  }, [id])

  useEffect(() => {
    api.listTools().then(({ tools }) => setTools(tools)).catch(() => {})
  }, [])

  useEffect(refreshRuns, [refreshRuns])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    const handleChange = () => {
      if (mq.matches) {
        setPaletteCollapsed(true)
        setInspectorCollapsed(true)
      }
    }
    handleChange()
    mq.addEventListener('change', handleChange)
    return () => mq.removeEventListener('change', handleChange)
  }, [])

  useEffect(() => {
    if (!id || !selectedRun) return
    api.listArtifacts(id, selectedRun).then(({ artifacts }) => setArtifacts(artifacts)).catch(() => {})
  }, [id, selectedRun])

  const [pendingDelete, setPendingDelete] = useState<{
    type: 'run' | 'media'
    id: string
    name: string
  } | null>(null)

  useEffect(() => {
    if (!pendingDelete) return
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPendingDelete(null)
    }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [pendingDelete])

  const removeRun = (runId: string) => {
    setPendingDelete({
      type: 'run',
      id: runId,
      name: runId,
    })
  }

  const removeMediaItem = (filename: string) => {
    setPendingDelete({
      type: 'media',
      id: filename,
      name: filename,
    })
  }

  const confirmDelete = async () => {
    if (!id || !pendingDelete) return
    const { type, id: targetId } = pendingDelete
    setPendingDelete(null)
    if (type === 'run') {
      await api.deleteRun(id, targetId)
      setSelectedRun((prev) => (prev === targetId ? null : prev))
      setArtifacts([])
      refreshRuns()
    } else if (type === 'media') {
      await api.deleteWorkspaceMedia(id, targetId)
      refreshRuns()
      setMediaRefreshKey((k) => k + 1)
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 text-[#4E220F]">
      {/* Top Breadcrumbs & Workspace Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[#B0BA99] pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link
              to="/workspaces"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#7C5339] hover:text-[#4E220F] transition-colors"
            >
              <ArrowLeft className="size-3.5" />
              Workspaces
            </Link>
            <span className="text-[#B0BA99]">/</span>
            <WorkspaceSwitcherDropdown currentWorkspaceId={id} />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-[#4E220F] flex items-center gap-2">
            Workbench
            <span className="h-2 w-2 rounded-full bg-[#9D6638]" />
          </h1>
        </div>

        {/* Action bar */}
        <div className="flex items-center gap-2">
          <button
            onClick={refreshRuns}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#B0BA99] bg-[#EDE5CD] px-3.5 py-1.5 text-xs font-semibold text-[#4E220F] transition-all hover:bg-[#B0BA99]/40 active:scale-95 disabled:opacity-50 shadow-2xs"
          >
            <RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin text-[#9D6638]' : ''}`} />
            Refresh
          </button>
          {id && (
            <a
              href={api.exportWorkspace(id)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#9D6638] px-3.5 py-1.5 text-xs font-bold text-[#FDFBF7] shadow-sm transition-all hover:bg-[#86542C] active:scale-95"
            >
              <FileArchive className="size-3.5" />
              Export ZIP
            </a>
          )}
        </div>
      </div>

      {/* Post-run outputs focus banner */}
      {outputBanner && (
        <div className="rounded-2xl border-2 border-[#9D6638]/50 bg-[#9D6638] px-5 py-3 flex items-center justify-between gap-4 shadow-md animate-in slide-in-from-top-2">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex size-8 items-center justify-center rounded-xl bg-[#FDFBF7] text-[#9D6638] shrink-0">
              <CheckCircle2 className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-[#FDFBF7] truncate">{outputBanner.title} — Outputs ready</p>
              <p className="text-xs text-[#FDFBF7]/80 truncate">{outputBanner.subtitle || 'Switched to Media, Runs & Assets. Latest outputs highlighted below.'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setView('media_hub')}
              className="rounded-xl bg-[#FDFBF7] px-3.5 py-1.5 text-xs font-bold text-[#9D6638] hover:bg-[#EDE5CD] transition-colors"
            >
              View Outputs
            </button>
            <button onClick={() => setOutputBanner(null)} className="text-[#FDFBF7]/80 hover:text-[#FDFBF7] p-1">
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}

      {/* Segmented View Switcher: 2 Clean Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#B0BA99]/60 pb-3">
        <div className="inline-flex flex-wrap rounded-xl border border-[#B0BA99] bg-[#EDE5CD]/70 p-1 gap-1">
          <button
            onClick={() => setView('pipeline')}
            className={
              'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-all ' +
              (view === 'pipeline'
                ? 'bg-[#9D6638] text-[#FDFBF7] shadow-xs'
                : 'text-[#4E220F] hover:bg-[#EDE5CD]')
            }
          >
            <Workflow className="size-3.5" />
            Pipeline Canvas
          </button>

          <button
            onClick={() => setView('media_hub')}
            className={
              'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-all ' +
              (view === 'media_hub'
                ? 'bg-[#9D6638] text-[#FDFBF7] shadow-xs'
                : 'text-[#4E220F] hover:bg-[#EDE5CD]')
            }
          >
            <Film className="size-3.5" />
            Media, Runs & Assets
            <span
              className={`font-mono text-[10px] px-2 py-0.5 rounded-full font-bold ${
                view === 'media_hub'
                  ? 'bg-[#FDFBF7]/25 text-[#FDFBF7]'
                  : 'bg-[#B0BA99]/40 text-[#4E220F]'
              }`}
            >
              {pipelineRuns.length}
            </span>
          </button>
        </div>

        <div className="hidden sm:flex items-center gap-2 font-mono text-[11px] text-[#7C5339]">
          <span>PIPELINE ENGINE:</span>
          <span className="text-[#4E220F] font-bold flex items-center gap-1">
            <CheckCircle2 className="size-3.5 text-[#9D6638]" />
            READY
          </span>
        </div>
      </div>

      {/* 1. Integrated Studio Workbench View */}
      <div style={{ display: view === 'pipeline' ? 'block' : 'none' }}>
        <div className="rounded-2xl border-2 border-[#B0BA99] bg-[#FFFFFF] shadow-xs overflow-hidden flex flex-col">
          {/* Main Studio Horizontal Split: Left Palette + Center Canvas + Right Inspector */}
          <div className="flex flex-1 min-h-[620px] relative overflow-hidden">
            {/* Left Tool Palette Drawer */}
            <ToolPaletteDrawer
              tools={tools}
              onAddTool={(tool) => {
                if (addToolRef.current) addToolRef.current(tool)
              }}
              collapsed={paletteCollapsed}
              onToggleCollapse={() => setPaletteCollapsed(!paletteCollapsed)}
            />

            {/* Center Canvas */}
            <div className="flex-1 p-3 overflow-hidden flex flex-col bg-[#F7F1DE]/40">
              <PipelineCanvas
                workspaceId={id!}
                tools={tools}
                onRan={() => {
                  refreshRuns()
                }}
                onSelectNode={(node) => setSelectedCanvasNode(node)}
                selectedNodeId={selectedCanvasNode?.id}
                externalAddToolRef={addToolRef}
                externalUpdateParamsRef={updateParamsRef}
                onGraphStats={setGraphStats}
              />
            </div>

            {/* Right Node Inspector Panel */}
            <NodeInspectorPanel
              selectedNode={selectedCanvasNode}
              toolManifest={tools.find((t) => t.id === selectedCanvasNode?.toolId)}
              workspaceId={id!}
              nodeCount={graphStats.nodeCount}
              edgeCount={graphStats.edgeCount}
              lastRun={
                pipelineRuns[0]
                  ? {
                      name: pipelineRuns[0].bundle_name || pipelineRuns[0].pipeline_name || pipelineRuns[0].pipeline_run_id.slice(0, 8),
                      status: pipelineRuns[0].status,
                    }
                  : null
              }
              onUpdateParams={(newParams) => {
                if (selectedCanvasNode) {
                  setSelectedCanvasNode({
                    ...selectedCanvasNode,
                    params: newParams,
                  })
                }
                if (updateParamsRef.current) updateParamsRef.current(newParams)
              }}
              collapsed={inspectorCollapsed}
              onToggleCollapse={() => setInspectorCollapsed(!inspectorCollapsed)}
              onClearSelection={clearCanvasSelection}
              onStepFinished={refreshRuns}
            />
          </div>

          {/* Bottom Dockable Artifacts & Media Drawer */}
          <BottomArtifactsDock
            workspaceId={id!}
            onPreviewArtifact={(name, size, previewUrl, downloadUrl) =>
              setPreviewTarget({ name, size, previewUrl, downloadUrl })
            }
            dockExpanded={dockExpanded}
            onToggleExpand={() => setDockExpanded(!dockExpanded)}
          />
        </div>
      </div>

      {/* 2. Unified Media, Runs & Assets Hub View */}
      <div style={{ display: view === 'media_hub' ? 'block' : 'none' }}>
        <UnifiedMediaRunsHub
          workspaceId={id!}
          pipelineRuns={pipelineRuns}
          runs={runs}
          onRefresh={refreshRuns}
          highlightRunId={justCompletedRunId}
          mediaRefreshKey={mediaRefreshKey}
          onPreviewArtifact={(name, size, previewUrl, downloadUrl) =>
            setPreviewTarget({ name, size, previewUrl, downloadUrl })
          }
          onInspectRun={(runId) => setInspectRunId(runId)}
          onRemoveRun={(runId) => removeRun(runId)}
          onRemoveMediaItem={(filename) => removeMediaItem(filename)}
        />
      </div>

      {/* In-App Artifact Viewer Modal */}
      {previewTarget && (
        <ArtifactViewerModal
          name={previewTarget.name}
          size={previewTarget.size}
          previewUrl={previewTarget.previewUrl}
          downloadUrl={previewTarget.downloadUrl}
          onClose={() => setPreviewTarget(null)}
        />
      )}

      {/* In-App Run Details & Logs Modal */}
      {inspectRunId && id && (
        <RunDetailsModal
          workspaceId={id}
          runId={inspectRunId}
          onBranch={() => {
            setInspectRunId(null)
            setView('pipeline')
          }}
          onClose={() => setInspectRunId(null)}
        />
      )}

      {/* Trim Waveform Modal */}
      {trimTarget && id && selectedRun && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#4E220F]/30 backdrop-blur-[3px]">
          <div className="relative w-full max-w-3xl rounded-2xl border-2 border-[#B0BA99] bg-[#F7F1DE] p-6 shadow-2xl space-y-4 text-[#4E220F]">
            <div className="flex items-center justify-between border-b border-[#B0BA99]/60 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex size-8 items-center justify-center rounded-xl bg-[#9D6638] text-[#FDFBF7]">
                  <Scissors className="size-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#4E220F]">
                    Trim & Split Studio
                  </h3>
                  <p className="font-mono text-[10px] text-[#7C5339]">{trimTarget}</p>
                </div>
              </div>
              <button
                onClick={() => setTrimTarget(null)}
                className="rounded-lg p-1.5 text-[#7C5339] hover:bg-[#B0BA99]/30 hover:text-[#4E220F] transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>

            <WaveformEditor
              audioUrl={api.artifactPreviewUrl(id, selectedRun, trimTarget)}
              onTrim={async (regions) => {
                await api.trimArtifact(id, selectedRun, trimTarget, regions)
                setTrimTarget(null)
                const { artifacts: next } = await api.listArtifacts(id, selectedRun)
                setArtifacts(next)
              }}
            />
          </div>
        </div>
      )}

      {/* Custom delete confirmation (replaces native confirm) */}
      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="absolute inset-0" onClick={() => setPendingDelete(null)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
            className="relative w-full max-w-md rounded-2xl border border-[#B0BA99] bg-[#FFFFFF] shadow-2xl overflow-hidden"
          >
            <div className="px-6 py-4 space-y-2">
              <h3 id="delete-dialog-title" className="text-sm font-bold text-[#4E220F] flex items-center gap-2">
                <Trash2 className="size-4 text-[#A83232]" />
                {pendingDelete.type === 'run' ? 'Delete run?' : 'Delete media file?'}
              </h3>
              <p className="text-xs text-[#7C5339] leading-relaxed">
                {pendingDelete.type === 'run' ? (
                  <>
                    Delete run <span className="font-mono font-bold text-[#4E220F]">“{pendingDelete.name}”</span> and its artifacts? This cannot be undone.
                  </>
                ) : (
                  <>
                    Permanently delete media file <span className="font-mono font-bold text-[#4E220F]">“{pendingDelete.name}”</span>? This cannot be undone.
                  </>
                )}
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[#B0BA99]/40 bg-[#EDE5CD]/50 px-6 py-3.5">
              <button
                onClick={() => setPendingDelete(null)}
                className="rounded-xl px-4 py-2 text-xs font-semibold text-[#7C5339] hover:bg-[#EDE5CD] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="rounded-xl bg-[#A83232] px-4 py-2 text-xs font-bold text-[#FDFBF7] hover:bg-[#862727] transition-all active:scale-95"
              >
                {pendingDelete.type === 'run' ? 'Delete run' : 'Delete file'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
