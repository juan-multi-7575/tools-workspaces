import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { api, type PortKind, type ToolManifest } from '../../lib/api'
import { CheckCircle2, Play, Plus, XCircle, Trash2, Settings2, BookmarkPlus } from 'lucide-react'

type ToolNodeData = {
  label: string
  toolId: string
  inputKinds: PortKind[]
  outputKinds: PortKind[]
  params: Record<string, unknown>
}

const PORT_COLOR: Record<PortKind, string> = {
  any: '#a78bfa',
  audio: '#34d399',
  video: '#60a5fa',
  text: '#f472b6',
  folder: '#fbbf24',
}

function toolNodeColor(id: string): string {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360
  return `hsl(${h} 70% 55%)`
}

function ToolNode({ data, selected }: NodeProps<Node<ToolNodeData>>) {
  return (
    <div
      className={
        'w-60 rounded-xl border bg-garage-900 p-4 text-white shadow-2xl backdrop-blur-md ' +
        (selected ? 'border-port-in ring-2 ring-port-in/40' : 'border-garage-800')
      }
    >
      {data.inputKinds.map((kind, i) => (
        <Handle
          key={`in-${kind}`}
          type="target"
          position={Position.Left}
          id={kind}
          style={{ background: PORT_COLOR[kind], top: `${22 + (i * 56) / Math.max(1, data.inputKinds.length * 2)}%` }}
        />
      ))}
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: toolNodeColor(data.toolId) }}>
          {data.toolId}
        </span>
        <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
      </div>
      <h3 className="text-sm font-bold text-slate-100">{data.label}</h3>
      <div className="mt-3 flex justify-between border-t border-garage-800 pt-2 text-[11px] text-slate-400">
        <span className="capitalize">in: {data.inputKinds.join(', ')}</span>
        <span className="capitalize">out: {data.outputKinds.join(', ')}</span>
      </div>
      {data.outputKinds.map((kind, i) => (
        <Handle
          key={`out-${kind}`}
          type="source"
          position={Position.Right}
          id={kind}
          style={{ background: PORT_COLOR[kind], top: `${22 + (i * 56) / Math.max(1, data.outputKinds.length * 2)}%` }}
        />
      ))}
    </div>
  )
}

const nodeTypes: NodeTypes = { toolNode: ToolNode }

interface PipelineCanvasProps {
  workspaceId: string
  tools: ToolManifest[]
  onRan: () => void
}

export default function PipelineCanvas({ workspaceId, tools, onRan }: PipelineCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [selected, setSelected] = useState<Node | null>(null)
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null)
  const [templates, setTemplates] = useState<{ name: string; chain: string[] }[]>([])

  useEffect(() => {
    api.listTemplates(workspaceId).then(({ templates }) => setTemplates(templates))
  }, [workspaceId])

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: '#34d399' } }, eds)),
    [setEdges],
  )

  const chain = useMemo(
    () =>
      [...nodes]
        .sort((a, b) => a.position.x - b.position.x)
        .map((n) => (n.data as ToolNodeData).toolId),
    [nodes],
  )

  const addTool = (manifest: ToolManifest) => {
    const id = `${manifest.id}-${nodes.length + 1}`
    const node: Node = {
      id,
      type: 'toolNode',
      position: { x: 60 + (nodes.length % 4) * 240, y: 60 + Math.floor(nodes.length / 4) * 150 },
      data: { label: manifest.name, toolId: manifest.id, inputKinds: manifest.input_kinds, outputKinds: manifest.output_kinds, params: {} } as ToolNodeData,
    }
    setNodes((nds) => [...nds, node])
    setStatus(null)
  }

  const validate = async () => {
    if (chain.length === 0) return
    const res = await api.validatePipeline(workspaceId, chain)
    setStatus({ ok: res.valid, msg: res.valid ? 'Chain is valid' : res.error ?? 'Invalid chain' })
  }

  const run = async () => {
    if (chain.length === 0) return
    const steps = [...nodes]
      .sort((a, b) => a.position.x - b.position.x)
      .map((n) => ({ tool_id: (n.data as ToolNodeData).toolId, params: (n.data as ToolNodeData).params }))
    await api.runPipeline(workspaceId, steps)
    setStatus({ ok: true, msg: 'Pipeline run queued' })
    onRan()
  }

  const saveTemplate = async () => {
    if (chain.length === 0) return
    const name = window.prompt('Template name')?.trim()
    if (!name) return
    await api.saveTemplate(workspaceId, name, chain)
    const { templates: tpls } = await api.listTemplates(workspaceId)
    setTemplates(tpls)
    setStatus({ ok: true, msg: `Saved template "${name}"` })
  }

  const loadTemplate = (name: string) => {
    const tpl = templates.find((t) => t.name === name)
    if (!tpl) return
    const rebuilt = tpl.chain
      .map((tid, i) => {
        const m = tools.find((t) => t.id === tid)
        if (!m) return null
        return {
          id: `${tid}-${i + 1}`,
          type: 'toolNode',
          position: { x: 60 + i * 240, y: 80 },
          data: {
            label: m.name,
            toolId: m.id,
            inputKinds: m.input_kinds,
            outputKinds: m.output_kinds,
            params: {},
          } as ToolNodeData,
        } as Node
      })
      .filter((n): n is Node => n !== null)
    setNodes(rebuilt)
    setEdges([])
    setSelected(null)
    setStatus(null)
  }

  const updateSelectedParam = (key: string, value: unknown) => {
    if (!selected) return
    setNodes((nds) =>
      nds.map((n) =>
        n.id === selected.id
          ? { ...n, data: { ...n.data, params: { ...(n.data as ToolNodeData).params, [key]: value } } as ToolNodeData }
          : n,
      ),
    )
    setSelected((s) => (s ? { ...s, data: { ...s.data, params: { ...(s.data as ToolNodeData).params, [key]: value } } as ToolNodeData } : s))
  }

  const compatibleTools = useMemo(() => {
    if (!selected) return tools
    const outs = (selected.data as ToolNodeData).outputKinds
    return tools.filter(
      (t) =>
        t.input_kinds.some((ik) => outs.includes(ik) || ik === 'any' || outs.includes('any')) &&
        t.id !== (selected.data as ToolNodeData).toolId,
    )
  }, [selected, tools])

  return (
    <div className="grid grid-cols-[230px_1fr] gap-4">
      <aside className="space-y-2">
        <h3 className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
          {selected ? 'Compatible next tools' : 'Tool palette'}
        </h3>
        {compatibleTools.map((t) => (
          <button
            key={t.id}
            onClick={() => addTool(t)}
            className="flex w-full items-center justify-between rounded-lg border border-garage-800 bg-garage-900/60 px-3 py-2 text-left text-sm text-slate-200 transition-colors hover:border-port-in/60 hover:bg-garage-800"
          >
            <span>{t.name}</span>
            <Plus className="h-4 w-4 text-slate-500" />
          </button>
        ))}
        {selected && (
          <button
            onClick={() => setSelected(null)}
            className="w-full rounded-lg border border-garage-800 px-3 py-1.5 text-xs text-slate-400 transition-colors hover:text-slate-200"
          >
            Show all tools
          </button>
        )}
      </aside>

      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            onClick={validate}
            disabled={chain.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-garage-700 bg-garage-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:bg-garage-800 disabled:opacity-40"
          >
            <CheckCircle2 className="h-4 w-4" /> Validate
          </button>
          <button
            onClick={run}
            disabled={chain.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition-colors hover:bg-cyan-400 disabled:opacity-40"
          >
            <Play className="h-4 w-4" /> Run pipeline
          </button>
          {selected && (
            <button
              onClick={() => {
                setNodes((nds) => nds.filter((n) => n.id !== selected.id))
                setSelected(null)
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-garage-800 px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:bg-garage-800"
            >
              <Trash2 className="h-3.5 w-3.5" /> Remove node
            </button>
          )}
          <button
            onClick={saveTemplate}
            disabled={chain.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-garage-800 bg-garage-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:bg-garage-800 disabled:opacity-40"
          >
            <BookmarkPlus className="h-4 w-4" /> Save template
          </button>
          {templates.length > 0 && (
            <select
              onChange={(e) => {
                if (e.target.value) loadTemplate(e.target.value)
                e.currentTarget.value = ''
              }}
              defaultValue=""
              className="rounded-lg border border-garage-800 bg-garage-900 px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-port-in"
            >
              <option value="" disabled>
                Load template…
              </option>
              {templates.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
          {status && (
            <span className={'ml-1 inline-flex items-center gap-1 text-xs ' + (status.ok ? 'text-emerald-400' : 'text-red-400')}>
              {status.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              {status.msg}
            </span>
          )}
        </div>

        <div className="h-[520px] overflow-hidden rounded-2xl border border-garage-800 bg-garage-950">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            onNodeClick={(_, n) => setSelected(n)}
            onPaneClick={() => setSelected(null)}
            fitView
          >
            <Background color="#1e293b" gap={20} size={1} />
            <Controls className="!bg-garage-900 !border-garage-800" />
            <MiniMap nodeColor="#38bdf8" maskColor="rgba(15,23,42,0.8)" className="!bg-garage-900 !border-garage-800" />
          </ReactFlow>
        </div>

        {selected && (
          <div className="mt-3 rounded-xl border border-garage-800 bg-garage-900/40 p-4">
            <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <Settings2 className="h-3.5 w-3.5" /> {(selected.data as ToolNodeData).label} parameters
            </h4>
            <ParamForm
              schema={tools.find((t) => t.id === (selected.data as ToolNodeData).toolId)?.parameters_schema ?? {}}
              params={(selected.data as ToolNodeData).params}
              onChange={updateSelectedParam}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function ParamForm({
  schema,
  params,
  onChange,
}: {
  schema: Record<string, { type: string; enum?: (string | number)[] }>
  params: Record<string, unknown>
  onChange: (k: string, v: unknown) => void
}) {
  const entries = Object.entries(schema)
  if (entries.length === 0) return <p className="text-xs text-slate-500">No parameters.</p>
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {entries.map(([key, def]) => (
        <label key={key} className="text-xs text-slate-300">
          <span className="mb-1 block font-medium text-slate-400">{key}</span>
          {def.enum ? (
            <select
              value={String(params[key] ?? '')}
              onChange={(e) => onChange(key, e.target.value)}
              className="w-full rounded-lg border border-garage-800 bg-garage-950 px-3 py-2 text-slate-100 outline-none focus:border-port-in"
            >
              <option value="">—</option>
              {def.enum.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ) : def.type === 'integer' || def.type === 'number' ? (
            <input
              type="number"
              value={String(params[key] ?? '')}
              onChange={(e) => onChange(key, e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full rounded-lg border border-garage-800 bg-garage-950 px-3 py-2 text-slate-100 outline-none focus:border-port-in"
            />
          ) : def.type === 'boolean' ? (
            <input
              type="checkbox"
              checked={Boolean(params[key])}
              onChange={(e) => onChange(key, e.target.checked)}
              className="h-4 w-4 accent-cyan-500"
            />
          ) : (
            <input
              type="text"
              value={String(params[key] ?? '')}
              onChange={(e) => onChange(key, e.target.value)}
              className="w-full rounded-lg border border-garage-800 bg-garage-950 px-3 py-2 text-slate-100 outline-none focus:border-port-in"
            />
          )}
        </label>
      ))}
    </div>
  )
}
