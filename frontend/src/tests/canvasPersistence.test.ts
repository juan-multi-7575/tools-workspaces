import test from 'node:test';
import assert from 'node:assert/strict';
import { CanvasSaveSession } from '../lib/canvasPersistence';
import type { GraphSnapshot } from '../lib/canvasGraph';
const graph = (id: string): GraphSnapshot => ({ nodes: [{ id, position: { x: 0, y: 0 }, data: { toolId: 't', label: id, inputKinds: ['any'], outputKinds: ['any'], params: {} } }], edges: [] });
test('workspace dispose flushes latest debounce to its original workspace only', async () => {
    const writes: string[] = [], statuses: string[] = [];
    const old = new CanvasSaveSession(async (s) => { writes.push(`old:${s.nodes[0].id}`); }, s => statuses.push(s), 50);
    old.change(graph('a'));
    old.change(graph('b'));
    await old.dispose();
    const current = new CanvasSaveSession(async (s) => { writes.push(`new:${s.nodes[0].id}`); }, () => { }, 50);
    current.change(graph('c'));
    await current.flush();
    await current.dispose();
    assert.deepEqual(writes, ['old:b', 'new:c']);
    assert.deepEqual(statuses, ['unsaved', 'unsaved']);
});
test('late write completion cannot report saved in a disposed workspace', async () => {
    let release!: () => void;
    const states: string[] = [];
    const session = new CanvasSaveSession(() => new Promise<void>(resolve => release = resolve), s => states.push(s), 50);
    session.change(graph('a'));
    const saving = session.flush();
    await Promise.resolve();
    const disposing = session.dispose();
    release();
    await saving;
    await disposing;
    assert.deepEqual(states, ['unsaved', 'saving']);
});
test('autosave serializes slow writes so old snapshots cannot overwrite later edits', async () => {
    const saved: string[] = [];
    let release!: () => void;
    const session = new CanvasSaveSession(async (snapshot) => {
        if (snapshot.nodes[0].id === 'a')
            await new Promise<void>(resolve => release = resolve);
        saved.push(snapshot.nodes[0].id);
    }, () => { }, 50);
    session.change(graph('a'));
    const first = session.flush();
    await Promise.resolve();
    session.change(graph('b'));
    const second = session.flush();
    release();
    await first;
    await second;
    assert.deepEqual(saved, ['a', 'b']);
    await session.dispose();
});
test('debounce writes only the final graph after the delay', async (context) => {
    context.mock.timers.enable({ apis: ['setTimeout'] });
    const saved: string[] = [];
    const session = new CanvasSaveSession(async (snapshot) => { saved.push(snapshot.nodes[0].id); }, () => { }, 600);
    session.change(graph('a'));
    context.mock.timers.tick(300);
    session.change(graph('b'));
    context.mock.timers.tick(599);
    assert.deepEqual(saved, []);
    context.mock.timers.tick(1);
    await session.flush();
    assert.deepEqual(saved, ['b']);
    await session.dispose();
});
test('failed older flush never overwrites a queued newer successful save on dispose', async () => {
    const writes: string[] = [];
    let rejectFirst!: (error: Error) => void;
    const session = new CanvasSaveSession(snapshot => { writes.push(snapshot.nodes[0].id); return writes.length === 1 ? new Promise<void>((_, reject) => rejectFirst = reject) : Promise.resolve(); }, () => { }, 600);
    session.change(graph('old'));
    const first = session.flush();
    await Promise.resolve();
    session.change(graph('new'));
    const second = session.flush();
    rejectFirst(new Error('temporary'));
    await first;
    await second;
    await session.dispose();
    assert.deepEqual(writes, ['old', 'new']);
});
