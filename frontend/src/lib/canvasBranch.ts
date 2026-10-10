import type { ToolManifest } from './api';
import type { GraphSnapshot } from './canvasGraph';
import { canonicalId } from './toolIds';
export type BranchRun = {
    run_id: string;
    tool_id?: string;
    params: Record<string, unknown>;
    artifacts: {
        name: string;
        path: string;
        size: number;
    }[];
};
function artifactKind(path: string) {
    const ext = path.split('.').at(-1)?.toLowerCase();
    if (['mp4', 'mkv', 'webm', 'mov', 'avi'].includes(ext || ''))
        return 'video';
    if (['mp3', 'wav', 'm4a', 'flac', 'ogg', 'opus', 'aac'].includes(ext || ''))
        return 'audio';
    if (['srt', 'vtt', 'txt'].includes(ext || ''))
        return 'text';
    if (['jpg', 'jpeg', 'png', 'webp'].includes(ext || ''))
        return 'image';
    if (ext === 'json')
        return 'json';
    return 'file';
}
/** Backend branches one tool run: retain its provenance, run only descendants. */
export function branchGraph(graph: GraphSnapshot, run: BranchRun, tools: ToolManifest[], selectedId?: string | null) {
    const matches = graph.nodes.filter(n => canonicalId(n.data.toolId) === canonicalId(run.tool_id || ''));
    const match = matches.length === 1 ? matches[0] : matches.find(n => n.id === selectedId);
    if (!match)
        throw new Error(matches.length ? 'Select the matching step before branching this run.' : 'No matching tool step exists on this canvas. Add the tool before branching.');
    const outgoing = graph.edges.filter(e => e.source === match.id);
    if (!outgoing.length)
        throw new Error('This step has no downstream tools. Add a downstream step to reuse its outputs.');
    const allowed = new Set([match.id]);
    let changed = true;
    while (changed) {
        changed = false;
        for (const e of graph.edges)
            if (allowed.has(e.source) && !allowed.has(e.target)) {
                allowed.add(e.target);
                changed = true;
            }
    }
    // Never silently drop a second parent: the backend only supplies one tool run.
    if (graph.edges.some(e => allowed.has(e.target) && e.target !== match.id && !allowed.has(e.source)))
        throw new Error('A downstream step also needs another upstream output. Branching this graph requires those inputs first.');
    const inputs = new Map<string, {
        key: string;
        value: unknown;
    }>();
    for (const edge of outgoing) {
        const target = graph.nodes.find(n => n.id === edge.target)!;
        const manifest = tools.find(t => canonicalId(t.id) === canonicalId(target.data.toolId));
        if (!manifest || canonicalId(target.data.toolId) === 'media.download.yt-dlp')
            throw new Error('The downstream tool cannot consume saved file outputs.');
        const schema = manifest.parameters_schema as Record<string, {
            type?: string;
            widget?: string;
        }>;
        const key = Object.keys(schema).find(k => ['input_path', 'input_paths', 'audio_path', 'video_path', 'file', 'files', 'input_pdf'].includes(k) || schema[k].widget === 'artifact_picker') || 'input_path';
        const kinds = edge.targetHandle ? [edge.targetHandle] : target.data.inputKinds;
        const artifacts = run.artifacts.filter(a => kinds.includes('any') || kinds.includes('file') || kinds.some(k => artifactKind(a.path) === k || (k === 'subtitle' && artifactKind(a.path) === 'text')));
        if (!artifacts.length)
            throw new Error(`No compatible output artifact for ${target.data.label}.`);
        inputs.set(target.id, { key, value: schema[key]?.type === 'array' || key.endsWith('paths') || key === 'files' ? artifacts.map(a => a.path) : artifacts[0].path });
    }
    const nodes = graph.nodes.filter(n => allowed.has(n.id)).map(n => n.id === match.id ? { ...n, data: { ...n.data, params: { ...run.params }, status: 'completed' as const, cached: true, branchedOutputs: run.artifacts.map(a => a.path) } } : inputs.has(n.id) ? { ...n, data: { ...n.data, params: { ...n.data.params, [inputs.get(n.id)!.key]: inputs.get(n.id)!.value } } } : n);
    return { nodes, edges: graph.edges.filter(e => allowed.has(e.source) && allowed.has(e.target)), steps: inputs.size, artifacts: run.artifacts.length };
}
