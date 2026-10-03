import type { Node, Edge } from '@xyflow/react';
import type { ToolManifest } from './api';
import type { ToolNodeData } from '../components/pipeline/CanvasRenderers';
import { canonicalId } from './toolIds';
export type CanvasNode = Node<ToolNodeData>;
export type GraphSnapshot = {
    nodes: CanvasNode[];
    edges: Edge[];
};
/** Bounded Kahn traversal, plus DFS back-edge paths for precise cycle markings. */
export function computeArrangedPositions(nodes: {
    id: string;
}[], edges: {
    source: string;
    target: string;
    id?: string;
}[]) {
    const ids = new Set(nodes.map(n => n.id));
    const children = new Map(nodes.map(n => [n.id, [] as string[]]));
    const degree = new Map(nodes.map(n => [n.id, 0]));
    for (const e of edges)
        if (ids.has(e.source) && ids.has(e.target)) {
            children.get(e.source)!.push(e.target);
            degree.set(e.target, degree.get(e.target)! + 1);
        }
    const level = new Map<string, number>();
    const queue = nodes.filter(n => degree.get(n.id) === 0).map(n => n.id);
    queue.forEach(id => level.set(id, 0));
    for (let i = 0; i < queue.length; i++)
        for (const child of children.get(queue[i])!) {
            level.set(child, Math.max(level.get(child) || 0, (level.get(queue[i]) || 0) + 1));
            degree.set(child, degree.get(child)! - 1);
            if (degree.get(child) === 0)
                queue.push(child);
        }
    const visiting = new Set<string>(), done = new Set<string>(), path: string[] = [];
    const cycleEdgeIds = new Set<string>();
    let cycle: string[] | null = null;
    const visit = (id: string) => {
        if (done.has(id))
            return;
        visiting.add(id);
        path.push(id);
        for (const child of children.get(id)!) {
            if (visiting.has(child)) {
                const found = [...path.slice(path.indexOf(child)), child];
                cycle ??= found;
                for (let i = 0; i < found.length - 1; i++)
                    for (const e of edges)
                        if (e.source === found[i] && e.target === found[i + 1] && e.id)
                            cycleEdgeIds.add(e.id);
            }
            else
                visit(child);
        }
        path.pop();
        visiting.delete(id);
        done.add(id);
    };
    nodes.forEach(n => visit(n.id));
    const groups = new Map<number, number>();
    const positions = nodes.map(n => { const l = level.get(n.id) || 0, row = groups.get(l) || 0; groups.set(l, row + 1); return { id: n.id, position: { x: 60 + l * 320, y: 60 + row * 180 } }; });
    return { positions, cycle: cycle as string[] | null, cycleEdgeIds: [...cycleEdgeIds] };
}
export function applyArrangedPositions(nodes: CanvasNode[], edges: Edge[]) {
    const result = computeArrangedPositions(nodes, edges);
    if (result.cycle)
        return nodes;
    const positions = new Map(result.positions.map(n => [n.id, n.position]));
    return nodes.map(n => ({ ...n, position: positions.get(n.id)! }));
}
export function graphValidity(nodes: CanvasNode[], edges: Edge[], tools: ToolManifest[]) {
    const layout = computeArrangedPositions(nodes, edges);
    const invalidEdgeIds = [...layout.cycleEdgeIds];
    let reason = nodes.length ? '' : 'Add a node to run';
    if (nodes.length && nodes.every(n => n.data.branchedOutputs))
        reason = 'Add a downstream step to run saved outputs';
    if (layout.cycle)
        reason = `Cycle: ${layout.cycle.join(' → ')}`;
    for (const e of edges) {
        const source = nodes.find(n => n.id === e.source), target = nodes.find(n => n.id === e.target);
        const outputs = e.sourceHandle ? [e.sourceHandle] : source?.data.outputKinds || [];
        const inputs = e.targetHandle ? [e.targetHandle] : target?.data.inputKinds || [];
        if (!source || !target || !outputs.some(o => inputs.some(i => o === i || o === 'any' || i === 'any'))) {
            invalidEdgeIds.push(e.id);
            reason ||= `Incompatible connection: ${source?.data.label || e.source} → ${target?.data.label || e.target}`;
        }
    }
    for (const n of nodes) {
        const manifest = tools.find(t => canonicalId(t.id) === canonicalId(n.data.toolId));
        if (tools.length && !manifest)
            reason ||= `Unknown tool: ${n.data.toolId}`;
        const schema = (manifest?.parameters_schema || {}) as Record<string, {
            type?: string;
            required?: boolean;
            enum?: unknown[];
            minimum?: number;
            maximum?: number;
            default?: unknown;
        }>;
        for (const [key, spec] of Object.entries(schema)) {
            const value = n.data.params[key] ?? spec.default;
            const piped = edges.some(e => e.target === n.id) && ['input_path', 'input_paths', 'file', 'files', 'audio_path', 'video_path'].includes(key);
            if (value === undefined || value === null || value === '') {
                if (spec.required && !piped)
                    reason ||= `${n.data.label}: ${key} is required`;
                continue;
            }
            const expected = spec.type;
            const incorrectType = expected === 'integer' ? typeof value !== 'number' || !Number.isInteger(value) : expected === 'array' ? !Array.isArray(value) : ['string', 'number', 'boolean'].includes(expected || '') && typeof value !== expected;
            if (incorrectType || spec.enum && !spec.enum.includes(value) || typeof value === 'number' && (spec.minimum !== undefined && value < spec.minimum || spec.maximum !== undefined && value > spec.maximum))
                reason ||= `${n.data.label}: invalid ${key}`;
        }
    }
    return { valid: !reason, reason, invalidEdgeIds };
}
export function buildDAGPayload(nodes: CanvasNode[], edges: Edge[], overrides?: Record<string, Record<string, unknown>>) {
    const executable = nodes.filter(n => !n.data.branchedOutputs);
    const ids = new Set(executable.map(n => n.id));
    return { nodes: executable.map(n => ({ id: n.id, tool_id: canonicalId(n.data.toolId), params: { ...n.data.params, ...overrides?.[n.id] }, position: n.position })), edges: edges.filter(e => ids.has(e.source) && ids.has(e.target)).map(e => ({ source_node: e.source, source_port: e.sourceHandle || 'default', target_node: e.target, target_port: e.targetHandle || 'default' })) };
}
export function interruptNodes(nodes: CanvasNode[], message: string): CanvasNode[] {
    return nodes.map(n => n.data.status === 'running' || n.data.status === 'pending' ? { ...n, data: { ...n.data, status: 'interrupted', errorMessage: message } } : n);
}
export function snapshotOf(nodes: CanvasNode[], edges: Edge[]): GraphSnapshot {
    const clean = (items: object[]) => items.map(item => { const { measured: _m, selected: _s, ...rest } = item as Record<string, unknown>; return rest; });
    return JSON.parse(JSON.stringify({ nodes: clean(nodes), edges: clean(edges) }));
}
