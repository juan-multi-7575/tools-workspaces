# Tab State Lifecycle & High-Frequency Stream Performance

## Status
Accepted

## Context
In a local-first web workbench where background workers generate media artifacts (subtitles, audio cuts, video downloads), we have a sidebar that tracks:
1. Active & past download jobs (SSE stream).
2. Discovered disk artifacts (globbed from workspace runs & downloads).
3. Pipeline / tool execution history.

What patterns ensure instant responsiveness when the user switches between these three tabs while 2 downloads are streaming progress events at 200ms intervals? Specifically, how should we cache the disk artifacts list vs the live download stream in React?

## Decision & Expert Consensus
### claude-opus-5 Recommendation
## The core idea: three different data regimes, three different cache strategies

The mistake that kills tab-switch latency is treating all three tabs as "lists I fetch when the tab mounts." They have completely different volatility profiles and should be modeled separately.

| | Downloads (SSE) | Disk artifacts | Tool/pipeline history |
|---|---|---|---|
| Shape | Small mutable map, high-frequency patches | Large-ish immutable snapshot, low-frequency | Append-only log, monotonic |
| Cardinality | ~2–20 rows | 10²–10⁴ rows | Unbounded, paged |
| Cache policy | **No cache — it *is* the source**; live store outside React | **SWR + persisted**, invalidated by events, not polling | `staleTime: Infinity` per page, prepend-only |
| Read pattern | Per-row subscription | Snapshot + virtualized window | Cursor-paged infinite |
| What must never happen | Re-render the list container per tick | Refetch-on-mount spinner | Refetch old pages |

---

## 1. Hoist all three data sources above the tabs

Tab switching must be a pure *render* concern, never a *subscription lifecycle* concern. If your `EventSource` is opened inside `<DownloadsTab>`, switching away tears down the connection, switching back reconnects, and you've lost in-flight progress and paid a reconnect round trip.

```tsx
<WorkbenchDataProvider>      {/* owns: SSE singleton, query client, live store */}
  <Sidebar>
    <TabBar />
    {tab === 'downloads' && <DownloadsTab />}
    {tab === 'artifacts' && <ArtifactsTab />}
    {tab === 'history'   && <HistoryTab />}
  </Sidebar>
</WorkbenchDataProvider>
```

The SSE connection is a module-level singleton with ref-counting and `Last-Event-ID` resume:

```ts
// downloadStream.ts
let es: EventSource | null = null;
let refs = 0;

export function acquireStream() {
  if (refs++ === 0) {
    es = new EventSource('/api/downloads/stream');
    es.addEventListener('progress', e => store.patch(JSON.parse(e.data)));
    es.addEventListener('job.completed', e => onJobCompleted(JSON.parse(e.data)));
  }
  return () => { if (--refs === 0) { es?.close(); es = null; } };
}
```

Only the provider acquires it, so refs never drops to 0 during a tab switch.

---

## 2. Keep the live stream out of React state entirely

10 events/sec is trivial *bandwidth* but can be expensive *render* if a single `useState` at the list level fans out to every row plus the tab shell. Use an external store with **split subscriptions**: the ID list changes rarely, the per-job payload changes constantly.

```ts
// liveJobs.ts
const jobs = new Map<string, Job>();
const idListeners = new Set<() => void>();
const rowListeners = new Map<string, Set<() => void>>();

let ids: readonly string[] = [];          // stable identity between ticks
let pending = new Map<string, Partial<Job>>();
let frame = 0;

export function patch(p: JobPatch) {
  pending.set(p.id, { ...pending.get(p.id), ...p });
  if (!frame) frame = schedule(flush);
}

function flush() {
  frame = 0;
  let idsChanged = false;
  for (const [id, p] of pending) {
    if (!jobs.has(id)) idsChanged = true;
    jobs.set(id, { ...jobs.get(id)!, ...p });
    rowListeners.get(id)?.forEach(fn => fn());   // ONLY this row re-renders
  }
  pending.clear();
  if (idsChanged) { ids = [...jobs.keys()]; idListeners.forEach(fn => fn()); }
}

// rAF stalls when the tab is hidden — fall back to a slow timer
const schedule = (fn: () => void) =>
  document.hidden ? setTimeout(fn, 1000) : requestAnimationFrame(fn);
```

Hooks:

```ts
export const useJobIds = () =>
  useSyncExternalStore(sub => (idListeners.add(sub), () => idListeners.delete(sub)),
                       () => ids);

export const useJob = (id: string) =>
  useSyncExternalStore(sub => subscribeRow(id, sub), () => jobs.get(id)!);
```

Two consequences that matter:

- **rAF coalescing collapses bursts.** Two jobs at 200ms each produce ~10 patches/sec; a reconnect-replay or a burst of chunk events produces hundreds. The rAF batch caps you at one flush per frame regardless.
- **Last-write-wins while hidden.** When the artifacts tab is active, the downloads rows aren't mounted, so `rowListeners` is empty — the store keeps mutating the `Map` at near-zero cost and there is no React work at all. Switching back reads the current snapshot and paints once. This is the single biggest win: *a hidden tab costs a `Map.set`.*

For the progress bar specifically, you can go one step further and skip React on the hot path — subscribe in an effect and write `el.style.transform = scaleX(...)` directly. Transform-only writes stay on the compositor and never invalidate layout. Worth it above ~20 concurrent jobs; below that the memoized row is fine.

> Avoid putting progress values in React Context. Context propagation re-renders every consumer, and you'll be doing that 10×/sec across the whole sidebar.

---

## 3. Disk artifacts: stale-while-revalidate, persisted, event-invalidated

The artifacts list should **never** show a spinner on tab switch after the first load.

```ts
const artifacts = useQuery({
  queryKey: ['artifacts', workspaceId],
  queryFn: scanArtifacts,
  staleTime: 30_000,
  gcTime: 30 * 60_000,
  placeholderData: keepPreviousData,
  refetchOnMount: 'always',     // fires in background; cached data paints instantly
  refetchOnWindowFocus: true,
});
```

Three things to add:

**Persist the cache.** Local-first means a page reload shouldn't re-glob the disk before first paint. Persist the query cache to IndexedDB (`persistQueryClient` + an idb persister) so the sidebar hydrates with last-known artifacts in ~0ms and revalidates behind it.

**Invalidate from events, not from polling.** The SSE stream already tells you when the disk changed:

```ts
function onJobCompleted(job: CompletedJob) {
  // 1. optimistic insert — the row appears the instant the download finishes
  queryClient.setQueryData(['artifacts', job.workspaceId], (old) =>
    old ? insertSorted(old, artifactFromJob(job)) : old);

  // 2. trailing-debounced reconcile with the real glob (batches 5 finishes into 1 scan)
  debouncedInvalidate(job.workspaceId);
}
```

Never invalidate on `progress` events. That's the classic footgun that turns a 200ms progress tick into a full filesystem glob.

**Add a cheap change-detector.** Have the backend expose `GET /artifacts/version → { maxMtime, count, hash }`. Poll/check that (it's O(1) if the server keeps a watcher) and only run the full glob when it differs. Combined with structural sharing in React Query, an unchanged refetch produces identical object identities → memoized rows don't re-render at all.

**Long term:** the real local-first answer is that the artifacts list isn't a cache of a fetch, it's a **projection of a local index** (SQLite/IndexedDB kept in sync by a filesystem watcher). Then you use a live query (Dexie `liveQuery`, `useSyncExternalStore` over the index) and invalidation disappears entirely. The React Query setup above is the pragmatic version of the same shape.

---

## 4. History: immutable pages, prepend-only

```ts
useInfiniteQuery({
  queryKey: ['history', workspaceId],
  queryFn: ({ pageParam }) => fetchHistory(pageParam),
  getNextPageParam: last => last.cursor,
  staleTime: Infinity,   // completed runs are immutable
  gcTime: Infinity,
});
```

New entries arrive via SSE and get `setQueryData`-prepended to page 0. Nothing ever refetches. Cap retained pages (`maxPages`) so a long session doesn't grow unbounded — same for your completed-jobs map, which should be a ring buffer.

---

## 5. Making the switch itself feel instant

- **Prefetch on intent.** `onPointerEnter`/`onFocus` on the tab button → `queryClient.prefetchQuery(...)`. You get ~100–200ms of free head start before the click lands.
- **Virtualize the artifacts list.** TanStack Virtual with fixed row heights. A 10k-file glob renders ~25 DOM nodes; mount cost becomes independent of list size, which is what actually makes the switch feel instant.
- **Keep tab switch urgent, defer the derived work.** Don't wrap `setTab` in `startTransition` — the cached data is ready and you want the frame now. Instead defer the expensive *derivation*:

  ```tsx
  const deferredFilter = useDeferredValue(filter);
  const rows = useMemo(() => sortAndFilter(artifacts, deferredFilter), [artifacts, deferredFilter]);
  ```
- **Preserve scroll position.** Either save `scrollTop` to a ref on unmount and restore in a layout effect, or keep the inactive panel mounted with `hidden` + `content-visibility: auto` (skips rendering work for off-screen content while retaining DOM state). Only do the latter if the panel's mount cost is high; with virtualization it usually isn't.
- **Move parsing off the main thread.** If the glob response needs sorting/grouping/duration-probing, do it in the backend or a worker and ship a compact, pre-sorted payload. JSON.parse of a 10k-row array on the main thread during a tab switch is a visible jank source.

---

## Summary checklist

1. SSE connection is a ref-counted singleton owned above the tabs — never inside a tab component.
2. Live progress lives in an external store, coalesced per animation frame, with **per-row** subscriptions so the list container and tab shell never re-render on a tick.
3. Hidden tabs cost a `Map.set`, not a render.
4. Artifacts use SWR with `staleTime` + `keepPreviousData` + IndexedDB persistence → no spinner after first load, instant paint on reload.
5. Artifact invalidation is driven by `job.completed` events (debounced, with optimistic insert), never by progress events, never by a timer.
6. History pages are immutable: `staleTime: Infinity`, prepend-only, bounded retention.
7. Virtualize, prefetch on hover, defer derived computation — not the tab switch itself.

Verify with the React Profiler: while two downloads stream and you're on the **artifacts** tab, the commit count for that subtree should be **zero**. If it isn't, something high-frequency is leaking through Context or a shared store selector.

### glm-5.3-flash Recommendation
Short answer: **treat the two data types as different lifecycles.** The SSE stream is an always-on *write path* into an external store that lives above the tab switcher. The artifacts/history lists are *pull caches* (stale-while-revalidate) that are invalidated *by* the stream. Neither belongs in tab-local component state — that's what makes tab switches instant.

## The three channels at a glance

| Tab | Transport | Where it lives | When it updates |
|---|---|---|---|
| Downloads | SSE → normalized store | Module singleton / app-root provider | Every event, coalesced per frame |
| Artifacts | HTTP glob → query cache | TanStack Query (or similar) SWR cache | On invalidation from SSE `job.completed` |
| History | HTTP paged → query cache | Same SWR cache | Prepend on completion / invalidate |

## 1. The live stream: singleton transport, external store

The EventSource must not be mounted inside the Downloads tab, or every tab switch tears down your only source of truth. Own it at module scope or in a provider above the router:

```ts
// lib/live.ts — lives for the whole session, never unmounts
import { useJobStore } from './job-store'
import { queryClient } from './query-client'

const pending = new Map<string, JobPatch>()
let flushScheduled = false

function flush() {
  flushScheduled = false
  const patches = [...pending.values()]
  pending.clear()
  useJobStore.setState(s => {
    const jobs = { ...s.jobs }
    for (const p of patches) jobs[p.id] = { ...jobs[p.id], ...p }
    return { jobs }
  })
}

const es = new EventSource('/api/events')

es.addEventListener('job.progress', e => {
  const p = JSON.parse(e.data)
  pending.set(p.id, p)                      // coalesce: latest per job wins
  if (!flushScheduled) {
    flushScheduled = true
    requestAnimationFrame(flush)            // one store write per frame max
  }
})

es.addEventListener('job.completed', e => {
  const job = JSON.parse(e.data)
  useJobStore.setState(s => ({ jobs: { ...s.jobs, [job.id]: job } }))

  // Optimistic patch: completion events usually carry output paths
  if (job.outputs?.length) {
    queryClient.setQueryData<Artifact[]>(['artifacts', job.root], old =>
      old ? dedupeByPath([...job.outputs.map(toArtifact), ...old]) : old)
  }
  // Then reconcile with the real glob in the background
  queryClient.invalidateQueries({ queryKey: ['artifacts'] })
  queryClient.invalidateQueries({ queryKey: ['history'] })
})

es.onopen = () => {
  // Reconnected after a drop → completions may have been missed
  queryClient.invalidateQueries()
}
```

The rAF coalescing matters less at 2 jobs × 200ms (10 msg/s is trivial) and more as a *bound*: 20 jobs later, you're still doing at most one store write per frame regardless of event rate. (rAF pauses in hidden browser tabs — that's a feature: work resumes with one flush when the user returns.)

Keep an append-only raw event log in the store too if you want replay/debuggability for a dev panel — but the UI reads the normalized `jobs` map, not the log.

## 2. Artifacts: SWR cache, invalidated by the stream

The glob is expensive backend work and changes rarely — perfect for stale-while-revalidate:

```ts
function useArtifacts(root: string) {
  return useQuery({
    queryKey: ['artifacts', root],
    queryFn: ({ signal }) => api.globArtifacts(root, signal),
    staleTime: 5 * 60_000,          // tab switches are free
    gcTime: Infinity,
    placeholderData: keepPreviousData, // no flash when filters/pagination change
    notifyOnChangeProps: ['data'],     // don't re-render on isFetching flips
  })
}
```

This gives you the exact behavior you want on tab switch: **cached data renders synchronously on the first render** — no spinner, no effect waterfall — and a refetch only happens when something marked it stale. The SSE `job.completed` handler is your invalidation signal, which is much better than refetch-on-mount (wasteful) or polling (laggy). The optimistic `setQueryData` patch above means new artifacts appear the instant the download finishes, before the glob even runs.

Two details that keep this cheap: structural sharing (on by default in TanStack Query) preserves object identity for unchanged rows, so memoized row components skip re-render on refetch; and key rows by file path, never index, or that sharing breaks. Since this is local-first, consider an IndexedDB persister for the query cache so even a cold reload renders instantly.

## 3. Re-render isolation during streaming

The failure mode that makes tab switches janky: each progress event updates one store/corner of state, and the *whole sidebar* — including hidden heavy lists — re-renders 10×/sec. Fixes, in order of impact:

- **Fine-grained selectors.** Each job row subscribes only to its own slice, so a progress tick re-renders one ~50-component row, not the sidebar:

```tsx
function JobRow({ id }: { id: string }) {
  const job = useJobStore(s => s.jobs[id])  // only this row re-renders
  return <div style={{ transform: `scaleX(${job.progress})` }} ... />
}
```

- **Split active from completed.** Active jobs are a small, volatile section; completed/history rows come from the stable query cache and never re-render during streaming.
- **Virtualize** the jobs and artifacts lists (react-window/virtua). This makes mount cost O(viewport), which is what makes tab switches cheap.
- **Don't render hidden tabs' data changes.** If you keep panels mounted for scroll-position preservation, add `content-visibility: auto` (or `hidden`) so hidden panels skip layout/paint; otherwise store scroll offsets and accept remount — with state externalized, remount is a cache read, so it's nearly free either way.
- Optional micro-opt: for the progress bar specifically, bypass React — the flush loop writes `element.style.transform` via a ref registry. React keeps the structure; the bar updates at 60fps with zero reconciliation.

## Pitfalls that specifically kill this app

- **SSE in the Downloads tab component** → stream dies on tab switch, reconnect flicker, missed completions, stale artifacts cache.
- **Context provider for live job state** → every consumer re-renders per tick. Context is fine for *the connection handle*, never for per-event data.
- **`staleTime: 0` on artifacts** → every tab switch fires a glob; spinner flash; backend hammered.
- **Rendering gated on `isFetching`** → SWR means show stale data immediately with a subtle refresh indicator, never a blocking spinner.
- **No reconnect invalidation** → if the SSE drops and `Last-Event-ID` resume misses completions, your artifacts cache silently diverges from disk. The `es.onopen` invalidate is the safety net.
- **Measuring layout on tab mount** (thumbnail sizing, etc.) → forces sync layout right when you want a 0ms switch. Use fixed sidebar geometry or `aspect-ratio`.

With this split, a tab switch is: swap a CSS class, render from synchronous cache/store reads, zero network on the hot path, and the two streaming downloads never even notice.

### QWEN 3.8 MAX Recommendation
The main pattern is:

> **Keep three independent read models, and separate durable cached records from volatile live telemetry.**

With only two downloads emitting progress every 200ms, the raw event rate is not the problem. The problem is coupling those progress events to large React trees: tab panels, lists, artifact caches, filters, etc.

---

# 1. Separate the three domains

You have three very different data shapes:

| Domain | Volatility | Source | Best React caching model |
|---|---:|---|---|
| Download jobs | High-frequency live progress | SSE | Ephemeral live store + durable job metadata |
| Disk artifacts | Low-frequency, eventually consistent | Workspace glob / file watcher | Query cache / normalized durable cache |
| Tool run history | Medium-frequency, append-mostly | Pipeline events | Query cache + event invalidation |

Do not put all of these into one generic “activity state” object that every tab observes.

Instead:

```txt
ActivityStreamProvider
├── downloadsStore        live, ephemeral, fine-grained
├── artifactsQueryCache   durable, cached, event-invalidated
└── toolRunsQueryCache    durable, cached, event-invalidated
```

The sidebar tabs should render from these caches. They should not own the SSE stream.

---

# 2. Keep the SSE connection global, not inside a tab

Do not create the SSE subscription inside `DownloadsTab`, `ArtifactsTab`, or `RunsTab`.

Bad:

```tsx
function DownloadsTab() {
  useEffect(() => {
    const source = new EventSource("/api/downloads/stream");
    return () => source.close();
  }, []);
}
```

That will drop or recreate the stream when the user switches tabs.

Better:

```tsx
<App>
  <ActivityStreamProvider>
    <WorkbenchSidebar />
  </ActivityStreamProvider>
</App>
```

The provider owns:

```txt
SSE connection
reconnection
event batching
event routing
backfill/reconciliation
```

The tabs only subscribe to already-processed state.

---

# 3. Cache disk artifacts like query state, not like live telemetry

The disk artifacts list is a durable read model.

It should be cached with something like:

- TanStack Query
- RTK Query
- SWR
- Apollo
- or your own normalized query cache

The important part is that the artifact list is:

- cached across tab switches
- not refetched every time the tab becomes active
- updated incrementally from file/artifact events
- stable by object identity where possible
- optionally persisted for local-first instant restore

Example with TanStack Query:

```tsx
function useArtifacts() {
  return useQuery({
    queryKey: ["artifacts"],
    queryFn: fetchWorkspaceArtifacts,
    staleTime: 5 * 60 * 1000,
    gcTime: Infinity,
  });
}
```

For tab switching, this is important:

```tsx
queryClient.prefetchQuery({
  queryKey: ["artifacts"],
  queryFn: fetchWorkspaceArtifacts,
});
```

Prefetch the artifact list when the sidebar or app shell mounts, not when the user first clicks the tab.

Then switching to the Artifacts tab is instant because the data is already cached.

---

# 4. Update artifacts through events, not through download progress

Download progress events should not touch the artifact cache.

Only terminal or artifact-related events should affect artifacts:

```txt
download.completed
artifact.discovered
artifact.created
artifact.updated
artifact.deleted
artifact.batch_sync
```

Example event router:

```ts
activityStream.on(event => {
  switch (event.type) {
    case "download.progress":
      downloadProgressStore.set(event.downloadId, {
        percent: event.percent,
        speed: event.speed,
        eta: event.eta,
      });
      break;

    case "download.completed":
      queryClient.invalidateQueries({ queryKey: ["downloads"] });
      break;

    case "artifact.created":
      queryClient.setQueryData(["artifacts"], old =>
        upsertArtifact(old, event.artifact)
      );
      break;

    case "artifact.deleted":
      queryClient.setQueryData(["artifacts"], old =>
        removeArtifact(old, event.artifactId)
      );
      break;

    case "tool_run.updated":
      queryClient.invalidateQueries({ queryKey: ["tool-runs"] });
      break;
  }
});
```

The key rule:

> `download.progress` updates only the live download progress store.  
> It never invalidates or refetches the artifact list.

---

# 5. Do not store 200ms download progress in React Query

React Query is excellent for durable server/workspace state, but it is usually the wrong place for high-frequency ephemeral telemetry.

Avoid this:

```ts
queryClient.setQueryData(["downloads", id], patch);
```

on every 200ms progress tick if that causes list components to re-render.

Instead, keep live progress in a separate external store:

```ts
type DownloadProgress = {
  percent: number;
  speed: number;
  eta: number;
  updatedAt: number;
};
```

Use a fine-grained store such as:

- Zustand
- Jotai
- Redux with carefully selected slices
- a custom `useSyncExternalStore`
- RxJS/ReactiveStore if you already use it

The important property is:

> A progress update for download A should only re-render the UI part for download A.

---

# 6. Split download job metadata from download progress

A download row has two kinds of data.

## Stable job metadata

```ts
{
  id: "dl_123",
  title: "lecture.mp4",
  sourceUrl: "https://...",
  status: "downloading",
  createdAt: "2026-02-14T18:03:21Z"
}
```

This belongs in a durable list cache.

## Ephemeral progress

```ts
{
  percent: 48.2,
  speed: 1834000,
  eta: 36
}
```

This belongs in a volatile live store.

This separation prevents progress updates from invalidating the whole download list.

---

# 7. Use row-level subscriptions for live progress

A good component structure:

```tsx
function DownloadList() {
  const ids = useActiveDownloadIds();

  return (
    <ul>
      {ids.map(id => (
        <DownloadRow key={id} id={id} />
      ))}
    </ul>
  );
}
```

```tsx
const DownloadRow = memo(function DownloadRow({ id }: { id: string }) {
  const meta = useDownloadMetadata(id);

  return (
    <div>
      <DownloadTitle meta={meta} />
      <DownloadProgressBar downloadId={id} />
      <DownloadActions meta={meta} />
    </div>
  );
});
```

```tsx
const DownloadProgressBar = memo(function DownloadProgressBar({
  downloadId,
}: {
  downloadId: string;
}) {
  const progress = useDownloadProgress(downloadId);

  return (
    <div className="h-1 bg-neutral-200">
      <div
        className="h-1 bg-blue-500 transition-[width] duration-300"
        style={{ width: `${progress.percent}%` }}
      />
    </div>
  );
});
```

The list subscribes to:

```ts
activeDownloadIds
```

The row subscribes to:

```ts
download metadata
```

The progress bar subscribes to:

```ts
progress for one download id
```

So when progress arrives, only the small progress component re-renders.

---

# 8. Coalesce progress events with requestAnimationFrame

Two downloads at 200ms intervals means roughly 10 events per second. That is small, but you still want to avoid unnecessary React work.

Use a buffer and flush once per animation frame.

Conceptually:

```ts
const pendingProgress = new Map<string, DownloadProgress>();
let scheduled = false;

function onDownloadProgress(event: DownloadProgressEvent) {
  pendingProgress.set(event.downloadId, {
    percent: event.percent,
    speed: event.speed,
    eta: event.eta,
    updatedAt: event.createdAt,
  });

  if (!scheduled) {
    scheduled = true;

    requestAnimationFrame(() => {
      for (const [id, progress] of pendingProgress) {
        downloadProgressStore.set(id, progress);
      }

      pendingProgress.clear();
      scheduled = false;
    });
  }
}
```

This gives you:

- maximum one React commit per frame
- latest-wins behavior
- smoother progress bars
- reduced work if events arrive faster than rendering needs

If you want to be even calmer, throttle visible progress updates to 500ms or 1000ms and use CSS transitions.

---

# 9. Keep inactive tabs unmounted, but keep their caches mounted

For instant tab switching, I would usually do this:

```tsx
{activeTab === "downloads" && <DownloadsPanel />}
{activeTab === "artifacts" && <ArtifactsPanel />}
{activeTab === "runs" && <RunsPanel />}
```

Do not keep all three heavy panels mounted unless you specifically need to preserve DOM state.

Why unmount inactive tabs?

- Hidden download rows would otherwise continue re-rendering progress.
- Hidden logs might continue updating.
- Hidden virtualized lists still consume memory.
- You avoid accidental coupling between tabs.

But the data should stay cached globally.

So switching tabs is just:

```txt
unmount old panel
mount new panel from cache
```

That mount should be instant if the query cache is already warm.

If you need to preserve scroll position or filter state, store that UI state outside the panel:

```ts
sidebarUiState: {
  activeTab: "artifacts",
  artifacts: {
    search: "",
    kindFilter: "all",
    scrollTop: 420
  },
  downloads: {
    statusFilter: "all",
    scrollTop: 0
  },
  runs: {
    toolFilter: "all",
    scrollTop: 120
  }
}
```

Then restore it on panel mount.

---

# 10. Prefetch all three read models early

For instant responsiveness, do not wait for the user to click each tab.

When the workbench shell mounts:

```ts
queryClient.prefetchQuery({
  queryKey: ["downloads"],
  queryFn: fetchDownloadJobs,
});

queryClient.prefetchQuery({
  queryKey: ["artifacts"],
  queryFn: fetchWorkspaceArtifacts,
});

queryClient.prefetchQuery({
  queryKey: ["tool-runs"],
  queryFn: fetchToolRuns,
});
```

The active SSE stream can immediately populate live download progress.

Then tab switching becomes a cheap view switch, not a data-fetching operation.

---

# 11. Artifact list caching details

For disk artifacts discovered by globbing, use a durable cache with incremental updates.

## Preferred artifact model

```ts
type Artifact = {
  id: string;
  path: string;
  kind: "subtitle" | "audio" | "video" | "transcript" | "other";
  format: string;
  sizeBytes: number;
  mtime: string;
  sourceRunId?: string;
  language?: string;
  provisional?: boolean;
};
```

Use a stable identity:

```txt
artifact.id = hash(workspace + relative path)
```

or a backend-provided ID.

Do not use array index as key.

---

## Artifact cache behavior

The artifact cache should be:

```txt
stale-while-revalidate
event-driven
debounced
normalized
virtualized for large lists
```

A good query setup:

```tsx
function useArtifacts() {
  return useQuery({
    queryKey: ["artifacts"],
    queryFn: fetchArtifacts,
    staleTime: 5 * 60 * 1000,
    gcTime: Infinity,
  });
}
```

But if you have a reliable file watcher/event stream, you can make `staleTime` very long and rely on events:

```ts
artifact.created
artifact.deleted
artifact.updated
artifact.sync
```

For local-first, you may also persist the artifact cache to IndexedDB so the sidebar paints instantly after reload.

Pattern:

```txt
1. Hydrate artifact list from IndexedDB immediately.
2. Show cached artifacts.
3. Reconcile with workspace glob in background.
4. Apply deltas from file watcher/SSE.
```

That gives true local-first responsiveness.

---

# 12. Debounce file-system churn

Downloads and media workers can create temporary files:

```txt
lecture.mp4.part
lecture.mp4.ytdlp.temp
audio_cut.tmp
```

If your artifact discovery reacts to every file change, the Artifacts tab can flicker or over-update.

Rules:

- Ignore temporary/partial files unless you intentionally show them.
- Debounce artifact syncs by 300–1000ms.
- Batch file watcher events.
- Prefer explicit backend events over raw filesystem events.
- Only show completed artifacts by default.
- If showing in-progress artifacts, mark them as provisional.

Example:

```ts
const debouncedArtifactSync = debounce(() => {
  queryClient.invalidateQueries({ queryKey: ["artifacts"] });
}, 500);

fileWatcher.on("change", debouncedArtifactSync);
fileWatcher.on("add", debouncedArtifactSync);
fileWatcher.on("unlink", debouncedArtifactSync);
```

Even better, have the worker emit:

```json
{
  "type": "artifact.created",
  "artifact": {
    "id": "art_123",
    "path": "runs/transcribe/lecture.en.srt",
    "kind": "subtitle",
    "format": "srt",
    "sizeBytes": 18223
  }
}
```

Then the UI does not need to infer artifacts from noisy disk events.

---

# 13. Live download stream caching details

For downloads, cache two things separately.

## Durable download job list

This can live in React Query:

```ts
useQuery({
  queryKey: ["downloads"],
  queryFn: fetchDownloads,
});
```

It contains:

```ts
{
  id: string;
  title: string;
  status: "queued" | "downloading" | "completed" | "failed" | "cancelled";
  sourceUrl: string;
  createdAt: string;
  completedAt?: string;
  error?: string;
}
```

This changes relatively infrequently.

## Live progress store

This should be outside React Query.

For example, with Zustand:

```ts
type DownloadProgressState = {
  progressById: Record<string, DownloadProgress>;
  setProgress: (id: string, progress: DownloadProgress) => void;
};

const useDownloadProgressStore = create<DownloadProgressState>(set => ({
  progressById: {},
  setProgress: (id, progress) =>
    set(state => ({
      progressById: {
        ...state.progressById,
        [id]: progress,
      },
    })),
}));
```

Then use a narrow selector:

```tsx
function useDownloadProgress(id: string) {
  return useDownloadProgressStore(state => state.progressById[id]);
}
```

For even better isolation, use a custom pub/sub store so only components subscribed to that ID are notified.

---

# 14. Avoid putting live progress in React context

This is a common trap.

Bad:

```tsx
const ActivityContext = createContext<ActivityState | null>(null);

function useActivity() {
  return useContext(ActivityContext);
}
```

If `ActivityState` contains:

```ts
downloadProgressById
```

then every progress tick can cause many context consumers to re-render.

Use context only for things that rarely change:

```ts
event bus
query client
permissions
workspace info
```

Use external stores for high-frequency data.

---

# 15. Make the Downloads list subscribe only to structural changes

The download list should re-render only when the visible set changes:

```txt
download added
download removed
status bucket changes
filter changes
sort changes
```

It should not re-render because one row went from 42% to 43%.

Example selector:

```ts
function useActiveDownloadIds() {
  return useDownloadsQuery(selectActiveDownloadIds);
}
```

Where `selectActiveDownloadIds` returns a stable array:

```ts
["dl_123", "dl_124"]
```

If the array identity does not change, the list does not re-render.

The individual row or progress bar handles the live tick.

---

# 16. Use memoization carefully

`memo()` helps, but only if props are stable.

Less effective:

```tsx
<DownloadRow
  key={download.id}
  download={download}
  progress={progressById[download.id]}
/>
```

Why?

- The parent may re-render whenever `progressById` changes.
- The row receives new progress props.
- The whole list can re-render.

Better:

```tsx
<DownloadRow key={download.id} id={download.id} />
```

Then the row selects its own data.

This is especially important for live progress.

---

# 17. Virtualize long lists, but do not virtualize live progress into the parent

For 50–500 records, virtualization is useful.

Use:

```txt
@tanstack/react-virtual
react-virtuoso
react-window
```

But make sure the virtualized row component itself subscribes to its own live progress.

Do not have the virtual list parent subscribe to all progress values.

Good:

```tsx
<VirtualList
  items={downloadIds}
  renderItem={id => <DownloadRow id={id} />}
/>
```

Bad:

```tsx
<VirtualList
  items={downloadIds}
  renderItem={id => (
    <DownloadRow
      id={id}
      progress={progressById[id]}
    />
  )}
/>
```

The second pattern couples the list container to every progress tick.

---

# 18. Tool run history should also be cached like artifacts

Tool runs are more durable than download progress.

Use a query cache:

```ts
useQuery({
  queryKey: ["tool-runs"],
  queryFn: fetchToolRuns,
});
```

Update from events:

```txt
tool_run.created
tool_run.started
tool_run.completed
tool_run.failed
```

For logs, do not keep all logs in the main run list cache.

Use:

```txt
collapsed run row:
  status, duration, tool name, input/output summary

expanded run row:
  fetch/stream logs only when opened
```

This keeps run history lightweight and tab switching fast.

---

# 19. Recommended event routing table

| Event | Update target | React impact |
|---|---|---|
| `download.progress` | live progress store | only progress bar |
| `download.started` | downloads query/store | list structure |
| `download.completed` | downloads query + maybe artifacts | list status, artifact cache |
| `download.failed` | downloads query | list status |
| `artifact.created` | artifacts query cache | insert row |
| `artifact.deleted` | artifacts query cache | remove row |
| `artifact.batch_sync` | artifacts query cache | reconcile list |
| `tool_run.updated` | tool runs query cache | update row |
| `tool_run.log` | expanded log store only | only open log view |

---

# 20. Suggested React architecture

A clean shape:

```txt
src/
  activity/
    ActivityStreamProvider.tsx
    useActivityStream.ts
    eventRouter.ts

  downloads/
    DownloadsPanel.tsx
    DownloadList.tsx
    DownloadRow.tsx
    DownloadProgressBar.tsx
    useDownloadMetadata.ts
    useDownloadProgress.ts
    downloadProgressStore.ts

  artifacts/
    ArtifactsPanel.tsx
    ArtifactList.tsx
    ArtifactRow.tsx
    useArtifacts.ts
    artifactQueryCache.ts

  runs/
    RunsPanel.tsx
    RunList.tsx
    RunRow.tsx
    RunExpanded.tsx
    RunLogs.tsx
    useToolRuns.ts
    useRunLogs.ts

  sidebar/
    Sidebar.tsx
    SidebarTabs.tsx
    useSidebarUiState.ts
```

The sidebar only does:

```tsx
function Sidebar() {
  const activeTab = useSidebarUiState(s => s.activeTab);

  return (
    <>
      <SidebarTabs activeTab={activeTab} />
      {activeTab === "downloads" && <DownloadsPanel />}
      {activeTab === "artifacts" && <ArtifactsPanel />}
      {activeTab === "runs" && <RunsPanel />}
    </>
  );
}
```

All data lives above it.

---

# 21. Specific answer: artifacts cache vs live download stream

## Disk artifacts list

Cache as durable query state.

```ts
artifacts = useQuery({
  queryKey: ["artifacts"],
  queryFn: fetchArtifacts,
  staleTime: long,
  gcTime: Infinity,
});
```

Update by:

```txt
artifact events
debounced file watcher sync
manual refresh
background reconciliation
```

Characteristics:

```txt
eventually consistent
safe to cache
safe to persist
safe to stale-while-revalidate
updated infrequently
should survive tab switches
should not care about download progress ticks
```

---

## Live download stream

Cache as ephemeral fine-grained live state.

```ts
downloadProgressStore.set(downloadId, {
  percent,
  speed,
  eta,
});
```

Do not persist progress.

Do not put it in the artifact cache.

Do not put it in the main React Query list cache.

Characteristics:

```txt
high-frequency
temporary
latest-value-only
row-scoped
not persisted
safe to drop intermediate values
terminal events become durable records
```

---

# 22. What instant tab switching should feel like

When the user switches tabs:

```txt
Downloads -> Artifacts
```

The app should do this:

```txt
1. Change active tab state.
2. Mount ArtifactsPanel.
3. Read artifacts from existing query cache.
4. Render immediately.
5. Optionally reconcile in background.
```

It should not do this:

```txt
1. Open Artifacts tab.
2. Start SSE.
3. Fetch artifacts.
4. Wait.
5. Render.
```

And it should not do this:

```txt
1. Download progress tick arrives.
2. Artifact query invalidated.
3. Artifacts tab re-renders even though unchanged.
4. Runs tab re-renders.
5. UI jank.
```

---

# 23. Anti-patterns to avoid

## 1. One giant activity context

```ts
{
  downloads,
  downloadProgress,
  artifacts,
  runs,
  logs
}
```

This will cause broad re-renders.

## 2. Storing progress in TanStack Query at 200ms intervals

Use query cache for durable records, not telemetry.

## 3. Creating SSE connections inside tabs

The stream should outlive tab switches.

## 4. Fetching artifacts on every tab mount

Fetch once, cache, reconcile.

## 5. Letting file watcher events update the UI directly

Debounce and batch them.

## 6. Showing `.part` files as normal artifacts

That causes churn and confusing records.

## 7. Rendering logs into the run list

Load logs only when a run is expanded.

## 8. Passing progress props through list parents

Make progress components subscribe directly.

---

# 24. Minimal implementation sketch

```ts
// liveDownloadProgressStore.ts
type DownloadProgress = {
  percent: number;
  speed: number;
  eta: number;
};

type Listener = () => void;

const progressById = new Map<string, DownloadProgress>();
const listenersById = new Map<string, Set<Listener>>();

export function setDownloadProgress(id: string, next: DownloadProgress) {
  progressById.set(id, next);
  listenersById.get(id)?.forEach(listener => listener());
}

export function subscribeToDownloadProgress(id: string, listener: Listener) {
  if (!listenersById.has(id)) {
    listenersById.set(id, new Set());
  }

  listenersById.get(id)!.add(listener);

  return () => {
    listenersById.get(id)?.delete(listener);
  };
}

export function getDownloadProgress(id: string) {
  return progressById.get(id);
}
```

```tsx
// useDownloadProgress.ts
import { useSyncExternalStore } from "react";

export function useDownloadProgress(id: string) {
  return useSyncExternalStore(
    listener => subscribeToDownloadProgress(id, listener),
    () => getDownloadProgress(id)
  );
}
```

```tsx
// DownloadProgressBar.tsx
export function DownloadProgressBar({ downloadId }: { downloadId: string }) {
  const progress = useDownloadProgress(downloadId);

  if (!progress) return null;

  return (
    <div className="h-1 w-full bg-neutral-200">
      <div
        className="h-1 bg-blue-500 transition-[width] duration-300"
        style={{ width: `${progress.percent}%` }}
      />
    </div>
  );
}
```

```ts
// eventRouter.ts
const pending = new Map<string, DownloadProgress>();
let scheduled = false;

export function handleDownloadProgress(event: DownloadProgressEvent) {
  pending.set(event.id, {
    percent: event.percent,
    speed: event.speed,
    eta: event.eta,
  });

  if (!scheduled) {
    scheduled = true;

    requestAnimationFrame(() => {
      for (const [id, progress] of pending) {
        setDownloadProgress(id, progress);
      }

      pending.clear();
      scheduled = false;
    });
  }
}
```

```tsx
// artifacts hook
export function useArtifacts() {
  return useQuery({
    queryKey: ["artifacts"],
    queryFn: fetchArtifacts,
    staleTime: 5 * 60 * 1000,
    gcTime: Infinity,
  });
}
```

```ts
// artifact event handling
export function handleArtifactCreated(event: ArtifactCreatedEvent) {
  queryClient.setQueryData(["artifacts"], (old: Artifact[] = []) => {
    const exists = old.some(a => a.id === event.artifact.id);

    if (exists) {
      return old.map(a =>
        a.id === event.artifact.id ? event.artifact : a
      );
    }

    return [event.artifact, ...old];
  });
}
```

---

# 25. Final recommended pattern

Use this split:

```txt
SSE stream
  -> global provider
  -> event router

download.progress
  -> ephemeral progress store
  -> row-level subscription
  -> rAF coalescing

download.completed / failed / cancelled
  -> durable download cache
  -> possibly artifact cache

artifact.created / deleted / updated
  -> artifact query cache
  -> debounced reconciliation

tool_run.updated
  -> tool run query cache

tool_run.log
  -> only expanded run/log view
```

For the sidebar tabs:

```txt
Prefetch durable lists on app mount.
Render only the active tab.
Keep global caches alive.
Preserve filter/scroll state separately.
Virtualize long lists.
Isolate live progress to individual rows.
```

That combination gives you instant tab switching because the tabs become lightweight views over already-cached read models, while the live download stream updates only the smallest possible React components.

## Alternatives Considered
- Evaluated architectural options across 3 model outputs in Agent Query Hub.

---
*Generated from Agent Query Hub: `q-stream-perf-02`*
