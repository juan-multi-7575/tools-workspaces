import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useReactFlow,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
  type NodeTypes,
  type EdgeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { api, type PortKind, type ToolManifest, type DAGNode, type DAGEdge } from '../../lib/api'
import {
  CheckCircle2,
  Play,
  AlertCircle,
  Trash2,
  BookmarkPlus,
  X,
  Maximize2,
  Minimize2,
  LayoutGrid,
  Sparkles,
  Unlink,
  Square,
  Save,
  Undo2,
  Redo2,
  MoreHorizontal,
} from 'lucide-react'
import UniversalPipelineRunModal from './UniversalPipelineRunModal'
import { resolvePipelineFlow, type PipelineEntryInput, type ResolvedPipelineFlow } from '../../lib/pipelineInputResolver'
import { useActivityTracker } from '../activity/ActivityContext'

export type ToolNodeStatus = 'idle' | 'pending' | 'running' | 'completed' | 'failed' | 'skipped'

type ToolNodeData = {
  label: string
  toolId: string
  category?: string
  inputKinds: PortKind[]
  outputKinds: PortKind[]
  params: Record<string, unknown>
  status?: ToolNodeStatus
  errorMessage?: string
  durationSeconds?: number
  cached?: boolean
}

export function getPortColor(kind: string): string {
  const k = (kind || '').toLowerCase()
  if (k.includes('audio')) return '#9D6638' // caramel
  if (k.includes('video')) return '#4E220F' // espresso
  if (k.includes('image')) return '#B0BA99' // sage
  if (k.includes('doc') || k.includes('pdf')) return '#86542C' // brown
  if (k.includes('text') || k.includes('code')) return '#7C5339' // soft brown
  if (k.includes('json') || k.includes('data')) return '#B0BA99' // sage
  if (k.includes('sec') || k.includes('hash')) return '#A83232' // red
  if (k.includes('net') || k.includes('port')) return '#9D6638' // caramel
  return '#B0BA99'
}

/** Custom Interactive Edge with instant disconnect button on the line */
function DeletableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  selected,
}: EdgeProps) {
  const { setEdges } = useReactFlow()
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetPosition,
    targetX,
    targetY,
  })

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: selected ? '#A83232' : (style.stroke || '#9D6638'),
          strokeWidth: selected ? 3.5 : (style.strokeWidth || 2.5),
        }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan"
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setEdges((es) => es.filter((edge) => edge.id !== id))
            }}
            className="group flex size-5 items-center justify-center rounded-full bg-[#FFFFFF] border-2 border-[#B0BA99] text-[#7C5339] hover:bg-[#A83232] hover:text-[#FFFFFF] hover:border-[#A83232] shadow-sm transition-all duration-150 active:scale-90"
            title="Disconnect this link (or press Delete)"
          >
            <span className="text-[11px] font-extrabold leading-none select-none group-hover:scale-110 transition-transform">
              ×
            </span>
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  )
}

/** Custom Tool Node with per-node delete button and clear ports */
function ToolNode({ id, data, selected }: NodeProps<Node<ToolNodeData>>) {
  const { setNodes, setEdges } = useReactFlow()

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    setNodes((nds) => nds.filter((n) => n.id !== id))
    setEdges((eds) => eds.filter((edge) => edge.source !== id && edge.target !== id))
  }

  const status = data.status || 'idle'

  // Dynamic status styling
  let containerStyle = 'w-72 rounded-2xl border p-3.5 text-[#4E220F] shadow-md transition-all duration-200 relative bg-[#FFFFFF] '
  if (status === 'running') {
    containerStyle += 'border-[#9D6638] ring-3 ring-[#9D6638]/40 shadow-xl animate-pulse '
  } else if (status === 'completed') {
    containerStyle += 'border-emerald-600 ring-2 ring-emerald-500/30 shadow-md '
  } else if (status === 'failed') {
    containerStyle += 'border-[#A83232] ring-3 ring-[#A83232]/50 shadow-xl bg-red-50/20 '
  } else if (status === 'skipped') {
    containerStyle += 'border-dashed border-[#B0BA99] opacity-50 bg-[#EDE5CD]/20 '
  } else if (status === 'pending') {
    containerStyle += 'border-amber-400/80 border-dashed bg-amber-50/20 '
  } else if (selected) {
    containerStyle += 'border-[#9D6638] ring-2 ring-[#9D6638]/40 shadow-lg '
  } else {
    containerStyle += 'border-[#B0BA99] hover:border-[#9D6638] '
  }

  return (
    <div className={containerStyle}>
      {/* Remove Node Button */}
      <button
        type="button"
        onClick={handleDelete}
        className="absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full bg-[#FFFFFF] border border-[#B0BA99] text-[#7C5339] hover:bg-[#A83232] hover:text-[#FFFFFF] hover:border-[#A83232] shadow-sm transition-all active:scale-90"
        title="Remove tool from canvas"
      >
        <X className="size-3" />
      </button>

      {/* Target (Input) Handles */}
      {data.inputKinds.map((kind, i) => (
        <Handle
          key={`in-${kind}-${i}`}
          type="target"
          position={Position.Left}
          id={kind}
          style={{
            background: getPortColor(kind),
            width: 12,
            height: 12,
            border: '2px solid #F7F1DE',
            top: `${25 + (i * 50) / Math.max(1, data.inputKinds.length)}%`,
          }}
          title={`Input: ${kind}`}
        />
      ))}

      {/* Top Header & Status Badge */}
      <div className="mb-1.5 flex items-center justify-between gap-1.5 pr-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#7C5339] bg-[#EDE5CD]/80 px-1.5 py-0.5 rounded border border-[#B0BA99]/40 truncate">
            {data.toolId}
          </span>
          <span className="rounded-md bg-[#B0BA99]/30 px-1.5 py-0.5 text-[9px] font-bold text-[#4E220F] border border-[#B0BA99]/60 shrink-0">
            {data.category || 'Tool'}
          </span>
        </div>

        {/* Live Execution Status Pill */}
        {status === 'running' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-300 px-2 py-0.5 text-[10px] font-extrabold text-amber-800 animate-bounce">
            <span className="size-1.5 rounded-full bg-amber-600 animate-ping" />
            Running
          </span>
        )}
        {status === 'completed' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 border border-emerald-300 px-2 py-0.5 text-[10px] font-extrabold text-emerald-800">
            {data.cached ? (
              <>
                <Sparkles className="size-3 text-emerald-600" />
                ⚡ Cached
              </>
            ) : (
              <>
                <CheckCircle2 className="size-3 text-emerald-600" />
                Done {data.durationSeconds ? `(${data.durationSeconds.toFixed(1)}s)` : ''}
              </>
            )}
          </span>
        )}
        {status === 'failed' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 border border-red-300 px-2 py-0.5 text-[10px] font-extrabold text-[#A83232]">
            <AlertCircle className="size-3 text-[#A83232]" />
            Failed
          </span>
        )}
        {status === 'skipped' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 border border-neutral-300 px-2 py-0.5 text-[10px] font-bold text-neutral-500">
            Skipped
          </span>
        )}
        {status === 'pending' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
            Waiting...
          </span>
        )}
      </div>

      <p className="text-xs font-bold text-[#4E220F] truncate" title={data.label}>
        {data.label}
      </p>

      {/* Error Message Pill if failed */}
      {status === 'failed' && data.errorMessage && (
        <div className="mt-2 rounded-lg bg-[#A83232]/10 border border-[#A83232]/30 p-2 text-[10px] font-medium text-[#A83232] break-words line-clamp-3 leading-tight">
          ⚠️ {data.errorMessage}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between border-t border-[#B0BA99]/50 pt-2 text-[9px] font-mono text-[#7C5339] font-medium">
        <span className="truncate max-w-[110px]" title={`in: ${data.inputKinds.join(', ')}`}>
          in: {data.inputKinds.join(', ')}
        </span>
        <span className="truncate max-w-[110px]" title={`out: ${data.outputKinds.join(', ')}`}>
          out: {data.outputKinds.join(', ')}
        </span>
      </div>

      {/* Source (Output) Handles */}
      {data.outputKinds.map((kind, i) => (
        <Handle
          key={`out-${kind}-${i}`}
          type="source"
          position={Position.Right}
          id={kind}
          style={{
            background: getPortColor(kind),
            width: 12,
            height: 12,
            border: '2px solid #F7F1DE',
            top: `${25 + (i * 50) / Math.max(1, data.outputKinds.length)}%`,
          }}
          title={`Output: ${kind}`}
        />
      ))}
    </div>
  )
}

const nodeTypes: NodeTypes = {
  toolNode: ToolNode,
}

const edgeTypes: EdgeTypes = {
  deletableEdge: DeletableEdge,
}

const defaultEdgeOptions = {
  type: 'deletableEdge',
  animated: true,
  style: { stroke: '#9D6638', strokeWidth: 2.5 },
}

export interface StarterWorkflow {
  name: string
  chain: string[]
  desc: string
  defaultParams?: Record<string, Record<string, any>>
}

const STARTER_WORKFLOWS: StarterWorkflow[] = [
  {
    name: '🌐 YouTube to English Subtitles (Translated)',
    chain: ['downloader', 'audio_processor', 'transcriber'],
    desc: 'Download ➔ Audio Extract ➔ Whisper Translate directly to English SRT',
    defaultParams: {
      transcriber: {
        task: 'translate',
        output_format: 'srt',
      },
    },
  },
  {
    name: '🎬 Video to Original Subtitles (SRT)',
    chain: ['downloader', 'audio_processor', 'transcriber'],
    desc: 'Download ➔ Audio Extract ➔ Whisper Transcribe (Original Language)',
    defaultParams: {
      transcriber: {
        task: 'transcribe',
        output_format: 'srt',
      },
    },
  },
  {
    name: '🤖 AI Subtitle Translator (LLM)',
    chain: ['downloader', 'audio_processor', 'transcriber', 'subtitle_translator'],
    desc: 'Download ➔ Transcribe ➔ LLM Translate to Target Language',
    defaultParams: {
      transcriber: {
        task: 'transcribe',
        output_format: 'srt',
      },
      subtitle_translator: {
        target_lang: 'English',
        provider: 'groq',
      },
    },
  },
  {
    name: '🎵 Video to Audio Extractor',
    chain: ['downloader', 'audio_processor'],
    desc: 'Download ➔ Extract High-Quality WAV/MP3',
    defaultParams: {
      audio_processor: {
        output_format: 'wav',
      },
    },
  },
  {
    name: '📝 Video to AI Summary & Insights',
    chain: ['downloader', 'audio_processor', 'transcriber', 'summarizer'],
    desc: 'Download ➔ Transcribe ➔ Executive Summary',
    defaultParams: {
      transcriber: {
        task: 'transcribe',
        output_format: 'srt',
      },
      summarizer: {
        format: 'bullet_points',
      },
    },
  },
]

function PipelineCanvasInner({
  workspaceId,
  tools: initialTools,
  onRan,
  onSelectNode,
  selectedNodeId: externalSelectedNodeId,
  externalAddToolRef,
  externalUpdateParamsRef,
  onGraphStats,
}: {
  workspaceId: string
  tools?: ToolManifest[]
  onRan: () => void
  onSelectNode?: (node: { id: string; toolId: string; label: string; params: Record<string, unknown>; status?: string; durationSeconds?: number; errorMessage?: string; cached?: boolean } | null) => void
  selectedNodeId?: string | null
  externalAddToolRef?: React.MutableRefObject<((manifest: ToolManifest) => void) | null>
  externalUpdateParamsRef?: React.MutableRefObject<((params: Record<string, unknown>) => void) | null>
  onGraphStats?: (stats: { nodeCount: number; edgeCount: number }) => void
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<ToolNodeData>>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [tools, setTools] = useState<ToolManifest[]>(initialTools || [])
  const [templates, setTemplates] = useState<{ name: string; chain: string[] }[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [templateName, setTemplateName] = useState('')
  const [isSaveTemplateOpen, setIsSaveTemplateOpen] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved')
  const [showSavedToast, setShowSavedToast] = useState(false)
  const [clearArmed, setClearArmed] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [histDepths, setHistDepths] = useState({ past: 0, future: 0 })
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isRunModalOpen, setIsRunModalOpen] = useState(false)
  const [runModalInputs, setRunModalInputs] = useState<PipelineEntryInput[]>([])
  const [resolvedFlow, setResolvedFlow] = useState<ResolvedPipelineFlow | undefined>(undefined)
  const { fitView } = useReactFlow()
  const isLoadedRef = useRef(false)
  const saveTimeoutRef = useRef<any>(null)
  const savedToastTimerRef = useRef<any>(null)
  const clearArmTimerRef = useRef<any>(null)
  const pastRef = useRef<{ nodes: Node<ToolNodeData>[]; edges: Edge[] }[]>([])
  const futureRef = useRef<{ nodes: Node<ToolNodeData>[]; edges: Edge[] }[]>([])
  const historyLockRef = useRef(false)
  const historyTimerRef = useRef<any>(null)
  const MAX_HISTORY = 50

  // 1. Initial load from backend persistence (or fallback to starter)
  useEffect(() => {
    isLoadedRef.current = false
    api.getWorkspaceCanvas(workspaceId)
      .then((canvasState) => {
        if (canvasState && canvasState.nodes) {
          const loadedNodes: Node<ToolNodeData>[] = canvasState.nodes.map((n) => ({
            id: n.id,
            type: n.type || 'toolNode',
            position: n.position || { x: 60, y: 100 },
            data: {
              label: n.data.label,
              toolId: n.data.toolId,
              category: n.data.category,
              inputKinds: n.data.inputKinds || ['any'],
              outputKinds: n.data.outputKinds || ['any'],
              params: n.data.params || {},
              status: n.data.status,
              errorMessage: n.data.errorMessage,
              durationSeconds: n.data.durationSeconds,
              cached: n.data.cached,
            },
          }))
          const loadedEdges: Edge[] = (canvasState.edges || []).map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            sourceHandle: e.sourceHandle,
            targetHandle: e.targetHandle,
            type: e.type || 'deletableEdge',
            animated: e.animated ?? true,
            style: (e.style as any) || { stroke: '#9D6638', strokeWidth: 2.5 },
          }))
          setNodes(loadedNodes)
          setEdges(loadedEdges)
        }
        setTimeout(() => fitView({ padding: 0.2 }), 80)
      })
      .catch(() => {})
      .finally(() => {
        isLoadedRef.current = true
      })
  }, [workspaceId, fitView, setNodes, setEdges])

  const flashSavedToast = useCallback(() => {
    setShowSavedToast(true)
    if (savedToastTimerRef.current) clearTimeout(savedToastTimerRef.current)
    savedToastTimerRef.current = setTimeout(() => setShowSavedToast(false), 1500)
  }, [])

  const persistCanvas = useCallback(
    (nowNodes: Node<ToolNodeData>[], nowEdges: Edge[]) => {
      setSaveStatus('saving')
      const payloadNodes = nowNodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: n.data,
      }))
      const payloadEdges = nowEdges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
        type: e.type,
        animated: e.animated,
        style: e.style,
      }))
      return api
        .saveWorkspaceCanvas(workspaceId, {
          nodes: payloadNodes,
          edges: payloadEdges,
        })
        .then(() => {
          setSaveStatus('saved')
          flashSavedToast()
        })
        .catch(() => setSaveStatus('unsaved'))
    },
    [workspaceId, flashSavedToast],
  )

  // Explicit save (button + ⌘S): flush any pending debounce and persist now
  const saveCanvasNow = useCallback(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    return persistCanvas(nodes, edges)
  }, [nodes, edges, persistCanvas])

  // 2. Debounced auto-save to backend whenever nodes, edges, or params change
  useEffect(() => {
    if (!isLoadedRef.current) return
    setSaveStatus('unsaved')
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)

    saveTimeoutRef.current = setTimeout(() => {
      persistCanvas(nodes, edges)
    }, 600)

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    }
  }, [nodes, edges, workspaceId, persistCanvas])

  const snapshotOf = (nowNodes: Node<ToolNodeData>[], nowEdges: Edge[]) => {
    // Strip volatile ReactFlow runtime keys (measured dimensions, selection)
    // so history compares semantic graph state only.
    const clean = (items: object[]) =>
      items.map((item) => {
        const { measured: _m, selected: _s, ...rest } = item as Record<string, unknown>
        return rest
      })
    try {
      return {
        nodes: JSON.parse(JSON.stringify(clean(nowNodes))) as Node<ToolNodeData>[],
        edges: JSON.parse(JSON.stringify(clean(nowEdges))) as Edge[],
      }
    } catch {
      return { nodes: [...nowNodes], edges: [...nowEdges] }
    }
  }

  // 2b. Undo/redo history (shift register): when the settled graph changes from
  // lastSnap -> snap, the PRE-change state (lastSnap) is what undo returns to.
  // Undo/redo replays run under historyLock so they never record.
  const lastSnapRef = useRef<{ nodes: Node<ToolNodeData>[]; edges: Edge[] } | null>(null)
  useEffect(() => {
    if (!isLoadedRef.current || historyLockRef.current) return
    if (historyTimerRef.current) clearTimeout(historyTimerRef.current)
    historyTimerRef.current = setTimeout(() => {
      const snap = snapshotOf(nodes, edges)
      const prev = lastSnapRef.current
      lastSnapRef.current = snap
      if (!prev) return // first settled state seeds the register, nothing to undo yet
      if (JSON.stringify(prev) === JSON.stringify(snap)) return
      pastRef.current.push(prev)
      if (pastRef.current.length > MAX_HISTORY) pastRef.current.shift()
      futureRef.current = []
      setHistDepths({ past: pastRef.current.length, future: 0 })
    }, 400)
    return () => {
      if (historyTimerRef.current) clearTimeout(historyTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges])

  const applySnapshot = useCallback(
    (snap: { nodes: Node<ToolNodeData>[]; edges: Edge[] }) => {
      historyLockRef.current = true
      setNodes(snap.nodes)
      setEdges(snap.edges)
      setSelectedNodeId(null)
      setSelectedEdgeId(null)
      setTimeout(() => {
        historyLockRef.current = false
      }, 0)
    },
    [setNodes, setEdges],
  )

  const syncHistDepths = useCallback(() => {
    setHistDepths({ past: pastRef.current.length, future: futureRef.current.length })
  }, [])

  const undo = useCallback(() => {
    if (pastRef.current.length === 0) {
      syncHistDepths()
      return
    }
    const cur = snapshotOf(nodes, edges)
    const prev = pastRef.current[pastRef.current.length - 1]
    if (JSON.stringify(prev) === JSON.stringify(cur)) {
      syncHistDepths()
      return
    }
    pastRef.current.pop()
    futureRef.current.push(cur)
    lastSnapRef.current = prev
    applySnapshot(prev)
    syncHistDepths()
  }, [nodes, edges, applySnapshot, syncHistDepths])

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) {
      syncHistDepths()
      return
    }
    const cur = snapshotOf(nodes, edges)
    const next = futureRef.current[futureRef.current.length - 1]
    if (JSON.stringify(next) === JSON.stringify(cur)) {
      syncHistDepths()
      return
    }
    futureRef.current.pop()
    pastRef.current.push(cur)
    lastSnapRef.current = next
    applySnapshot(next)
    syncHistDepths()
  }, [nodes, edges, applySnapshot, syncHistDepths])

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

  useEffect(() => {
    if (initialTools && initialTools.length > 0) {
      setTools(initialTools)
    } else {
      api.listTools().then(({ tools }) => {
        setTools(tools)
      }).catch(() => {})
    }
    api.listTemplates(workspaceId, true).then(({ templates }) => setTemplates(templates)).catch(() => {})
  }, [workspaceId, initialTools])

  const onConnect = useCallback(
    (params: Connection) =>
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            type: 'deletableEdge',
            animated: true,
            style: { stroke: '#9D6638', strokeWidth: 2.5 },
          },
          eds,
        ),
      ),
    [setEdges],
  )

  const selected = useMemo(() => {
    const targetId = externalSelectedNodeId !== undefined ? externalSelectedNodeId : selectedNodeId
    return nodes.find((n) => n.id === targetId)
  }, [nodes, selectedNodeId, externalSelectedNodeId])
  const selectedEdge = useMemo(() => edges.find((e) => e.id === selectedEdgeId), [edges, selectedEdgeId])

  const { setOpen: setActivityOpen, setActiveTab: setActivityTab, setAutoOpened } = useActivityTracker()

  // Report graph size to parent (inspector fallback) whenever it changes
  useEffect(() => {
    if (onGraphStats) onGraphStats({ nodeCount: nodes.length, edgeCount: edges.length })
  }, [nodes, edges, onGraphStats])

  // Sync selection to parent inspector if requested
  useEffect(() => {
    if (onSelectNode) {
      if (selected) {
        onSelectNode({
          id: selected.id,
          toolId: selected.data.toolId,
          label: selected.data.label,
          params: selected.data.params || {},
          status: selected.data.status,
          durationSeconds: selected.data.durationSeconds,
          errorMessage: selected.data.errorMessage,
          cached: selected.data.cached,
        })
      } else {
        onSelectNode(null)
      }
    }
  }, [selected, onSelectNode])

  const addTool = (manifest: ToolManifest) => {
    const id = `${manifest.id}-${nodes.length + 1}`
    const node: Node<ToolNodeData> = {
      id,
      type: 'toolNode',
      position: { x: 60 + (nodes.length % 3) * 320, y: 60 + Math.floor(nodes.length / 3) * 180 },
      data: {
        label: manifest.name,
        toolId: manifest.id,
        category: manifest.category,
        inputKinds: manifest.input_kinds,
        outputKinds: manifest.output_kinds,
        params: {},
      },
    }
    setNodes((nds) => [...nds, node])
    setStatus(null)
  }

  /** Auto-arrange nodes in a clean DAG flow from left to right */
  const autoArrange = useCallback(() => {
    if (nodes.length === 0) return

    const inDegree: Record<string, number> = {}
    const children: Record<string, string[]> = {}
    nodes.forEach((n) => {
      inDegree[n.id] = 0
      children[n.id] = []
    })
    edges.forEach((e) => {
      if (inDegree[e.target] !== undefined) inDegree[e.target]++
      if (children[e.source]) children[e.source].push(e.target)
    })

    const levels: Record<string, number> = {}
    const queue = nodes.filter((n) => inDegree[n.id] === 0).map((n) => n.id)
    queue.forEach((id) => (levels[id] = 0))

    let front = 0
    while (front < queue.length) {
      const curr = queue[front++]
      const nextLevel = (levels[curr] || 0) + 1
      for (const child of children[curr] || []) {
        levels[child] = Math.max(levels[child] || 0, nextLevel)
        queue.push(child)
      }
    }

    const levelGroups: Record<number, string[]> = {}
    nodes.forEach((n) => {
      const lvl = levels[n.id] || 0
      if (!levelGroups[lvl]) levelGroups[lvl] = []
      levelGroups[lvl].push(n.id)
    })

    const nextNodes = nodes.map((n) => {
      const lvl = levels[n.id] || 0
      const group = levelGroups[lvl] || [n.id]
      const idxInGroup = group.indexOf(n.id)
      return {
        ...n,
        position: {
          x: 60 + lvl * 320,
          y: 60 + idxInGroup * 180,
        },
      }
    })

    setNodes(nextNodes)
    setTimeout(() => fitView({ padding: 0.2 }), 50)
  }, [nodes, edges, setNodes, fitView])

  const buildDAGPayload = (): { nodes: DAGNode[]; edges: DAGEdge[] } => {
    const dagNodes: DAGNode[] = nodes.map((n) => ({
      id: n.id,
      tool_id: n.data.toolId,
      params: n.data.params,
      position: n.position,
    }))
    const dagEdges: DAGEdge[] = edges.map((e) => ({
      source_node: e.source,
      source_port: e.sourceHandle || 'default',
      target_node: e.target,
      target_port: e.targetHandle || 'default',
    }))
    return { nodes: dagNodes, edges: dagEdges }
  }

  const validate = async () => {
    if (nodes.length === 0) return
    const payload = buildDAGPayload()
    const res = await api.validatePipeline(workspaceId, payload)
    setStatus({
      ok: res.valid,
      msg: res.valid ? 'Pipeline graph is compatible and valid' : res.error ?? 'Invalid pipeline',
    })
  }

  const executePipelineWithParams = async (
    overrideParamsByNode?: Record<string, Record<string, unknown>>,
    cachePolicy?: 'reuse' | 'recompute',
  ) => {
    if (nodes.length === 0) return
    setBusy(true)
    // Surface live progress: auto-open the activity drawer on the live tab
    setActivityTab('downloads')
    setAutoOpened(true)
    setActivityOpen(true)
    try {
      // Build payload with any updated parameters from modal
      const dagNodes: DAGNode[] = nodes.map((n) => {
        const overrides = overrideParamsByNode?.[n.id] || {}
        return {
          id: n.id,
          tool_id: n.data.toolId,
          params: { ...n.data.params, ...overrides },
          position: n.position,
        }
      })
      const dagEdges: DAGEdge[] = edges.map((e) => ({
        source_node: e.source,
        source_port: e.sourceHandle || 'default',
        target_node: e.target,
        target_port: e.targetHandle || 'default',
      }))

      // Reset all nodes on canvas to pending/idle before starting run
      setNodes((nds) =>
        nds.map((n) => ({
          ...n,
          data: {
            ...n.data,
            params: { ...n.data.params, ...(overrideParamsByNode?.[n.id] || {}) },
            status: 'pending',
            errorMessage: undefined,
            durationSeconds: undefined,
            cached: undefined,
          },
        })),
      )

      setStatus({ ok: true, msg: 'Starting pipeline execution...' })

      let failedNode: { id: string; error: string } | null = null

      await api.runPipelineStream(
        workspaceId,
        { nodes: dagNodes, edges: dagEdges, error_policy: 'fail_fast', cache_policy: cachePolicy || 'recompute' },
        (evt) => {
          if (evt.type === 'node_started' && evt.node_id) {
            setNodes((nds) =>
              nds.map((n) =>
                n.id === evt.node_id
                  ? { ...n, data: { ...n.data, status: 'running', errorMessage: undefined } }
                  : n,
              ),
            )
            setStatus({ ok: true, msg: `Running ${evt.tool_name || evt.tool_id}...` })
          } else if (evt.type === 'node_completed' && evt.node_id) {
            const isCached = (evt as any).cached
            setNodes((nds) =>
              nds.map((n) =>
                n.id === evt.node_id
                  ? {
                      ...n,
                      data: {
                        ...n.data,
                        status: 'completed',
                        durationSeconds: evt.duration,
                        cached: isCached,
                      },
                    }
                  : n,
              ),
            )
          } else if (evt.type === 'node_failed' && evt.node_id) {
            const errStr = evt.error || 'Execution failed'
            failedNode = { id: evt.node_id, error: errStr }
            setNodes((nds) =>
              nds.map((n) =>
                n.id === evt.node_id
                  ? {
                      ...n,
                      data: {
                        ...n.data,
                        status: 'failed',
                        errorMessage: errStr,
                        durationSeconds: evt.duration,
                      },
                    }
                  : n,
              ),
            )
          } else if (evt.type === 'node_skipped' && evt.node_id) {
            setNodes((nds) =>
              nds.map((n) =>
                n.id === evt.node_id
                  ? {
                      ...n,
                      data: {
                        ...n.data,
                        status: 'skipped',
                        errorMessage: evt.reason || 'Skipped due to upstream failure',
                      },
                    }
                  : n,
              ),
            )
          } else if (evt.type === 'pipeline_finished') {
            if (evt.status === 'failed' || failedNode) {
              const err = failedNode ? `Halted on "${failedNode.id}": ${failedNode.error}` : 'Pipeline stopped due to error'
              setStatus({ ok: false, msg: err })
            } else {
              setStatus({ ok: true, msg: 'All pipeline steps finished successfully' })
            }
          } else if (evt.type === 'pipeline_error') {
            setStatus({ ok: false, msg: evt.error || 'Pipeline execution failed' })
          }
        },
      )

      onRan()
    } catch (err: unknown) {
      setStatus({ ok: false, msg: err instanceof Error ? err.message : 'Execution failed' })
    } finally {
      setBusy(false)
    }
  }

  const handleRunClick = () => {
    if (nodes.length === 0) return
    const flow = resolvePipelineFlow(nodes, edges, tools)
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
    setNodes([])
    setEdges([])
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
      const tool = tools.find((t) => t.id === toolId)
      const id = `${toolId}-${i + 1}`
      const initialParams = defaultParams?.[toolId] || {}
      nextNodes.push({
        id,
        type: 'toolNode',
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
          style: { stroke: '#9D6638', strokeWidth: 2.5 },
        })
      }
    })
    setNodes(nextNodes)
    setEdges(nextEdges)
    setSelectedNodeId(null)
    setSelectedEdgeId(null)
    setStatus({ ok: true, msg: `Loaded "${label}"` })
    setTimeout(() => fitView({ padding: 0.2 }), 50)

    // Automatically prompt input modal for 1-click convenience
    const flow = resolvePipelineFlow(nextNodes as any, nextEdges as any, tools)
    setResolvedFlow(flow)
    setRunModalInputs(flow.entryInputs)
    setIsRunModalOpen(true)
  }

  const updateSelectedParams = (nextParams: Record<string, unknown>) => {
    const targetId = externalSelectedNodeId !== undefined ? externalSelectedNodeId : selectedNodeId
    if (!targetId) return
    setNodes((nds) =>
      nds.map((n) => (n.id === targetId ? { ...n, data: { ...n.data, params: nextParams } } : n)),
    )
  }

  // Bind external action refs for studio layout
  useEffect(() => {
    if (externalAddToolRef) externalAddToolRef.current = addTool
    if (externalUpdateParamsRef) externalUpdateParamsRef.current = updateSelectedParams
  })

  return (
    <div className="space-y-3 text-[#4E220F] flex flex-col h-full">
      {/* Sleek Canvas Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#B0BA99] bg-[#FFFFFF] p-3 shadow-xs">
        {nodes.length === 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            {/* Starter Workflows Selector (empty canvas only) */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-[#7C5339] flex items-center gap-1 mr-1">
                <Sparkles className="size-3.5 text-[#9D6638]" /> Starters:
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {STARTER_WORKFLOWS.map((wf) => (
                  <button
                    key={wf.name}
                    onClick={() => loadWorkflowChain(wf.chain, wf.name, wf.defaultParams)}
                    className="inline-flex items-center gap-1 rounded-xl border border-[#B0BA99] bg-[#F7F1DE]/70 px-2.5 py-1 text-xs font-bold text-[#4E220F] hover:bg-[#9D6638] hover:text-[#FFFFFF] hover:border-[#9D6638] transition-all shadow-2xs active:scale-95"
                    title={wf.desc}
                  >
                    <span>{wf.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Saved Templates (empty canvas only) */}
            {templates.length > 0 && (
              <div className="flex items-center gap-1.5 pl-2 border-l border-[#B0BA99]/60">
                <select
                  value={selectedTemplate}
                  onChange={(e) => {
                    setSelectedTemplate(e.target.value)
                    const tpl = templates.find((t) => t.name === e.target.value)
                    if (tpl) loadWorkflowChain(tpl.chain, tpl.name)
                  }}
                  className="rounded-xl border border-[#B0BA99] bg-[#F7F1DE]/70 px-2.5 py-1 text-xs text-[#4E220F] font-bold focus:border-[#9D6638] focus:outline-none max-w-xs truncate"
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
          <div className="text-xs font-mono text-[#7C5339]">
            {nodes.length} node{nodes.length === 1 ? '' : 's'} · {edges.length} edge{edges.length === 1 ? '' : 's'}
          </div>
        )}

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Undo / Redo */}
          <button
            onClick={undo}
            disabled={histDepths.past === 0}
            className="inline-flex items-center gap-1 rounded-xl border border-[#B0BA99] bg-[#EDE5CD] px-2 py-1.5 text-xs font-bold text-[#4E220F] hover:bg-[#B0BA99]/40 transition-all shadow-2xs disabled:opacity-40"
            title="Undo (⌘Z)"
          >
            <Undo2 className="size-3.5 text-[#9D6638]" />
          </button>
          <button
            onClick={redo}
            disabled={histDepths.future === 0}
            className="inline-flex items-center gap-1 rounded-xl border border-[#B0BA99] bg-[#EDE5CD] px-2 py-1.5 text-xs font-bold text-[#4E220F] hover:bg-[#B0BA99]/40 transition-all shadow-2xs disabled:opacity-40"
            title="Redo (⇧⌘Z)"
          >
            <Redo2 className="size-3.5 text-[#9D6638]" />
          </button>

          {/* Save Status: visible while dirty/saving; Saved auto-dismisses */}
          {(saveStatus !== 'saved' || showSavedToast) && (
            <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border border-[#B0BA99]/60 bg-[#F7F1DE]/60 text-[10px] font-mono">
              {saveStatus === 'saved' && showSavedToast && (
                <>
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span className="text-[#4E220F] font-bold">Saved</span>
                </>
              )}
              {saveStatus === 'saving' && (
                <>
                  <span className="h-2 w-2 rounded-full bg-[#9D6638] animate-ping" />
                  <span className="text-[#9D6638] font-bold">Saving...</span>
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
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#B0BA99] bg-[#EDE5CD] px-2.5 py-1.5 text-xs font-bold text-[#4E220F] hover:bg-[#B0BA99]/40 transition-all shadow-2xs disabled:opacity-40"
            title="Save pipeline now (⌘S)"
          >
            <Save className="size-3.5 text-[#9D6638]" /> Save
          </button>

          {selectedEdge && (
            <button
              onClick={() => {
                setEdges((eds) => eds.filter((e) => e.id !== selectedEdgeId))
                setSelectedEdgeId(null)
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#A83232] bg-[#A83232]/10 px-2.5 py-1.5 text-xs font-bold text-[#A83232] hover:bg-[#A83232] hover:text-[#FFFFFF] transition-all shadow-2xs"
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
              className={`inline-flex items-center gap-1 rounded-xl border border-[#B0BA99] bg-[#EDE5CD] px-2 py-1.5 text-xs font-bold text-[#4E220F] hover:bg-[#B0BA99]/40 transition-all shadow-2xs ${moreOpen ? 'ring-2 ring-[#9D6638]/40' : ''}`}
              title="More canvas actions"
              aria-haspopup="menu"
              aria-expanded={moreOpen}
            >
              <MoreHorizontal className="size-4 text-[#9D6638]" />
            </button>
            {moreOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => { setMoreOpen(false); setClearArmed(false) }} />
                <div role="menu" className="absolute right-0 top-full z-50 mt-1.5 w-56 overflow-hidden rounded-xl border border-[#B0BA99] bg-[#FFFFFF] shadow-xl">
                  <button
                    role="menuitem"
                    onClick={() => { setMoreOpen(false); autoArrange() }}
                    disabled={nodes.length === 0}
                    className="flex w-full items-center gap-2 px-3.5 py-2 text-xs font-bold text-[#4E220F] hover:bg-[#EDE5CD] transition-colors disabled:opacity-40 text-left"
                    title="Automatically arrange nodes cleanly from left to right"
                  >
                    <LayoutGrid className="size-3.5 text-[#9D6638]" /> Auto Arrange
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => { setMoreOpen(false); validate() }}
                    disabled={nodes.length === 0}
                    className="flex w-full items-center gap-2 px-3.5 py-2 text-xs font-bold text-[#4E220F] hover:bg-[#EDE5CD] transition-colors disabled:opacity-40 text-left"
                    title="Validate compatibility of connections"
                  >
                    <CheckCircle2 className="size-3.5 text-[#9D6638]" /> Validate Graph
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => { setMoreOpen(false); setIsSaveTemplateOpen(true) }}
                    disabled={nodes.length === 0}
                    className="flex w-full items-center gap-2 px-3.5 py-2 text-xs font-bold text-[#4E220F] hover:bg-[#EDE5CD] transition-colors disabled:opacity-40 text-left"
                    title="Save current pipeline as reusable template"
                  >
                    <BookmarkPlus className="size-3.5 text-[#9D6638]" /> Save as Template
                  </button>
                  <div className="border-t border-[#B0BA99]/40" />
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
                        ? 'bg-[#A83232] text-[#FFFFFF] hover:bg-[#862727]'
                        : 'text-[#A83232] hover:bg-[#A83232]/10'
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
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#B0BA99] bg-[#EDE5CD] px-2.5 py-1.5 text-xs font-bold text-[#4E220F] hover:bg-[#B0BA99]/40 transition-all shadow-2xs"
            title={isExpanded ? 'Shrink Canvas View' : 'Expand Canvas View'}
          >
            {isExpanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </button>

          {busy ? (
            <button
              onClick={async () => {
                setStatus({ ok: false, msg: 'Stopping pipeline...' })
                try {
                  await api.stopPipeline(workspaceId)
                } catch {
                  /* ignore */
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#A83232] px-4 py-1.5 text-xs font-bold text-[#FFFFFF] hover:bg-[#862727] transition-all shadow-md active:scale-95 animate-pulse"
              title="Stop running pipeline immediately"
            >
              <Square className="size-3.5 fill-current" />
              Stop Pipeline
            </button>
          ) : (
            <button
              onClick={handleRunClick}
              disabled={nodes.length === 0}
              title={nodes.length === 0 ? 'Add a node to run' : `Run ${nodes.length} node${nodes.length === 1 ? '' : 's'}`}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#9D6638] px-4 py-1.5 text-xs font-bold text-[#FDFBF7] hover:bg-[#86542C] transition-all disabled:opacity-50 shadow-sm"
            >
              <Play className="size-3.5 fill-current" />
              {nodes.length === 0 ? 'Run Pipeline' : `Run · ${nodes.length} node${nodes.length === 1 ? '' : 's'}`}
            </button>
          )}
        </div>
      </div>

      {/* Status Bar */}
      {status && (
        <div
          className={`flex items-center justify-between rounded-xl border px-4 py-2 text-xs font-mono font-semibold ${
            status.ok
              ? 'border-[#B0BA99] bg-[#EDE5CD]/70 text-[#4E220F]'
              : 'border-[#A83232]/30 bg-[#A83232]/10 text-[#A83232]'
          }`}
        >
          <div className="flex items-center gap-2">
            {status.ok ? (
              <CheckCircle2 className="size-4 text-[#9D6638]" />
            ) : (
              <AlertCircle className="size-4 text-[#A83232]" />
            )}
            <span>{status.msg}</span>
          </div>
          <button onClick={() => setStatus(null)} className="text-[#7C5339] hover:text-[#4E220F]">
            ×
          </button>
        </div>
      )}

      {/* Full-Width Spacious Graph Canvas Area */}
      <div
        className={`rounded-2xl border-2 border-[#B0BA99] bg-[#F7F1DE] overflow-hidden shadow-inner transition-all duration-200 w-full relative ${
          isExpanded ? 'h-[780px]' : 'h-[620px]'
        }`}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, node) => {
            setSelectedNodeId(node.id)
            setSelectedEdgeId(null)
          }}
          onEdgeClick={(_, edge) => {
            setSelectedEdgeId(edge.id)
            setSelectedNodeId(null)
          }}
          onPaneClick={() => {
            setSelectedNodeId(null)
            setSelectedEdgeId(null)
          }}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
          deleteKeyCode={['Backspace', 'Delete']}
          elementsSelectable={true}
          fitView
        >
          <Background color="#B0BA99" gap={18} />
          <Controls className="!bg-[#FFFFFF] !border-[#B0BA99] !fill-[#4E220F] !rounded-xl !shadow-xs" />
          <MiniMap
            nodeColor="#9D6638"
            maskColor="rgba(247,241,222,0.85)"
            className="!bg-[#FFFFFF] !border-[#B0BA99] !rounded-xl"
          />
        </ReactFlow>
      </div>

      {/* Save Template Modal */}
      {isSaveTemplateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-[#B0BA99] bg-[#FFFFFF] p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#B0BA99]/40 pb-2">
              <h3 className="text-sm font-bold text-[#4E220F] flex items-center gap-2">
                <BookmarkPlus className="size-4 text-[#9D6638]" /> Save Pipeline as Template
              </h3>
              <button
                onClick={() => setIsSaveTemplateOpen(false)}
                className="text-[#7C5339] hover:text-[#4E220F] text-lg font-bold"
              >
                ×
              </button>
            </div>
            <p className="text-xs text-[#7C5339]">
              Save this workflow ({nodes.length} connected tools) as a reusable starter template for this workspace.
            </p>
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="e.g. YouTube to English Translated Subtitles"
              className="w-full rounded-xl border border-[#B0BA99] bg-[#F7F1DE]/70 px-3.5 py-2 text-xs text-[#4E220F] placeholder-[#7C5339]/60 focus:border-[#9D6638] focus:outline-none font-medium"
              autoFocus
            />
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setIsSaveTemplateOpen(false)}
                className="rounded-xl px-3.5 py-1.5 text-xs font-semibold text-[#7C5339] hover:bg-[#EDE5CD]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  saveCurrentAsTemplate()
                  setIsSaveTemplateOpen(false)
                }}
                disabled={!templateName.trim() || nodes.length === 0}
                className="rounded-xl bg-[#9D6638] px-4 py-1.5 text-xs font-bold text-[#FDFBF7] hover:bg-[#86542C] disabled:opacity-40 shadow-xs"
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
        dagNodes={nodes.map((n) => ({
          id: n.id,
          tool_id: n.data.toolId,
          params: n.data.params,
          position: n.position,
        }))}
        onClose={() => setIsRunModalOpen(false)}
        onRun={(paramOverrides, cachePolicy) => executePipelineWithParams(paramOverrides, cachePolicy)}
        inputs={runModalInputs}
        toolSteps={nodes.map((n) => n.data.label || n.data.toolId)}
        resolvedFlow={resolvedFlow}
      />
    </div>
  )
}

export default function PipelineCanvas(props: {
  workspaceId: string
  tools?: ToolManifest[]
  onRan: () => void
  onSelectNode?: (node: { id: string; toolId: string; label: string; params: Record<string, unknown>; status?: string; durationSeconds?: number; errorMessage?: string; cached?: boolean } | null) => void
  selectedNodeId?: string | null
  externalAddToolRef?: React.MutableRefObject<((manifest: ToolManifest) => void) | null>
  externalUpdateParamsRef?: React.MutableRefObject<((params: Record<string, unknown>) => void) | null>
  onGraphStats?: (stats: { nodeCount: number; edgeCount: number }) => void
}) {
  return (
    <ReactFlowProvider>
      <PipelineCanvasInner {...props} />
    </ReactFlowProvider>
  )
}
