import test from 'node:test';
import assert from 'node:assert/strict';
import { computeArrangedPositions, graphValidity, interruptNodes } from '../lib/canvasGraph';
import type { CanvasNode } from '../lib/canvasGraph';
const node = (id: string, status: any = 'idle'): CanvasNode => ({ id, position: { x: 0, y: 0 }, data: { toolId: 'tool', label: id, params: {}, inputKinds: ['audio'], outputKinds: ['audio'], status } });
for (const [name, ids, links] of [
    ['two node', ['a', 'b'], [['a', 'b'], ['b', 'a']]],
    ['self loop', ['a'], [['a', 'a']]],
    ['reachable', ['r', 'a', 'b'], [['r', 'a'], ['a', 'b'], ['b', 'a']]],
] as const)
    test(`layout detects ${name} cycle`, () => {
        const result = computeArrangedPositions(ids.map(id => ({ id })), links.map(([source, target], i) => ({ source, target, id: String(i) })));
        assert.ok(result.cycle);
        assert.equal(result.cycle![0], result.cycle!.at(-1));
        assert.ok(result.cycleEdgeIds.length);
    });
test('diamond DAG levels wait for every parent', () => {
    const result = computeArrangedPositions(['r', 'a', 'b', 'c'].map(id => ({ id })), [{ source: 'r', target: 'a' }, { source: 'r', target: 'b' }, { source: 'a', target: 'c' }, { source: 'b', target: 'c' }]);
    assert.equal(result.cycle, null);
    assert.equal(result.positions.find(n => n.id === 'c')!.position.x, 700);
});
test('incompatible connections block Run and identify edge', () => {
    const a = node('a'), b = node('b');
    b.data.inputKinds = ['video'];
    const result = graphValidity([a, b], [{ id: 'e', source: 'a', target: 'b' }], []);
    assert.equal(result.valid, false);
    assert.deepEqual(result.invalidEdgeIds, ['e']);
});
test('disconnect only interrupts pending/running nodes', () => {
    const nodes = interruptNodes([node('a', 'running'), node('b', 'pending'), node('c', 'completed'), node('d', 'failed')], 'Connection lost');
    assert.deepEqual(nodes.map(n => n.data.status), ['interrupted', 'interrupted', 'completed', 'failed']);
});
import { branchGraph } from '../lib/canvasBranch';
import { buildDAGPayload } from '../lib/canvasGraph';
import { canvasGraphReducer } from '../hooks/useCanvasGraph';
test('branch uses saved outputs only in downstream input and restores source params', () => {
    const download = node('download');
    download.data.toolId = 'downloader';
    download.data.outputKinds = ['audio'];
    const audio = node('audio');
    audio.data.toolId = 'audio_processor';
    const result = branchGraph({ nodes: [download, audio], edges: [{ id: 'e', source: 'download', target: 'audio' }] }, { run_id: 'r1', tool_id: 'media.download.yt-dlp', params: { url: 'https://example.com/v' }, artifacts: [{ name: 'v.wav', path: '/runs/r1/v.wav', size: 10 }] }, [{ id: 'audio_processor', name: 'Audio', category: 'Media', input_kinds: ['audio'], output_kinds: ['audio'], parameters_schema: {} }] as any);
    assert.equal(result.nodes[0].data.params.url, 'https://example.com/v');
    assert.equal(result.nodes[1].data.params.input_path, '/runs/r1/v.wav');
    const payload = buildDAGPayload(result.nodes, result.edges);
    assert.deepEqual(payload.nodes.map(n => n.id), ['audio']);
    assert.deepEqual(payload.edges, []);
});
test('selection survives parameter changes, clears on undo/delete, with no mirrored object', () => {
    let state: any = { nodes: [node('a')], edges: [], past: [], future: [], selectedNodeId: 'a', selectedEdgeId: null };
    state = canvasGraphReducer(state, { type: 'nodes', value: nodes => nodes.map(n => ({ ...n, data: { ...n.data, params: { format: 'wav' } } })) });
    assert.equal(state.selectedNodeId, 'a');
    assert.equal(state.nodes[0].data.params.format, 'wav');
    state = canvasGraphReducer(state, { type: 'undo' });
    assert.equal(state.selectedNodeId, null);
    assert.deepEqual(state.nodes[0].data.params, {});
});
test('invalid parameter values gate the graph and run overrides', () => {
    const a = node('a');
    a.data.params = { format: 'invalid' };
    const tools = [{ id: 'tool', name: 'Tool', category: 'Media', input_kinds: ['audio'], output_kinds: ['audio'], parameters_schema: { format: { type: 'string', enum: ['wav', 'mp3'] } } }] as any;
    assert.equal(graphValidity([a], [], tools).valid, false);
    assert.match(graphValidity([a], [], tools).reason, /format/);
});
import { resolvePipelineFlow } from '../lib/pipelineInputResolver';
test('canonical translator starter exposes translation configuration', () => {
    const translator = node('translate');
    translator.data.toolId = 'subtitle.translate.srt';
    assert.equal(resolvePipelineFlow([translator], [], []).hasTranslationNode, true);
});
test('runtime execution status changes do not create undo history', () => {
    let state: any = { nodes: [node('a')], edges: [], past: [], future: [], selectedNodeId: null, selectedEdgeId: null };
    state = canvasGraphReducer(state, { type: 'nodes', value: nodes => nodes.map(n => ({ ...n, data: { ...n.data, status: 'completed' } })), history: false } as any);
    assert.equal(state.past.length, 0);
});
test('keyboard selection changes reach the one graph selection owner', () => {
    let state: any = { nodes: [node('a')], edges: [], past: [], future: [], selectedNodeId: null, selectedEdgeId: null };
    state = canvasGraphReducer(state, { type: 'nodeChanges', changes: [{ id: 'a', type: 'select', selected: true }] } as any);
    assert.equal(state.selectedNodeId, 'a');
});
test('atomic graph clear undoes both nodes and edges in one step', () => {
    let state: any = { nodes: [node('a'), node('b')], edges: [{ id: 'e', source: 'a', target: 'b' }], past: [], future: [], selectedNodeId: null, selectedEdgeId: null };
    state = canvasGraphReducer(state, { type: 'replace', snapshot: { nodes: [], edges: [] } } as any);
    state = canvasGraphReducer(state, { type: 'undo' });
    assert.equal(state.nodes.length, 2);
    assert.equal(state.edges.length, 1);
});
test('drag frames coalesce into one position edit and undo restores the start', () => {
    let state: any = { nodes: [node('a')], edges: [], past: [], future: [], selectedNodeId: null, selectedEdgeId: null };
    for (let x = 1; x <= 20; x++)
        state = canvasGraphReducer(state, { type: 'nodeChanges', changes: [{ id: 'a', type: 'position', position: { x, y: 0 }, dragging: true }] });
    assert.equal(state.past.length, 0);
    state = canvasGraphReducer(state, { type: 'nodeChanges', changes: [{ id: 'a', type: 'position', position: { x: 25, y: 0 }, dragging: false }] });
    assert.equal(state.past.length, 1);
    state = canvasGraphReducer(state, { type: 'undo' });
    assert.equal(state.nodes[0].position.x, 0);
});
test('undoing parameter edit preserves the completed runtime status', () => {
    let state: any = { nodes: [node('a')], edges: [], past: [], future: [], selectedNodeId: null, selectedEdgeId: null };
    state = canvasGraphReducer(state, { type: 'nodes', value: nodes => nodes.map(n => ({ ...n, data: { ...n.data, params: { format: 'wav' } } })) });
    state = canvasGraphReducer(state, { type: 'nodes', value: nodes => nodes.map(n => ({ ...n, data: { ...n.data, status: 'completed' } })), history: false });
    state = canvasGraphReducer(state, { type: 'undo' });
    assert.equal(state.nodes[0].data.status, 'completed');
    assert.deepEqual(state.nodes[0].data.params, {});
});
test('keyboard edge select and Escape update canonical owner without graph history', () => {
    let state: any = { nodes: [node('a'), node('b')], edges: [{ id: 'e', source: 'a', target: 'b' }], past: [], future: [], selectedNodeId: 'a', selectedEdgeId: null };
    state = canvasGraphReducer(state, { type: 'edgeChanges', changes: [{ id: 'e', type: 'select', selected: true }] });
    assert.equal(state.selectedEdgeId, 'e');
    assert.equal(state.selectedNodeId, null);
    assert.equal(state.past.length, 0);
    state = canvasGraphReducer(state, { type: 'edgeChanges', changes: [{ id: 'e', type: 'select', selected: false }] });
    assert.equal(state.selectedEdgeId, null);
});
