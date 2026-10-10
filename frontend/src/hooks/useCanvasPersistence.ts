import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { applyArrangedPositions, snapshotOf, interruptNodes, type CanvasNode } from '../lib/canvasGraph';
import { CanvasSaveSession } from '../lib/canvasPersistence';
import type { CanvasGraph } from './useCanvasGraph';
/** Graph state and persistence live above pane error boundaries. */
export function useCanvasPersistence(workspaceId: string, graph: CanvasGraph) {
    const { nodes, edges, load } = graph;
    const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
    const [loadedWorkspace, setLoadedWorkspace] = useState<string | null>(null);
    const [loadError, setLoadError] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const session = useRef<CanvasSaveSession | null>(null);
    const dirty = useRef(false);
    const generation = useRef(0);
    const retryLoad = useCallback(() => setAttempt(n => n + 1), []);
    useEffect(() => {
        const controller = new AbortController(), token = ++generation.current;
        const scopedSession = new CanvasSaveSession(snapshot => api.saveWorkspaceCanvas(workspaceId, snapshot), status => {
            if (token === generation.current)
                setSaveStatus(status);
        });
        session.current = scopedSession;
        setLoadedWorkspace(null);
        setLoadError(false);
        dirty.current = false;
        load({ nodes: [], edges: [] });
        api.getWorkspaceCanvas(workspaceId, controller.signal).then(canvas => {
            if (controller.signal.aborted || token !== generation.current)
                return;
            const nodes = (canvas.nodes || []).map(n => ({ ...n, type: n.type || 'toolNode', ariaLabel: n.ariaLabel ?? n.data?.label, position: n.position || { x: 60, y: 60 }, data: { ...n.data, params: n.data.params || {}, inputKinds: n.data.inputKinds || ['any'], outputKinds: n.data.outputKinds || ['any'] } })) as CanvasNode[];
            const edges = (canvas.edges || []).map(e => ({ ...e, type: e.type || 'deletableEdge' }));
            load({ nodes: applyArrangedPositions(interruptNodes(nodes, 'Execution monitor disconnected. Ready to run again.'), edges), edges });
            setLoadedWorkspace(workspaceId);
            setSaveStatus('saved');
        }).catch(() => {
            if (!controller.signal.aborted) {
                setLoadError(true);
                setSaveStatus('unsaved');
            }
        });
        return () => {
            controller.abort();
            generation.current++;
            void scopedSession.dispose();
            if (session.current === scopedSession)
                session.current = null;
        };
    }, [workspaceId, load, attempt]);
    useEffect(() => {
        if (loadedWorkspace !== workspaceId)
            return;
        if (!dirty.current) {
            dirty.current = true;
            return;
        }
        session.current?.change(snapshotOf(nodes, edges));
    }, [nodes, edges, loadedWorkspace, workspaceId]);
    const saveCanvasNow = () => {
        if (loadedWorkspace !== workspaceId)
            return Promise.resolve();
        session.current?.change(snapshotOf(nodes, edges));
        return session.current?.flush() || Promise.resolve();
    };
    return { loaded: loadedWorkspace === workspaceId, loadError, retryLoad, saveStatus, saveCanvasNow, showSavedToast: saveStatus === 'saved' };
}
