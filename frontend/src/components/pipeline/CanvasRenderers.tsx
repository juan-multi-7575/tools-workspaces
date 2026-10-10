import { Handle, Position, BaseEdge, EdgeLabelRenderer, getBezierPath, useReactFlow, type Node, type NodeProps, type EdgeProps, type NodeTypes, type EdgeTypes } from '@xyflow/react'
import { X, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react'
import type { PortKind } from '../../lib/api'
export type ToolNodeStatus = 'idle' | 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'interrupted'

export type ToolNodeData = {
  label: string
  toolId: string
  category?: string
  inputKinds: PortKind[]
  outputKinds: PortKind[]
  params: Record<string, unknown>
  status?: ToolNodeStatus
  errorMessage?: string
  durationSeconds?: number
  branchedOutputs?: string[]
  cached?: boolean
}

export function getPortColor(kind: string): string {
  const k = (kind || '').toLowerCase()
  if (k.includes('audio')) return 'var(--color-brand-caramel)' // caramel
  if (k.includes('video')) return 'var(--color-brand-espresso)' // espresso
  if (k.includes('image')) return 'var(--color-brand-sage)' // sage
  if (k.includes('doc') || k.includes('pdf')) return 'var(--color-brand-caramel-hover)' // brown
  if (k.includes('text') || k.includes('code')) return 'var(--color-brand-caramel-text)' // soft brown
  if (k.includes('json') || k.includes('data')) return 'var(--color-brand-sage)' // sage
  if (k.includes('sec') || k.includes('hash')) return 'var(--color-accent-contrast)' // red
  if (k.includes('net') || k.includes('port')) return 'var(--color-brand-caramel)' // caramel
  return 'var(--color-brand-sage)'
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
  data,
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
          stroke: selected ? 'var(--color-accent-contrast)' : (style.stroke || 'var(--color-brand-caramel)'),
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
          {Boolean(data?.invalid) && <span className="text-xs font-bold text-accent-contrast bg-surface-white rounded px-1">{String(data?.invalidLabel || 'Invalid connection')}</span>}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setEdges((es) => es.filter((edge) => edge.id !== id))
            }}
            className="group flex size-5 items-center justify-center rounded-full bg-surface-white border-2 border-brand-sage text-brand-caramel-text hover:bg-accent-contrast hover:text-surface-white hover:border-accent-contrast shadow-sm transition-all duration-150 active:scale-90"
            title="Disconnect this link (or press Delete)"
          >
            <span className="text-xs font-extrabold leading-none select-none group-hover:scale-110 transition-transform">
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
    let containerStyle = 'w-72 rounded-2xl border p-3.5 text-brand-espresso shadow-md transition-all duration-200 relative bg-surface-white '
    if (status === 'running') {
      containerStyle += 'border-brand-caramel ring-3 ring-brand-caramel/40 shadow-xl animate-pulse '
    } else if (status === 'completed') {
      containerStyle += 'border-emerald-600 ring-2 ring-emerald-500/30 shadow-md '
    } else if (status === 'failed' || status === 'interrupted') {
      containerStyle += 'border-accent-contrast ring-3 ring-accent-contrast/50 shadow-xl bg-red-50/20 '
    } else if (status === 'skipped') {
      containerStyle += 'border-dashed border-brand-sage opacity-50 bg-brand-cream-dark/20 '
    } else if (status === 'pending') {
      containerStyle += 'border-amber-400/80 border-dashed bg-amber-50/20 '
    } else if (selected) {
      containerStyle += 'border-brand-caramel ring-2 ring-brand-caramel/40 shadow-lg '
    } else {
      containerStyle += 'border-brand-sage hover:border-brand-caramel '
    }

    return (
      <div className={`${containerStyle} group`}>
        {/* Remove Node Button — reveal only on hover/selection so it never
            collides with the edge handles users drag to rewire. */}
        <button
          type="button"
          onClick={handleDelete}
          className={`absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full bg-surface-white border border-brand-sage text-brand-caramel-text hover:bg-accent-contrast hover:text-surface-white hover:border-accent-contrast shadow-sm transition-all active:scale-90 ${
            selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
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
            border: '2px solid var(--color-brand-cream)',
            top: `${25 + (i * 50) / Math.max(1, data.inputKinds.length)}%`,
          }}
          title={`Input: ${kind}`}
        />
      ))}

      {/* Top Header & Status Badge */}
      <div className="mb-1.5 flex items-center justify-between gap-1.5 pr-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-mono text-xs font-bold uppercase tracking-wider text-brand-caramel-text bg-brand-cream-dark/80 px-1.5 py-0.5 rounded border border-brand-sage/40 truncate">
            {data.toolId}
          </span>
          <span className="rounded-md bg-brand-sage/30 px-1.5 py-0.5 text-xs font-bold text-brand-espresso border border-brand-sage/60 shrink-0">
            {data.category || 'Tool'}
          </span>
        </div>

        {/* Live Execution Status Pill */}
        {status === 'running' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-300 px-2 py-0.5 text-xs font-extrabold text-amber-800 animate-bounce">
            <span className="size-1.5 rounded-full bg-amber-600 animate-ping" />
            Running
          </span>
        )}
        {status === 'completed' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 border border-emerald-300 px-2 py-0.5 text-xs font-extrabold text-emerald-800">
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
        {(status === 'failed' || status === 'interrupted') && (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 border border-red-300 px-2 py-0.5 text-xs font-extrabold text-accent-contrast">
            <AlertCircle className="size-3 text-accent-contrast" />
            {status === 'interrupted' ? 'Interrupted' : 'Failed'}
          </span>
        )}
        {status === 'skipped' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 border border-neutral-300 px-2 py-0.5 text-xs font-bold text-neutral-500">
            Skipped
          </span>
        )}
        {status === 'pending' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-700">
            Waiting...
          </span>
        )}
      </div>

      <p className="text-xs font-bold text-brand-espresso truncate" title={data.label}>
        {data.label}
      </p>

      {/* Error Message Pill if failed */}
      {(status === 'failed' || status === 'interrupted') && data.errorMessage && (
        <div className="mt-2 rounded-lg bg-accent-contrast/10 border border-accent-contrast/30 p-2 text-xs font-medium text-accent-contrast break-words line-clamp-3 leading-tight">
          ⚠️ {data.errorMessage}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-brand-sage/50 pt-2">
        <span className="text-xs font-bold uppercase tracking-wider text-brand-caramel-text shrink-0">
          In:
        </span>
        {data.inputKinds.map((kind) => (
          <span
            key={`in-${kind}`}
            className="font-mono text-xs font-bold px-1.5 py-0.5 rounded-md border"
            style={{
              color: getPortColor(kind),
              borderColor: getPortColor(kind),
              background: `${getPortColor(kind)}1A`,
            }}
            title={`Input: ${kind}`}
          >
            {kind}
          </span>
        ))}
        <span className="text-xs font-bold uppercase tracking-wider text-brand-caramel-text shrink-0 ml-1">
          Out:
        </span>
        {data.outputKinds.map((kind) => (
          <span
            key={`out-${kind}`}
            className="font-mono text-xs font-bold px-1.5 py-0.5 rounded-md border"
            style={{
              color: getPortColor(kind),
              borderColor: getPortColor(kind),
              background: `${getPortColor(kind)}1A`,
            }}
            title={`Output: ${kind}`}
          >
            {kind}
          </span>
        ))}
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
            border: '2px solid var(--color-brand-cream)',
            top: `${25 + (i * 50) / Math.max(1, data.outputKinds.length)}%`,
          }}
          title={`Output: ${kind}`}
        />
      ))}
    </div>
  )
}

export const nodeTypes: NodeTypes = {
  toolNode: ToolNode,
}

export const edgeTypes: EdgeTypes = {
  deletableEdge: DeletableEdge,
}

export const defaultEdgeOptions = {
  type: 'deletableEdge',
  animated: true,
  style: { stroke: 'var(--color-brand-caramel)', strokeWidth: 2.5 },
}

