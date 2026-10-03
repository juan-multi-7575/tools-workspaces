import type { GraphSnapshot } from './canvasGraph';
/** A save session never changes its workspace, even when an awaited write settles late. */
export class CanvasSaveSession {
    private snapshot: GraphSnapshot | null = null;
    private timer: ReturnType<typeof setTimeout> | undefined;
    private queue: Promise<void> = Promise.resolve();
    private disposed = false;
    private revision = 0;
    private snapshotRevision = 0;
    private write: (snapshot: GraphSnapshot) => Promise<unknown>;
    private notify: (status: 'saved' | 'saving' | 'unsaved') => void;
    private delay: number;
    constructor(write: (snapshot: GraphSnapshot) => Promise<unknown>, notify: (status: 'saved' | 'saving' | 'unsaved') => void, delay = 600) {
        this.write = write;
        this.notify = notify;
        this.delay = delay;
    }
    change(snapshot: GraphSnapshot) {
        if (this.disposed)
            return;
        this.snapshot = snapshot;
        this.snapshotRevision = ++this.revision;
        this.notify('unsaved');
        clearTimeout(this.timer);
        this.timer = setTimeout(() => void this.flush(), this.delay);
    }
    flush() {
        clearTimeout(this.timer);
        const snapshot = this.snapshot;
        const revision = this.snapshotRevision;
        this.snapshot = null;
        if (!snapshot)
            return this.queue;
        if (!this.disposed)
            this.notify('saving');
        this.queue = this.queue.then(() => this.write(snapshot)).then(() => {
            if (!this.disposed && revision === this.revision)
                this.notify('saved');
        }).catch(() => {
            if (!this.disposed) {
                if (revision === this.revision && !this.snapshot) {
                    this.snapshot = snapshot;
                    this.snapshotRevision = revision;
                }
                this.notify('unsaved');
            }
        });
        return this.queue;
    }
    dispose() {
        this.disposed = true;
        return this.flush();
    }
}
