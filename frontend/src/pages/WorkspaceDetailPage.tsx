import { useCanvasRun } from '../hooks/useCanvasRun'
import { useCanvasGraph } from '../hooks/useCanvasGraph'
import { useCanvasPersistence } from '../hooks/useCanvasPersistence'
import { branchGraph } from '../lib/canvasBranch'
import { canonicalId } from '../lib/toolIds'
import ErrorBoundary from '../components/common/ErrorBoundary'
import { useHealth } from '../hooks/useHealth'
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
  api, errorMessage,
  type Run,
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
  const graph=useCanvasGraph()
  const persistence=useCanvasPersistence(id!,graph)
  const health=useHealth()
  const selectedCanvasNode=graph.selected ? {id:graph.selected.id,...graph.selected.data} : null
  const graphStats={nodeCount:graph.nodes.length,edgeCount:graph.edges.length}
  const [branchMessage,setBranchMessage]=useState<{ok:boolean;message:string}|null>(null)
  const workspaceGeneration=useRef(0)
  useEffect(()=>{workspaceGeneration.current++;return ()=>{workspaceGeneration.current++}},[id])
  const reads=useRef<AbortController|null>(null)
  const [justCompletedRunId, setJustCompletedRunId] = useState<string | null>(null)
  const [mediaRefreshKey, setMediaRefreshKey] = useState(0)
  const [outputBanner, setOutputBanner] = useState<{ title: string; subtitle?: string } | null>(null)
  const prevPipelineIdsRef = useRef<Set<string>>(new Set())
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearCanvasSelection = () => {
    graph.select()
  }

  const refreshRuns = useCallback(() => {
    if (!id) return
    reads.current?.abort()
    const controller=new AbortController();reads.current=controller
    setRefreshing(true)
    Promise.all([api.listRuns(id,controller.signal), api.listPipelineRuns(id,controller.signal)])
      .then(([{ runs }, { pipeline_runs }]) => {
        if(controller.signal.aborted)return
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
        setSelectedRun(current=>current&&runs.some(r=>r.id===current)?current:runs[0]?.id||null)
        setMediaRefreshKey(key=>key+1)
        setRefreshing(false)
      })
      .catch(() => {if(!controller.signal.aborted)setRefreshing(false)})
  }, [id])
  const [runStatus,setRunStatus]=useState<{ok:boolean;msg:string}|null>(null)
  const execution=useCanvasRun(id!,graph,tools,refreshRuns,setRunStatus)

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
    const controller=new AbortController()
    api.listTools(controller.signal).then(({tools})=>{if(!controller.signal.aborted)setTools(tools)}).catch(()=>{})
    return ()=>controller.abort()
  }, [])
  useEffect(()=>{
    setRuns([]);setPipelineRuns([]);setSelectedRun(null);setInspectRunId(null);setPreviewTarget(null);setTrimTarget(null);setBranchMessage(null)
    refreshRuns()
    return ()=>reads.current?.abort()
  },[id,refreshRuns])
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
    const generation=workspaceGeneration.current
    const { type, id: targetId } = pendingDelete
    setPendingDelete(null)
    if (type === 'run') {
      await api.deleteRun(id, targetId)
      if(generation!==workspaceGeneration.current)return
      setSelectedRun((prev) => (prev === targetId ? null : prev))
      refreshRuns()
    } else if (type === 'media') {
      await api.deleteWorkspaceMedia(id, targetId)
      if(generation!==workspaceGeneration.current)return
      refreshRuns()
      setMediaRefreshKey((k) => k + 1)
    }
  }

  return (
    <div className="h-full w-full flex flex-col min-h-0 p-3 sm:p-4 text-brand-espresso gap-2.5 overflow-hidden">
      {/* Top Breadcrumbs & Workspace Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-brand-sage pb-3 shrink-0">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link
              to="/workspaces"
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand-caramel-text hover:text-brand-espresso transition-colors"
            >
              <ArrowLeft className="size-3.5" />
              Workspaces
            </Link>
            <span className="text-brand-sage">/</span>
            <WorkspaceSwitcherDropdown currentWorkspaceId={id} />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-brand-espresso flex items-center gap-2">
            Workbench
            <span className="h-2 w-2 rounded-full bg-brand-caramel" />
          </h1>
        </div>

        {/* Action bar */}
        <div className="flex items-center gap-2">
          <button
            onClick={refreshRuns}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-xl border border-brand-sage bg-brand-cream-dark px-3.5 py-1.5 text-xs font-semibold text-brand-espresso transition-all hover:bg-brand-sage/40 active:scale-95 disabled:opacity-50 shadow-2xs"
          >
            <RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin text-brand-caramel' : ''}`} />
            Refresh
          </button>
          {id && (
            <a
              href={api.exportWorkspace(id)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-caramel px-3.5 py-1.5 text-xs font-bold text-brand-cream-light shadow-sm transition-all hover:bg-brand-caramel-hover active:scale-95"
            >
              <FileArchive className="size-3.5" />
              Export ZIP
            </a>
          )}
        </div>
      </div>

      {branchMessage && <div role="status" className="text-xs rounded-xl border p-3">{branchMessage.message}<button onClick={()=>setBranchMessage(null)} className="ml-3">Dismiss</button></div>}
      {/* Post-run outputs focus banner */}
      {outputBanner && (
        <div className="rounded-2xl border-2 border-brand-caramel/50 bg-brand-caramel px-5 py-3 flex items-center justify-between gap-4 shadow-md animate-in slide-in-from-top-2 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex size-8 items-center justify-center rounded-xl bg-brand-cream-light text-brand-caramel shrink-0">
              <CheckCircle2 className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-brand-cream-light truncate">{outputBanner.title} — Outputs ready</p>
              <p className="text-xs text-brand-cream-light/80 truncate">{outputBanner.subtitle || 'Switched to Media, Runs & Assets. Latest outputs highlighted below.'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setView('media_hub')}
              className="rounded-xl bg-brand-cream-light px-3.5 py-1.5 text-xs font-bold text-brand-caramel hover:bg-brand-cream-dark transition-colors"
            >
              View Outputs
            </button>
            <button onClick={() => setOutputBanner(null)} className="text-brand-cream-light/80 hover:text-brand-cream-light p-1">
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}

      {/* Segmented View Switcher: 2 Clean Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-brand-sage/60 pb-2.5 shrink-0">
        <div className="inline-flex flex-wrap rounded-xl border border-brand-sage bg-brand-cream-dark/70 p-1 gap-1">
          <button
            onClick={() => setView('pipeline')}
            className={
              'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-all ' +
              (view === 'pipeline'
                ? 'bg-brand-caramel text-brand-cream-light shadow-xs'
                : 'text-brand-espresso hover:bg-brand-cream-dark')
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
                ? 'bg-brand-caramel text-brand-cream-light shadow-xs'
                : 'text-brand-espresso hover:bg-brand-cream-dark')
            }
          >
            <Film className="size-3.5" />
            Media, Runs & Assets
            <span
              className={`font-mono text-xs px-2 py-0.5 rounded-full font-bold ${
                view === 'media_hub'
                  ? 'bg-brand-cream-light/25 text-brand-cream-light'
                  : 'bg-brand-sage/40 text-brand-espresso'
              }`}
            >
              {pipelineRuns.length}
            </span>
          </button>
        </div>

        <div className="hidden sm:flex items-center gap-2 font-mono text-xs text-brand-caramel-text">
          <span>PIPELINE ENGINE:</span>
          <span className="text-brand-espresso font-bold flex items-center gap-1">
            <CheckCircle2 className="size-3.5 text-brand-caramel" />
            {health.state.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Execution controls survive renderer recovery and workspace view changes. */}
      <div className="flex items-center gap-3 text-xs" role="status">
        <span>{execution.busy?'Pipeline monitor connected':`Backend run: ${execution.remoteState}`}</span>
        {(execution.busy||execution.remoteState!=='idle') && <button onClick={execution.stop} className="font-bold text-accent-contrast">Stop backend run</button>}
        {!execution.busy && <button onClick={execution.reconnect} className="font-bold text-brand-caramel">Reconnect status</button>}
        {runStatus && <span>{runStatus.msg}</span>}
      </div>
      {/* 1. Integrated Studio Workbench View */}
      <div
        style={{ display: view === 'pipeline' ? 'flex' : 'none' }}
        className="flex-1 min-h-0 flex flex-col rounded-2xl border-2 border-brand-sage bg-surface-white shadow-xs overflow-hidden"
      >
        {/* Main Studio Horizontal Split: Left Palette + Center Canvas + Right Inspector */}
        <div className="flex-1 min-h-0 flex relative overflow-hidden">
          {/* Left Tool Palette Drawer */}
          <ErrorBoundary name="Tool palette" resetKey={id}><ToolPaletteDrawer
            tools={tools}
            onAddTool={graph.addTool}
            collapsed={paletteCollapsed}
            onToggleCollapse={() => setPaletteCollapsed(!paletteCollapsed)}
          /></ErrorBoundary>

          {/* Center Canvas */}
          <div className="flex-1 p-3 overflow-hidden flex flex-col bg-brand-cream/40">
            <ErrorBoundary name="Pipeline canvas" resetKey={id}><PipelineCanvas
              key={id}
              workspaceId={id!}
              tools={tools}
              execution={execution}
              graph={graph}
              persistence={persistence}
            /></ErrorBoundary>
          </div>

          {/* Right Node Inspector Panel */}
          <ErrorBoundary name="Node inspector" resetKey={id}><NodeInspectorPanel
            selectedNode={selectedCanvasNode}
            toolManifest={tools.find((t) => canonicalId(t.id) === canonicalId(selectedCanvasNode?.toolId||''))}
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
            onUpdateParams={graph.updateParams}
            collapsed={inspectorCollapsed}
            onToggleCollapse={() => setInspectorCollapsed(!inspectorCollapsed)}
            onClearSelection={clearCanvasSelection}
            onStepFinished={refreshRuns}
          /></ErrorBoundary>
        </div>

        {/* Bottom Dockable Artifacts & Media Drawer */}
        <ErrorBoundary name="Artifacts dock" resetKey={id}><BottomArtifactsDock
          workspaceId={id!}
          onPreviewArtifact={(name, size, previewUrl, downloadUrl) =>
            setPreviewTarget({ name, size, previewUrl, downloadUrl })
          }
          refreshKey={mediaRefreshKey}
          dockExpanded={dockExpanded}
          onToggleExpand={() => setDockExpanded(!dockExpanded)}
        /></ErrorBoundary>
      </div>

      {/* 2. Unified Media, Runs & Assets Hub View */}
      <div
        style={{ display: view === 'media_hub' ? 'block' : 'none' }}
        className="flex-1 min-h-0 overflow-y-auto pr-1"
      >
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
          onBranch={async () => {
            const runId=inspectRunId
            const generation=workspaceGeneration.current
            try {
              const result=await api.branchRun(id,runId)
              if(generation!==workspaceGeneration.current)return
              const next=branchGraph({nodes:graph.nodes,edges:graph.edges},result,tools,graph.selectedNodeId)
              graph.replace({nodes:next.nodes,edges:next.edges})
              setBranchMessage({ok:true,message:`Branched from ${runId}: ${next.artifacts} artifacts reused, ${next.steps} downstream steps pre-filled. Source parameters restored; only downstream steps will run.`})
              setInspectRunId(null);setView('pipeline')
            } catch(error) {if(generation!==workspaceGeneration.current)return;setBranchMessage({ok:false,message:errorMessage(error)})}
          }}
          onClose={() => setInspectRunId(null)}
        />
      )}

      {/* Trim Waveform Modal */}
      {trimTarget && id && selectedRun && (
        <div className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-brand-espresso/30 backdrop-blur-[3px]">
          <div className="relative w-full max-w-3xl rounded-2xl border-2 border-brand-sage bg-brand-cream p-6 shadow-2xl space-y-4 text-brand-espresso">
            <div className="flex items-center justify-between border-b border-brand-sage/60 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex size-8 items-center justify-center rounded-xl bg-brand-caramel text-brand-cream-light">
                  <Scissors className="size-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-brand-espresso">
                    Trim & Split Studio
                  </h3>
                  <p className="font-mono text-xs text-brand-caramel-text">{trimTarget}</p>
                </div>
              </div>
              <button
                onClick={() => setTrimTarget(null)}
                className="rounded-lg p-1.5 text-brand-caramel-text hover:bg-brand-sage/30 hover:text-brand-espresso transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>

            <WaveformEditor
              audioUrl={api.artifactPreviewUrl(id, selectedRun, trimTarget)}
              onTrim={async (regions) => {
                const generation=workspaceGeneration.current
                await api.trimArtifact(id, selectedRun, trimTarget, regions)
                if(generation!==workspaceGeneration.current)return
                setTrimTarget(null)
                setMediaRefreshKey(key=>key+1)
                refreshRuns()
              }}
            />
          </div>
        </div>
      )}

      {/* Custom delete confirmation (replaces native confirm) */}
      {pendingDelete && (
        <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="absolute inset-0" onClick={() => setPendingDelete(null)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
            className="relative w-full max-w-md rounded-2xl border border-brand-sage bg-surface-white shadow-2xl overflow-hidden"
          >
            <div className="px-6 py-4 space-y-2">
              <h3 id="delete-dialog-title" className="text-sm font-bold text-brand-espresso flex items-center gap-2">
                <Trash2 className="size-4 text-accent-contrast" />
                {pendingDelete.type === 'run' ? 'Delete run?' : 'Delete media file?'}
              </h3>
              <p className="text-xs text-brand-caramel-text leading-relaxed">
                {pendingDelete.type === 'run' ? (
                  <>
                    Delete run <span className="font-mono font-bold text-brand-espresso">“{pendingDelete.name}”</span> and its artifacts? This cannot be undone.
                  </>
                ) : (
                  <>
                    Permanently delete media file <span className="font-mono font-bold text-brand-espresso">“{pendingDelete.name}”</span>? This cannot be undone.
                  </>
                )}
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-brand-sage/40 bg-brand-cream-dark/50 px-6 py-3.5">
              <button
                onClick={() => setPendingDelete(null)}
                className="rounded-xl px-4 py-2 text-xs font-semibold text-brand-caramel-text hover:bg-brand-cream-dark transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="rounded-xl bg-accent-contrast px-4 py-2 text-xs font-bold text-brand-cream-light hover:bg-error-hover transition-all active:scale-95"
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
