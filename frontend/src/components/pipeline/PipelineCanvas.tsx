import { type CanvasGraph } from '../../hooks/useCanvasGraph'
import { useCanvasPersistence } from '../../hooks/useCanvasPersistence'
import { applyArrangedPositions, graphValidity, buildDAGPayload } from '../../lib/canvasGraph'
import { canonicalId } from '../../lib/toolIds'
import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { ReactFlow, Background, Controls, MiniMap, useReactFlow, ReactFlowProvider, addEdge, type Connection, type Edge, type Node } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { api, errorMessage, type ToolManifest } from '../../lib/api'
import {
  CheckCircle2,
  Play,
  AlertCircle,
  Trash2,
  BookmarkPlus,
  Maximize2,
  Minimize2,
  LayoutGrid,
  Sparkles,
  Square,
  Unlink,
  Save,
  Undo2,
  Redo2,
  MoreHorizontal,
  Focus,
} from 'lucide-react'
import UniversalPipelineRunModal from './UniversalPipelineRunModal'
import { resolvePipelineFlow, type PipelineEntryInput, type ResolvedPipelineFlow } from '../../lib/pipelineInputResolver'
import type { useCanvasRun } from '../../hooks/useCanvasRun'
import ErrorBoundary from '../common/ErrorBoundary'

import { nodeTypes, edgeTypes, defaultEdgeOptions, type ToolNodeData } from './CanvasRenderers'
import { STARTER_WORKFLOWS } from '../../lib/starterWorkflows'
type CanvasProps = { workspaceId:string; tools?:ToolManifest[]; execution:ReturnType<typeof useCanvasRun>; graph:CanvasGraph; persistence:ReturnType<typeof useCanvasPersistence> }
function PipelineCanvasInner({workspaceId,tools:initialTools,execution,graph,persistence}:CanvasProps) {
  const { nodes,setNodes,onNodesChange,edges,setEdges,onEdgesChange,selectedEdgeId,histDepths,undo,redo } = graph
  const setSelectedNodeId=(id:string|null)=>graph.select(id)
  const setSelectedEdgeId=(id:string|null)=>graph.select(null,id)
  const {saveStatus,showSavedToast,saveCanvasNow}=persistence
  const [tools, setTools] = useState<ToolManifest[]>(initialTools || [])
  const [templates, setTemplates] = useState<{ name: string; chain: string[] }[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [templateName, setTemplateName] = useState('')
  const [isSaveTemplateOpen, setIsSaveTemplateOpen] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null)
  const [clearArmed, setClearArmed] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isRunModalOpen, setIsRunModalOpen] = useState(false)
  const [runModalInputs, setRunModalInputs] = useState<PipelineEntryInput[]>([])
  const [resolvedFlow, setResolvedFlow] = useState<ResolvedPipelineFlow | undefined>(undefined)
  const { fitView } = useReactFlow()
  const clearArmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 2c. Keyboard shortcuts: ⌘S/Ctrl+S save, ⌘Z undo, ⇧⌘Z / Ctrl+Y redo
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        saveCanvasNow()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [saveCanvasNow, undo, redo])

  // Close the More menu on Escape
  useEffect(() => {
    if (!moreOpen) return
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMoreOpen(false)
        setClearArmed(false)
      }
    }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [moreOpen])

  useEffect(() => {
    const controller=new AbortController()
    if(initialTools?.length)setTools(initialTools)
    else api.listTools(controller.signal).then(({tools})=>{if(!controller.signal.aborted)setTools(tools)}).catch(()=>{})
    api.listTemplates(workspaceId,true,controller.signal).then(({templates})=>{if(!controller.signal.aborted)setTemplates(templates)}).catch(()=>{})
    return ()=>controller.abort()
  },[workspaceId,initialTools])
  useEffect(()=>()=>{if(clearArmTimerRef.current)clearTimeout(clearArmTimerRef.current)},[])
  const onConnect = useCallback(
    (params: Connection) =>
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            type: 'deletableEdge',
            animated: true,
            style: { stroke: 'var(--color-brand-caramel)', strokeWidth: 2.5 },
          },
          eds,
        ),
      ),
    [setEdges],
  )

  const selectedEdge = useMemo(() => edges.find((e) => e.id === selectedEdgeId), [edges, selectedEdgeId])


  /** Auto-arrange nodes in a clean DAG flow from left to right */
  const autoArrange = useCallback(() => {
    if (nodes.length === 0) return
    const check=graphValidity(nodes,edges,tools)
    if(check.reason.startsWith('Cycle:')){setStatus({ok:false,msg:check.reason});return}
    setNodes(applyArrangedPositions(nodes, edges))
    setTimeout(() => fitView({ padding: 0.2 }), 60)
  }, [nodes, edges, setNodes, fitView, tools])

  const localValidity = useMemo(()=>graphValidity(nodes,edges,tools),[nodes,edges,tools])
  const payloadKey=JSON.stringify(buildDAGPayload(nodes,edges))
  const validationPayload=useMemo(()=>JSON.parse(payloadKey) as ReturnType<typeof buildDAGPayload>,[payloadKey])
  const [serverValidity,setServerValidity]=useState<{key:string;valid:boolean;reason:string}|null>(null)
  const valid=localValidity.valid && serverValidity?.key===payloadKey && serverValidity.valid
  const validityReason=localValidity.reason || (serverValidity?.key===payloadKey ? serverValidity.reason : 'Checking graph…')
  useEffect(()=>{
    if(!localValidity.valid)return
    let cancelled=false
    const timer=setTimeout(()=>{
      api.validatePipeline(workspaceId,validationPayload).then(result=>{
        if(!cancelled)setServerValidity({key:payloadKey,valid:result.valid,reason:result.error||''})
      }).catch(()=>{if(!cancelled)setServerValidity({key:payloadKey,valid:false,reason:'Unable to validate graph. Retry Validate Graph.'})})
    },400)
    return ()=>{cancelled=true;clearTimeout(timer)}
  },[payloadKey,validationPayload,workspaceId,localValidity.valid])
  const validate = async () => {
    try {
      const res=await api.validatePipeline(workspaceId,buildDAGPayload(nodes,edges))
      setServerValidity({key:payloadKey,valid:res.valid,reason:res.error||''})
      setStatus({ok:res.valid,msg:res.valid?'Pipeline graph is compatible and valid':res.error||'Invalid pipeline'})
    } catch(error) {setStatus({ok:false,msg:errorMessage(error)})}
  }
  const {busy,disconnected,executePipelineWithParams,stop}=execution
  const handleRunClick = () => {
    if (!valid || !execution.canRun) return
    const executable=nodes.filter(n=>!n.data.branchedOutputs)
    const flow = resolvePipelineFlow(executable, edges.filter(e=>executable.some(n=>n.id===e.source)&&executable.some(n=>n.id===e.target)), tools)
    setResolvedFlow(flow)
    setRunModalInputs(flow.entryInputs)
    setIsRunModalOpen(true)
  }

  // Two-click destructive confirm: first click arms, second executes, auto-disarm after 3s
  const clearCanvas = () => {
    if (!clearArmed) {
      setClearArmed(true)
      if (clearArmTimerRef.current) clearTimeout(clearArmTimerRef.current)
      clearArmTimerRef.current = setTimeout(() => setClearArmed(false), 3000)
      return
    }
    if (clearArmTimerRef.current) clearTimeout(clearArmTimerRef.current)
    setClearArmed(false)
    graph.replace({nodes:[],edges:[]})
    setSelectedNodeId(null)
    setSelectedEdgeId(null)
    setStatus(null)
  }

  const saveCurrentAsTemplate = async () => {
    const name = templateName.trim()
    if (!name || nodes.length === 0) return
    const chain = [...nodes].sort((a, b) => a.position.x - b.position.x).map((n) => n.data.toolId)
    await api.saveTemplate(workspaceId, name, chain)
    const { templates } = await api.listTemplates(workspaceId, true)
    setTemplates(templates)
    setTemplateName('')
    setStatus({ ok: true, msg: `Saved template "${name}"` })
  }

  const loadWorkflowChain = (
    chain: string[],
    label: string,
    defaultParams?: Record<string, Record<string, any>>,
  ) => {
    const nextNodes: Node<ToolNodeData>[] = []
    const nextEdges: Edge[] = []

    chain.forEach((toolId, i) => {
      toolId = canonicalId(toolId)
      const tool = tools.find((t) => canonicalId(t.id) === toolId)
      const id = `${toolId}-${i + 1}`
      const initialParams = defaultParams?.[toolId] || {}
      nextNodes.push({
        id,
        type: 'toolNode',
        ariaLabel: tool?.name ?? toolId,
        position: { x: 60 + i * 320, y: 120 },
        data: {
          label: tool?.name ?? toolId,
          toolId,
          category: tool?.category,
          inputKinds: tool?.input_kinds ?? ['any'],
          outputKinds: tool?.output_kinds ?? ['any'],
          params: { ...initialParams },
        },
      })
      if (i > 0) {
        nextEdges.push({
          id: `e-${nextNodes[i - 1].id}-${id}`,
          source: nextNodes[i - 1].id,
          target: id,
          type: 'deletableEdge',
          animated: true,
          style: { stroke: 'var(--color-brand-caramel)', strokeWidth: 2.5 },
        })
      }
    })
    graph.replace({nodes:nextNodes,edges:nextEdges})
    setSelectedNodeId(null)
    setSelectedEdgeId(null)
    setStatus({ ok: true, msg: `Loaded "${label}"` })
    setTimeout(() => fitView({ padding: 0.25, duration: 400 }), 60)

    // Configure entry inputs, then wait for automatic graph validation.
    const flow = resolvePipelineFlow(nextNodes as any, nextEdges as any, tools)
    setResolvedFlow(flow)
    setRunModalInputs(flow.entryInputs)
  }

  return (
    <div className="space-y-3 text-brand-espresso flex flex-col h-full">
      {persistence.loadError && <div role="alert" className="text-xs text-accent-contrast">Canvas could not be loaded. Saving is paused to protect the existing graph. <button onClick={persistence.retryLoad}>Retry loading canvas</button></div>}
      {!persistence.loaded && !persistence.loadError && <p role="status" className="text-xs">Loading canvas…</p>}
      {/* Sleek Canvas Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-sage bg-surface-white p-3 shadow-xs">
        {nodes.length === 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            {/* Starter Workflows Selector (empty canvas only) */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-brand-caramel-text flex items-center gap-1 mr-1">
                <Sparkles className="size-3.5 text-brand-caramel" /> Starters:
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {STARTER_WORKFLOWS.map((wf) => (
                  <button
                    key={wf.name}
                    onClick={() => loadWorkflowChain(wf.chain, wf.name, wf.defaultParams)}
                    className="inline-flex items-center gap-1 rounded-xl border border-brand-sage bg-brand-cream/70 px-2.5 py-1 text-xs font-bold text-brand-espresso hover:bg-brand-caramel hover:text-surface-white hover:border-brand-caramel transition-all shadow-2xs active:scale-95"
                    title={wf.desc}
                  >
                    <span>{wf.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Saved Templates (empty canvas only) */}
            {templates.length > 0 && (
              <div className="flex items-center gap-1.5 pl-2 border-l border-brand-sage/60">
                <select
                  value={selectedTemplate}
                  onChange={(e) => {
                    setSelectedTemplate(e.target.value)
                    const tpl = templates.find((t) => t.name === e.target.value)
                    if (tpl) loadWorkflowChain(tpl.chain, tpl.name)
                  }}
                  className="rounded-xl border border-brand-sage bg-brand-cream/70 px-2.5 py-1 text-xs text-brand-espresso font-bold focus:border-brand-caramel focus:outline-none max-w-xs truncate"
                >
                  <option value="">— Saved Templates ({templates.length}) —</option>
                  {templates.map((tpl) => (
                    <option key={tpl.name} value={tpl.name}>
                      {tpl.name} ({tpl.chain.length} tools)
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        ) : (
          <div className="text-xs font-mono text-brand-caramel-text">
            {nodes.length} node{nodes.length === 1 ? '' : 's'} · {edges.length} edge{edges.length === 1 ? '' : 's'}
          </div>
        )}

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Undo / Redo */}
          <button
            onClick={undo}
            disabled={histDepths.past === 0}
            className="inline-flex items-center gap-1 rounded-xl border border-brand-sage bg-brand-cream-dark px-2 py-1.5 text-xs font-bold text-brand-espresso hover:bg-brand-sage/40 transition-all shadow-2xs disabled:opacity-40"
            title="Undo (⌘Z)"
          >
            <Undo2 className="size-3.5 text-brand-caramel" />
          </button>
          <button
            onClick={redo}
            disabled={histDepths.future === 0}
            className="inline-flex items-center gap-1 rounded-xl border border-brand-sage bg-brand-cream-dark px-2 py-1.5 text-xs font-bold text-brand-espresso hover:bg-brand-sage/40 transition-all shadow-2xs disabled:opacity-40"
            title="Redo (⇧⌘Z)"
          >
            <Redo2 className="size-3.5 text-brand-caramel" />
          </button>

          {/* Save Status: visible while dirty/saving; Saved auto-dismisses */}
          {(saveStatus !== 'saved' || showSavedToast) && (
            <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border border-brand-sage/60 bg-brand-cream/60 text-xs font-mono">
              {saveStatus === 'saved' && showSavedToast && (
                <>
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span className="text-brand-espresso font-bold">Saved</span>
                </>
              )}
              {saveStatus === 'saving' && (
                <>
                  <span className="h-2 w-2 rounded-full bg-brand-caramel animate-ping" />
                  <span className="text-brand-caramel font-bold">Saving...</span>
                </>
              )}
              {saveStatus === 'unsaved' && (
                <>
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  <span className="text-amber-700 font-bold">Unsaved • ⌘S</span>
                </>
              )}
            </div>
          )}

          <button
            onClick={saveCanvasNow}
            disabled={saveStatus !== 'unsaved'}
            className="inline-flex items-center gap-1.5 rounded-xl border border-brand-sage bg-brand-cream-dark px-2.5 py-1.5 text-xs font-bold text-brand-espresso hover:bg-brand-sage/40 transition-all shadow-2xs disabled:opacity-40"
            title="Save pipeline now (⌘S)"
          >
            <Save className="size-3.5 text-brand-caramel" /> Save
          </button>

          {/* Fit View */}
          <button
            type="button"
            onClick={() => fitView({ padding: 0.2, duration: 300 })}
            className="inline-flex items-center gap-1.5 rounded-xl border border-brand-sage bg-brand-cream-dark px-2.5 py-1.5 text-xs font-bold text-brand-espresso hover:bg-brand-sage/40 transition-all shadow-2xs"
            title="Fit Graph to View"
          >
            <Focus className="size-3.5 text-brand-caramel" /> Fit View
          </button>

          {selectedEdge && (
            <button
              onClick={() => {
                setEdges((eds) => eds.filter((e) => e.id !== selectedEdgeId))
                setSelectedEdgeId(null)
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-accent-contrast bg-accent-contrast/10 px-2.5 py-1.5 text-xs font-bold text-accent-contrast hover:bg-accent-contrast hover:text-surface-white transition-all shadow-2xs"
              title={`Disconnect link from ${selectedEdge.source} to ${selectedEdge.target}`}
            >
              <Unlink className="size-3.5" /> Disconnect
            </button>
          )}

          <div className="relative">
            <button
              onClick={() => {
                setMoreOpen((v) => !v)
                setClearArmed(false)
              }}
              className={`inline-flex items-center gap-1 rounded-xl border border-brand-sage bg-brand-cream-dark px-2 py-1.5 text-xs font-bold text-brand-espresso hover:bg-brand-sage/40 transition-all shadow-2xs ${moreOpen ? 'ring-2 ring-brand-caramel/40' : ''}`}
              title="More canvas actions"
              aria-haspopup="menu"
              aria-expanded={moreOpen}
            >
              <MoreHorizontal className="size-4 text-brand-caramel" />
            </button>
            {moreOpen && (
              <>
                <div className="fixed inset-0 z-drawer" onClick={() => { setMoreOpen(false); setClearArmed(false) }} />
                <div role="menu" className="absolute right-0 top-full z-modal mt-1.5 w-56 overflow-hidden rounded-xl border border-brand-sage bg-surface-white shadow-xl">
                  <button
                    role="menuitem"
                    onClick={() => { setMoreOpen(false); fitView({ padding: 0.2, duration: 300 }) }}
                    className="flex w-full items-center gap-2 px-3.5 py-2 text-xs font-bold text-brand-espresso hover:bg-brand-cream-dark transition-colors text-left"
                    title="Fit Graph to View"
                  >
                    <Focus className="size-3.5 text-brand-caramel" /> Fit Graph to View
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => { setMoreOpen(false); autoArrange() }}
                    disabled={nodes.length === 0}
                    className="flex w-full items-center gap-2 px-3.5 py-2 text-xs font-bold text-brand-espresso hover:bg-brand-cream-dark transition-colors disabled:opacity-40 text-left"
                    title="Automatically arrange nodes cleanly from left to right"
                  >
                    <LayoutGrid className="size-3.5 text-brand-caramel" /> Auto Arrange
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => { setMoreOpen(false); validate() }}
                    disabled={nodes.length === 0}
                    className="flex w-full items-center gap-2 px-3.5 py-2 text-xs font-bold text-brand-espresso hover:bg-brand-cream-dark transition-colors disabled:opacity-40 text-left"
                    title="Validate compatibility of connections"
                  >
                    <CheckCircle2 className="size-3.5 text-brand-caramel" /> Validate Graph
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => { setMoreOpen(false); setIsSaveTemplateOpen(true) }}
                    disabled={nodes.length === 0}
                    className="flex w-full items-center gap-2 px-3.5 py-2 text-xs font-bold text-brand-espresso hover:bg-brand-cream-dark transition-colors disabled:opacity-40 text-left"
                    title="Save current pipeline as reusable template"
                  >
                    <BookmarkPlus className="size-3.5 text-brand-caramel" /> Save as Template
                  </button>
                  <div className="border-t border-brand-sage/40" />
                  <button
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation()
                      clearCanvas()
                      if (clearArmed) setMoreOpen(false)
                    }}
                    disabled={nodes.length === 0}
                    className={`flex w-full items-center gap-2 px-3.5 py-2 text-xs font-semibold transition-colors disabled:opacity-40 text-left ${
                      clearArmed
                        ? 'bg-accent-contrast text-surface-white hover:bg-error-hover'
                        : 'text-accent-contrast hover:bg-accent-contrast/10'
                    }`}
                    title={clearArmed ? 'Click again to confirm clearing the canvas' : 'Clear canvas (asks to confirm)'}
                  >
                    <Trash2 className="size-3.5" /> {clearArmed ? 'Confirm clear?' : 'Clear canvas'}
                  </button>
                </div>
              </>
            )}
          </div>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-brand-sage bg-brand-cream-dark px-2.5 py-1.5 text-xs font-bold text-brand-espresso hover:bg-brand-sage/40 transition-all shadow-2xs"
            title={isExpanded ? 'Shrink Canvas View' : 'Expand Canvas View'}
          >
            {isExpanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </button>

          {disconnected && !busy && <button onClick={stop} className="text-xs font-bold text-accent-contrast">Stop backend run</button>}
          {busy ? (
            <button
              onClick={stop}
              className="inline-flex items-center gap-1.5 rounded-xl bg-accent-contrast px-4 py-1.5 text-xs font-bold text-surface-white hover:bg-error-hover transition-all shadow-md active:scale-95 animate-pulse"
              title="Stop running pipeline immediately"
            >
              <Square className="size-3.5 fill-current" />
              Stop Pipeline
            </button>
          ) : (
            <button
              onClick={handleRunClick}
              disabled={!valid || !execution.canRun}
              title={!valid ? validityReason : nodes.length === 0 ? 'Add a node to run' : `Run ${nodes.length} node${nodes.length === 1 ? '' : 's'}`}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-caramel px-4 py-1.5 text-xs font-bold text-brand-cream-light hover:bg-brand-caramel-hover transition-all disabled:opacity-50 shadow-sm"
            >
              <Play className="size-3.5 fill-current" />
              {nodes.length === 0 ? 'Run Pipeline' : `Run · ${nodes.length} node${nodes.length === 1 ? '' : 's'}`}
            </button>
          )}
        </div>
      </div>

      {!valid && nodes.length>0 && <p role="status" className="text-xs text-accent-contrast">{validityReason}</p>}
      {/* Status Bar */}
      {status && (
        <div
          className={`flex items-center justify-between rounded-xl border px-4 py-2 text-xs font-mono font-semibold ${
            status.ok
              ? 'border-brand-sage bg-brand-cream-dark/70 text-brand-espresso'
              : 'border-accent-contrast/30 bg-accent-contrast/10 text-accent-contrast'
          }`}
        >
          <div className="flex items-center gap-2">
            {status.ok ? (
              <CheckCircle2 className="size-4 text-brand-caramel" />
            ) : (
              <AlertCircle className="size-4 text-accent-contrast" />
            )}
            <span>{status.msg}</span>
          </div>
          <button onClick={() => setStatus(null)} className="text-brand-caramel-text hover:text-brand-espresso">
            ×
          </button>
        </div>
      )}

      {/* Full-Width Spacious Graph Canvas Area */}
      <div
        className={`rounded-2xl border-2 border-brand-sage bg-brand-cream overflow-hidden shadow-inner transition-all duration-200 w-full relative ${
          isExpanded ? 'h-[780px]' : 'h-[620px]'
        }`}
      >
        <ErrorBoundary name="Graph renderer" resetKey={workspaceId}><ReactFlow
          nodes={nodes.map(n=>({...n,selected:n.id===graph.selectedNodeId}))}
          edges={edges.map(e=>({...e,selected:e.id===graph.selectedEdgeId,...(localValidity.invalidEdgeIds.includes(e.id)?{style:{...e.style,stroke:'var(--color-accent-contrast)'},data:{...e.data,invalid:true,invalidLabel:localValidity.reason.startsWith('Cycle:')?'Creates a cycle':'Incompatible connection'}}:{})}))}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_,node)=>graph.select(node.id)}
          onEdgeClick={(_,edge)=>graph.select(null,edge.id)}
          onPaneClick={()=>graph.select()}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
          deleteKeyCode={['Backspace', 'Delete']}
          elementsSelectable={true}
          fitView
          fitViewOptions={{ padding: 0.25, duration: 400 }}
        >
          <Background color="var(--color-brand-sage)" gap={18} />
          <Controls className="!bg-surface-white !border-brand-sage !fill-brand-espresso !rounded-xl !shadow-xs" />
          <MiniMap
            nodeColor="var(--color-brand-caramel)"
            nodeStrokeColor="var(--color-brand-espresso)"
            nodeBorderRadius={4}
            bgColor="var(--color-brand-cream)"
            maskColor="rgba(237, 229, 205, 0.65)"
            maskStrokeColor="var(--color-brand-caramel)"
            maskStrokeWidth={1.5}
            className="!bg-brand-cream/90 !border !border-brand-sage/70 !rounded-xl !shadow-xs backdrop-blur-xs opacity-75 hover:opacity-100 transition-opacity"
            style={{ width: 140, height: 90 }}
            pannable
            zoomable
          />
        </ReactFlow></ErrorBoundary>
      </div>

      {/* Save Template Modal */}
      {isSaveTemplateOpen && (
        <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-brand-sage bg-surface-white p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-brand-sage/40 pb-2">
              <h3 className="text-sm font-bold text-brand-espresso flex items-center gap-2">
                <BookmarkPlus className="size-4 text-brand-caramel" /> Save Pipeline as Template
              </h3>
              <button
                onClick={() => setIsSaveTemplateOpen(false)}
                className="text-brand-caramel-text hover:text-brand-espresso text-lg font-bold"
              >
                ×
              </button>
            </div>
            <p className="text-xs text-brand-caramel-text">
              Save this workflow ({nodes.length} connected tools) as a reusable starter template for this workspace.
            </p>
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="e.g. YouTube to English Translated Subtitles"
              className="w-full rounded-xl border border-brand-sage bg-brand-cream/70 px-3.5 py-2 text-xs text-brand-espresso placeholder-placeholder focus:border-brand-caramel focus:outline-none font-medium"
              autoFocus
            />
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setIsSaveTemplateOpen(false)}
                className="rounded-xl px-3.5 py-1.5 text-xs font-semibold text-brand-caramel-text hover:bg-brand-cream-dark"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  saveCurrentAsTemplate()
                  setIsSaveTemplateOpen(false)
                }}
                disabled={!templateName.trim() || nodes.length === 0}
                className="rounded-xl bg-brand-caramel px-4 py-1.5 text-xs font-bold text-brand-cream-light hover:bg-brand-caramel-hover disabled:opacity-40 shadow-xs"
              >
                Save Template
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Universal Pipeline Run Input Modal */}
      <UniversalPipelineRunModal
        isOpen={isRunModalOpen}
        workspaceId={workspaceId}
        dagNodes={nodes.filter(n=>!n.data.branchedOutputs).map((n) => ({
          id: n.id,
          tool_id: n.data.toolId,
          params: n.data.params,
          position: n.position,
        }))}
        onClose={() => setIsRunModalOpen(false)}
        onRun={(paramOverrides, cachePolicy) => executePipelineWithParams(paramOverrides, cachePolicy)}
        inputs={runModalInputs}
        toolSteps={nodes.filter(n=>!n.data.branchedOutputs).map((n) => n.data.label || n.data.toolId)}
        resolvedFlow={resolvedFlow}
        translationStepLabel={
          resolvedFlow?.translationNodeId
            ? nodes.find((n) => n.id === resolvedFlow.translationNodeId)?.data.label
            : undefined
        }
      />
    </div>
  )
}

export default function PipelineCanvas(props:CanvasProps) {
  return <ReactFlowProvider><PipelineCanvasInner {...props} /></ReactFlowProvider>
}
