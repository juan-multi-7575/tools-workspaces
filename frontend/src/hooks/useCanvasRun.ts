import { canStartRun, reconnectRemoteRun, stopRemoteRun, type RemoteRunState } from '../lib/canvasRunRecovery';
import { useEffect, useRef, useState } from 'react';
import { api, ApiError, errorMessage, type ToolManifest } from '../lib/api';
import { buildDAGPayload, graphValidity, interruptNodes } from '../lib/canvasGraph';
import type { CanvasGraph } from './useCanvasGraph';
import { useActivityTracker } from '../components/activity/ActivityContext';
export function useCanvasRun(workspaceId: string, graph: CanvasGraph, tools: ToolManifest[], onRan: () => void, setStatus: (value: {
    ok: boolean;
    msg: string;
}) => void) {
    const { nodes, edges, setRuntimeNodes: setNodes } = graph;
    const [busy, setBusy] = useState(false);
    const [disconnected, setDisconnected] = useState(false);
    const [remoteState, setRemoteState] = useState<RemoteRunState>('checking');
    const generation = useRef(0);
    const runController = useRef<AbortController | null>(null);
    const { setOpen: setActivityOpen, setActiveTab: setActivityTab, setAutoOpened } = useActivityTracker();
    useEffect(() => {
        generation.current++;
        setBusy(false);
        setDisconnected(false);
        setRemoteState('checking');
        const controller = new AbortController();
        const token = generation.current;
        api.pipelineStatus(workspaceId, controller.signal).then(result => {
            if (controller.signal.aborted || token !== generation.current || runController.current)
                return;
            setRemoteState(result.active ? 'active' : 'idle');
            setDisconnected(result.active);
        }).catch(() => { if (!controller.signal.aborted && token === generation.current) {
            setRemoteState('unknown');
            setDisconnected(true);
        } });
        return () => {
            controller.abort();
            generation.current++;
            runController.current?.abort();
            runController.current = null;
        };
    }, [workspaceId, setNodes]);
    const executePipelineWithParams = async (overrideParamsByNode?: Record<string, Record<string, unknown>>, cachePolicy?: 'reuse' | 'recompute') => {
        if (nodes.length === 0 || !canStartRun(busy,remoteState))
            return;
        const token = generation.current;
        const controller = new AbortController();
        runController.current = controller;
        const active = () => token === generation.current && runController.current === controller;
        setBusy(true);
        setRemoteState('active');
        setDisconnected(false);
        // Surface live progress: auto-open the activity drawer on the live tab
        setActivityTab('downloads');
        setAutoOpened(true);
        setActivityOpen(true);
        try {
            const withOverrides = nodes.map(n => ({ ...n, data: { ...n.data, params: { ...n.data.params, ...overrideParamsByNode?.[n.id] } } }));
            const check = graphValidity(withOverrides, edges, tools);
            if (!check.valid)
                throw new Error(check.reason);
            const payload = buildDAGPayload(nodes, edges, overrideParamsByNode);
            const validation = await api.validatePipeline(workspaceId, payload);
            if (!validation.valid)
                throw new Error(validation.error || 'Invalid pipeline');
            if (controller.signal.aborted || !active())
                return;
            const dagNodes = payload.nodes, dagEdges = payload.edges;
            // Reset all nodes on canvas to pending/idle before starting run
            setNodes((nds) => nds.map((n) => ({
                ...n,
                data: {
                    ...n.data,
                    params: { ...n.data.params, ...(overrideParamsByNode?.[n.id] || {}) },
                    status: n.data.branchedOutputs ? 'completed' : 'pending',
                    errorMessage: undefined,
                    durationSeconds: undefined,
                    cached: undefined,
                },
            })));
            setStatus({ ok: true, msg: 'Starting pipeline execution...' });
            let failedNode: {
                id: string;
                error: string;
            } | null = null;
            await api.runPipelineStream(workspaceId, { nodes: dagNodes, edges: dagEdges, error_policy: 'fail_fast', cache_policy: cachePolicy || 'recompute' }, (evt) => {
                if (controller.signal.aborted || !active())
                    return;
                if (evt.type === 'node_started' && evt.node_id) {
                    setNodes((nds) => nds.map((n) => n.id === evt.node_id
                        ? { ...n, data: { ...n.data, status: 'running', errorMessage: undefined } }
                        : n));
                    setStatus({ ok: true, msg: `Running ${evt.tool_name || evt.tool_id}...` });
                }
                else if (evt.type === 'node_completed' && evt.node_id) {
                    const isCached = evt.cached === true;
                    setNodes((nds) => nds.map((n) => n.id === evt.node_id
                        ? {
                            ...n,
                            data: {
                                ...n.data,
                                status: 'completed',
                                durationSeconds: evt.duration,
                                cached: isCached,
                            },
                        }
                        : n));
                }
                else if (evt.type === 'node_failed' && evt.node_id) {
                    const errStr = errorMessage(evt.error || 'Execution failed');
                    failedNode = { id: evt.node_id, error: errStr };
                    setNodes((nds) => nds.map((n) => n.id === evt.node_id
                        ? {
                            ...n,
                            data: {
                                ...n.data,
                                status: 'failed',
                                errorMessage: errStr,
                                durationSeconds: evt.duration,
                            },
                        }
                        : n));
                }
                else if (evt.type === 'node_skipped' && evt.node_id) {
                    setNodes((nds) => nds.map((n) => n.id === evt.node_id
                        ? {
                            ...n,
                            data: {
                                ...n.data,
                                status: 'skipped',
                                errorMessage: evt.reason || 'Skipped due to upstream failure',
                            },
                        }
                        : n));
                }
                else if (evt.type === 'pipeline_finished') {
                    if (evt.status === 'failed' || failedNode) {
                        const err = failedNode ? `Halted on "${failedNode.id}": ${failedNode.error}` : 'Pipeline stopped due to error';
                        setStatus({ ok: false, msg: err });
                    }
                    else {
                        setStatus({ ok: true, msg: 'All pipeline steps finished successfully' });
                    }
                }
                else if (evt.type === 'pipeline_error') {
                    setStatus({ ok: false, msg: errorMessage(evt.error || 'Pipeline execution failed') });
                }
            }, { signal: controller.signal });
            if (!active())
                return;
            setNodes(nds => interruptNodes(nds, 'Pipeline ended before this step completed'));
            setRemoteState('idle');
            setDisconnected(false);
            onRan();
        }
        catch (err: unknown) {
            if (!active())
                return;
            const lost = err instanceof ApiError && ['STREAM_STALLED', 'STREAM_INTERRUPTED'].includes(err.code);
            setDisconnected(lost);
            setRemoteState(lost ? 'unknown' : 'idle');
            const message = lost ? `${errorMessage(err)} Connection interrupted. Check outputs or stop the backend run before retrying.` : controller.signal.aborted ? 'Pipeline interrupted. Ready to run again.' : errorMessage(err);
            setNodes(nds => interruptNodes(nds, message));
            setStatus({ ok: false, msg: message });
        }
        finally {
            if (active()) {
                runController.current = null;
                setBusy(false);
            }
        }
    };
    const reconnect = async () => {
        const token = generation.current;
        const alive = () => token === generation.current && !runController.current;
        if (!alive()) return;
        await reconnectRemoteRun(() => api.pipelineStatus(workspaceId), alive, state => {
            setRemoteState(state);
            setDisconnected(state !== 'idle');
            if (state === 'idle') {
                setStatus({ok:true,msg:'Backend pipeline is no longer running. Ready to run again.'});
                setNodes(nodes=>interruptNodes(nodes,'Backend run has ended'));
                onRan();
            } else if (state === 'active') setStatus({ok:false,msg:'Backend pipeline is still running. Stop is available.'});
            else if (state === 'unknown') setStatus({ok:false,msg:'Backend status could not be confirmed. Reconnect or Stop before starting another run.'});
        });
    };
    const stop = async () => {
        const token = ++generation.current;
        runController.current?.abort();
        runController.current = null;
        setBusy(false);
        setNodes(nodes=>interruptNodes(nodes,'Stop requested; checking backend status'));
        setStatus({ok:false,msg:'Stopping pipeline…'});
        await stopRemoteRun(() => api.stopPipeline(workspaceId), () => api.pipelineStatus(workspaceId), () => token === generation.current && !runController.current, state => {
            setRemoteState(state);
            setDisconnected(state !== 'idle');
            if (state === 'idle') setStatus({ok:true,msg:'Pipeline stopped. Ready to run again.'});
            else if (state === 'active') setStatus({ok:false,msg:'Stop requested. Backend is still finishing cancellation; reconnect to check.'});
            else if (state === 'unknown') setStatus({ok:false,msg:'Connection interrupted; stop could not be confirmed. Reconnect to check backend status.'});
        });
    };
    return {busy,disconnected,remoteState,canRun:canStartRun(busy,remoteState),executePipelineWithParams,stop,reconnect};
}
