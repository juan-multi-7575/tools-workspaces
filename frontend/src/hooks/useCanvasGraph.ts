import { useCallback, useMemo, useReducer } from 'react';
import { applyNodeChanges, applyEdgeChanges, type Edge, type NodeChange, type EdgeChange } from '@xyflow/react';
import type { ToolManifest } from '../lib/api';
import { canonicalId } from '../lib/toolIds';
import { snapshotOf, type CanvasNode, type GraphSnapshot } from '../lib/canvasGraph';
type State = GraphSnapshot & {
    past: GraphSnapshot[];
    future: GraphSnapshot[];
    selectedNodeId: string | null;
    selectedEdgeId: string | null;
    dragStart?: GraphSnapshot | null;
};
type Action = {
    type: 'nodes';
    value: CanvasNode[] | ((nodes: CanvasNode[]) => CanvasNode[]);
    history?: boolean;
} | {
    type: 'edges';
    value: Edge[] | ((edges: Edge[]) => Edge[]);
} | {
    type: 'nodeChanges';
    changes: NodeChange<CanvasNode>[];
} | {
    type: 'edgeChanges';
    changes: EdgeChange[];
} | {
    type: 'replace' | 'load';
    snapshot: GraphSnapshot;
} | {
    type: 'undo' | 'redo';
} | {
    type: 'select';
    node?: string | null;
    edge?: string | null;
};
const initial: State = { nodes: [], edges: [], past: [], future: [], selectedNodeId: null, selectedEdgeId: null, dragStart: null };
/** History records editing intent, not execution observations or ReactFlow measurements. */
function editingSnapshot(nodes: CanvasNode[], edges: Edge[]): GraphSnapshot {
    const snapshot = snapshotOf(nodes, edges);
    return { ...snapshot, nodes: snapshot.nodes.map(node => {
            const { status: _status, errorMessage: _error, durationSeconds: _duration, cached: _cached, ...data } = node.data;
            const { dragging: _dragging, width: _width, height: _height, ...rest } = node;
            return { ...rest, data };
        }) };
}
function edited(state: State, next: State, before?: GraphSnapshot, record = true): State {
    const previous = before || editingSnapshot(state.nodes, state.edges);
    const changed = JSON.stringify(previous) !== JSON.stringify(editingSnapshot(next.nodes, next.edges));
    return { ...next, past: changed && record ? [...state.past.slice(-49), previous] : state.past, future: changed && record ? [] : state.future, selectedNodeId: next.nodes.some(n => n.id === next.selectedNodeId) ? next.selectedNodeId : null, selectedEdgeId: next.edges.some(e => e.id === next.selectedEdgeId) ? next.selectedEdgeId : null };
}
export function canvasGraphReducer(state: State, action: Action): State {
    if (action.type === 'load')
        return { ...initial, ...action.snapshot };
    if (action.type === 'select')
        return { ...state, selectedNodeId: action.node ?? null, selectedEdgeId: action.edge ?? null };
    if (action.type === 'undo' || action.type === 'redo') {
        const from = action.type === 'undo' ? state.past : state.future;
        if (!from.length)
            return state;
        const current = editingSnapshot(state.nodes, state.edges), snap = from.at(-1)!;
        const nodes = snap.nodes.map(node => {
            const live = state.nodes.find(n => n.id === node.id)?.data;
            return { ...node, data: { ...node.data, status: live?.status, errorMessage: live?.errorMessage, durationSeconds: live?.durationSeconds, cached: live?.cached } };
        });
        return { ...state, nodes, edges: snap.edges, selectedNodeId: null, selectedEdgeId: null, dragStart: null, past: action.type === 'undo' ? state.past.slice(0, -1) : [...state.past, current], future: action.type === 'redo' ? state.future.slice(0, -1) : [...state.future, current] };
    }
    if (action.type === 'replace')
        return edited(state, { ...state, ...action.snapshot, dragStart: null, selectedNodeId: null, selectedEdgeId: null });
    if (action.type === 'nodeChanges') {
        let selectedNodeId = state.selectedNodeId, selectedEdgeId = state.selectedEdgeId;
        for (const change of action.changes)
            if (change.type === 'select') {
                if (change.selected) {
                    selectedNodeId = change.id;
                    selectedEdgeId = null;
                }
                else if (selectedNodeId === change.id)
                    selectedNodeId = null;
            }
        const edits = action.changes.filter(change => change.type !== 'select');
        const nodes = applyNodeChanges(edits, state.nodes);
        const ids = new Set(nodes.map(n => n.id));
        const edges = state.edges.filter(e => ids.has(e.source) && ids.has(e.target));
        const moving = edits.some(change => change.type === 'position' && change.dragging === true);
        const finished = edits.some(change => change.type === 'position' && change.dragging === false);
        const before = state.dragStart || editingSnapshot(state.nodes, state.edges);
        const next = { ...state, nodes, edges, selectedNodeId, selectedEdgeId, dragStart: moving ? before : finished ? null : state.dragStart };
        const shouldRecord = finished || edits.some(change => change.type === 'remove' || change.type === 'add' || change.type === 'replace' || change.type === 'position' && change.dragging === undefined);
        return edited(state, next, finished ? before : undefined, shouldRecord);
    }
    if (action.type === 'edgeChanges') {
        let selectedNodeId = state.selectedNodeId, selectedEdgeId = state.selectedEdgeId;
        for (const change of action.changes)
            if (change.type === 'select') {
                if (change.selected) {
                    selectedEdgeId = change.id;
                    selectedNodeId = null;
                }
                else if (selectedEdgeId === change.id)
                    selectedEdgeId = null;
            }
        return edited(state, { ...state, edges: applyEdgeChanges(action.changes.filter(change => change.type !== 'select'), state.edges), selectedNodeId, selectedEdgeId });
    }
    if (action.type === 'nodes')
        return edited(state, { ...state, nodes: typeof action.value === 'function' ? action.value(state.nodes) : action.value }, undefined, action.history !== false);
    if (action.type === 'edges')
        return edited(state, { ...state, edges: typeof action.value === 'function' ? action.value(state.edges) : action.value });
    return state;
}
export function useCanvasGraph() {
    const [state, dispatch] = useReducer(canvasGraphReducer, initial);
    const setNodes = useCallback((value: CanvasNode[] | ((nodes: CanvasNode[]) => CanvasNode[])) => dispatch({ type: 'nodes', value }), []);
    const setRuntimeNodes = useCallback((value: CanvasNode[] | ((nodes: CanvasNode[]) => CanvasNode[])) => dispatch({ type: 'nodes', value, history: false }), []);
    const setEdges = useCallback((value: Edge[] | ((edges: Edge[]) => Edge[])) => dispatch({ type: 'edges', value }), []);
    const load = useCallback((snapshot: GraphSnapshot) => dispatch({ type: 'load', snapshot }), []);
    const replace = useCallback((snapshot: GraphSnapshot) => dispatch({ type: 'replace', snapshot }), []);
    const onNodesChange = useCallback((changes: NodeChange<CanvasNode>[]) => dispatch({ type: 'nodeChanges', changes }), []);
    const onEdgesChange = useCallback((changes: EdgeChange[]) => dispatch({ type: 'edgeChanges', changes }), []);
    const select = useCallback((node: string | null = null, edge: string | null = null) => dispatch({ type: 'select', node, edge }), []);
    const addTool = useCallback((tool: ToolManifest) => setNodes(nodes => [...nodes, { id: `${canonicalId(tool.id)}-${crypto.randomUUID()}`, type: 'toolNode', ariaLabel: tool.name, position: { x: 60 + (nodes.length % 3) * 320, y: 60 + Math.floor(nodes.length / 3) * 180 }, data: { label: tool.name, toolId: canonicalId(tool.id), category: tool.category, inputKinds: tool.input_kinds, outputKinds: tool.output_kinds, params: {} } }]), [setNodes]);
    const updateParams = useCallback((params: Record<string, unknown>) => setNodes(nodes => nodes.map(n => n.id === state.selectedNodeId ? { ...n, data: { ...n.data, params } } : n)), [state.selectedNodeId, setNodes]);
    const selected = useMemo(() => state.nodes.find(n => n.id === state.selectedNodeId), [state.nodes, state.selectedNodeId]);
    return { ...state, setNodes, setRuntimeNodes, setEdges, onNodesChange, onEdgesChange, load, replace, select, addTool, updateParams, selected, undo: () => dispatch({ type: 'undo' }), redo: () => dispatch({ type: 'redo' }), histDepths: { past: state.past.length, future: state.future.length } };
}
export type CanvasGraph = ReturnType<typeof useCanvasGraph>;
