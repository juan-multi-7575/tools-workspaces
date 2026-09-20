# Sidebar Record Viewer vs Enqueue Drawer Architecture

## Status
Accepted

## Context
I'm refining the UI/UX architecture of a media tools application (built in React, Tailwind, and FastAPI). The application has a slide-over Activity & Records Drawer with three dedicated tabs:
1) Downloads (live yt-dlp tasks with progress %, speed, ETA, status, cancel, and clear history).
2) Saved Files (server-side artifacts across tool runs and downloads, featuring format badges like [EN SRT], [VTT], [AUDIO], [VIDEO], 1-click 'Copy Path', and 'Use as Input' to pipe into another tool).
3) Tool Runs (execution timeline of tools like Transcriber, Translator, Trimmer, with runtime duration, status, and raw logs).

We previously had an inline URL download form inside the drawer, but removed it because the drawer should strictly be a records and activity viewer, not an input form.

Could you provide an architectural and UX breakdown:
- How should state synchronization and polling/SSE be partitioned so switching tabs doesn't cause unnecessary re-renders or dropped socket streams?
- What is the cleanest visual hierarchy for each tab card so users can scan 50+ records effortlessly without visual clutter?
- How should the 'Use as Input' shortcut communicate target tool compatibility when piping a saved file into another tool modal?

## Decision & Expert Consensus
### Qwen 3.8-MaX Recommendation
Below is a practical architecture + UX model for your Activity & Records Drawer. The guiding principle is:

> The drawer is a **read-only operational surface**.  
> It should observe activity, not own the primary input flows.

That means live task state, artifact state, and tool-run state should live **above the drawer**, and each drawer tab should be a lightweight projection of that shared state.

---

# 1. State synchronization and streaming architecture

## 1.1. Treat the three tabs as three bounded state domains

Even though they live in one drawer, they should not share one monolithic state object.

Use three normalized domains:

```ts
downloads: {
  byId: Record<string, DownloadTask>
  allIds: string[]
  progressById: Record<string, DownloadProgress>
}

files: {
  byId: Record<string, SavedFile>
  allIds: string[]
}

toolRuns: {
  byId: Record<string, ToolRun>
  allIds: string[]
}
```

Why this matters:

- A high-frequency `download.progress` event should not cause Saved Files or Tool Runs to re-render.
- A new artifact appearing should not force the Downloads list to re-sort.
- A log update for a Tool Run should not invalidate unrelated rows.

The tabs can share connection infrastructure, but they should not share render-critical state.

---

## 1.2. Use one global activity connection, not per-tab connections

Do **not** create an `EventSource` or WebSocket inside the tab component itself.

Bad pattern:

```tsx
DownloadsTab = () => {
  useEffect(() => {
    const es = new EventSource("/api/downloads/events");
    return () => es.close();
  }, []);
}
```

This causes dropped streams when the user switches tabs or closes the drawer.

Better pattern:

```tsx
<AppShell>
  <ActivityStreamProvider>
    <MediaToolsApp />
  </ActivityStreamProvider>
</AppShell>
```

The `ActivityStreamProvider` owns the live connection at the app level. The drawer tabs subscribe to derived slices.

This gives you:

- No dropped streams when switching tabs.
- No reconnect storms when opening/closing the drawer.
- One shared reconnection/backfill strategy.
- The ability to keep live updates running even when the drawer is closed.

---

## 1.3. Prefer one multiplexed SSE stream for low-volume events

For FastAPI + React, SSE is usually a good fit here because most updates are server-to-client:

- download progress
- task status changes
- artifact created/deleted
- tool run started/finished
- log appended

A clean endpoint shape:

```http
GET /api/activity/events?topics=downloads,files,runs
Accept: text/event-stream
```

Example event:

```txt
id: 100231
event: download.progress
data: {"id":"dl_981","percent":43.2,"speed":1843200,"eta":42,"version":18}
```

Example event types:

```txt
download.created
download.progress
download.status_changed
download.completed
download.failed
download.cancelled

artifact.created
artifact.deleted
artifact.updated

tool_run.created
tool_run.started
tool_run.progress
tool_run.completed
tool_run.failed
tool_run.log_appended
```

Use one multiplexed stream for the drawer’s main state, but consider a separate stream for high-volume log tailing:

```http
GET /api/tool-runs/{id}/logs/stream
```

That prevents verbose logs from flooding the general activity channel.

---

## 1.4. Use cursor-based recovery to avoid missed events

SSE can disconnect due to sleep, network changes, or server restarts. You need a recovery strategy.

Every event should include:

```json
{
  "id": "evt_10231",
  "type": "download.progress",
  "version": 24,
  "occurredAt": "2026-02-14T18:22:10Z",
  "payload": {}
}
```

Then reconnect with:

```http
Last-Event-ID: 100231
```

or:

```http
GET /api/activity/events?since=100231
```

Server behavior:

1. Replay missed events if still available.
2. If too far behind, send a `state.reset` or `state.snapshot_required` event.
3. Client refetches the relevant list.

This avoids weird partial states after tab switches or reconnects.

---

## 1.5. Separate persistent records from ephemeral progress

This is the biggest re-render trap.

A download row has two kinds of data:

### Persistent record data

```ts
{
  id: "dl_123",
  title: "lecture.mp4",
  sourceUrl: "https://...",
  status: "downloading",
  createdAt: "..."
}
```

### Ephemeral progress data

```ts
{
  percent: 42.3,
  speed: 2048000,
  eta: 35
}
```

Do not store high-frequency progress inside the same selector that renders the whole list.

Instead:

```ts
downloads.byId       // stable list metadata
downloads.progress   // rapidly changing progress
```

Then each row subscribes only to its own progress:

```tsx
const progress = useDownloadProgress(downloadId);
```

This way, a progress tick only re-renders the affected row, not the entire Downloads list.

---

## 1.6. Throttle progress events server-side

`yt-dlp` can emit very frequently. Do not send every stdout line to the client.

Recommended server-side throttling:

- Progress: every `500ms` to `1000ms`
- Speed/ETA: same cadence
- Status changes: immediate
- Logs: batch or tail-only unless expanded

For the drawer UI, 1 update per second is usually enough.

If you want smoother progress bars, use CSS transitions:

```css
transition: width 600ms linear;
```

That makes 1Hz updates look smooth without extra re-renders.

---

## 1.7. Tab-specific synchronization strategy

Here is a good partitioning model.

| Tab | Primary transport | When to subscribe | Polling fallback | Re-render risk |
|---|---|---|---|---|
| Downloads | SSE for progress/status | Global if active downloads exist | 3–5s only if SSE disconnected | High, isolate progress |
| Saved Files | SSE for artifact mutations | Drawer open or after tool runs | 20–30s on focus if needed | Low |
| Tool Runs | SSE for status; separate log stream | Drawer open; log stream only when expanded | 10–15s for active runs | Medium, isolate logs |

### Downloads

Use SSE as the primary mechanism.

Fallback polling should be conservative:

```txt
If SSE disconnected and active downloads exist:
  poll /api/downloads/active every 3–5s
Otherwise:
  no polling
```

Do not poll completed history aggressively.

### Saved Files

Saved Files are usually low-churn.

Prefer:

- SSE event when artifact is created/deleted.
- React Query / TanStack Query invalidation on event.
- Refetch on drawer focus if needed.

Fallback:

```txt
Poll only when:
- drawer is open
- Saved Files tab is active
- SSE is unavailable
```

A 20–30 second interval is usually enough.

### Tool Runs

Tool Runs have two layers:

1. Run list metadata:
   - tool name
   - status
   - duration
   - started at

2. Raw logs:
   - high volume
   - only needed when expanded

Use the main activity stream for run lifecycle events:

```txt
tool_run.created
tool_run.started
tool_run.completed
tool_run.failed
```

Use a dedicated log stream only when a run is expanded:

```http
GET /api/tool-runs/{id}/logs/stream
```

When collapsed, stop consuming logs.

---

## 1.8. Recommended client data layer

A clean combination is:

- **TanStack Query** for snapshots and caching.
- **Zustand / Jotai / Redux slice** for live ephemeral state.
- **SSE/WebSocket manager** for event ingestion.

Example division:

```txt
TanStack Query:
  - initial list fetch
  - pagination
  - filters
  - historical records

Live store:
  - active download progress
  - streaming run status
  - live log tail buffers
```

When an SSE event arrives:

```ts
activityBus.on("download.progress", event => {
  updateDownloadProgress(event.id, {
    percent: event.percent,
    speed: event.speed,
    eta: event.eta,
  });
});

activityBus.on("download.completed", event => {
  queryClient.invalidateQueries(["downloads"]);
});

activityBus.on("artifact.created", event => {
  queryClient.invalidateQueries(["saved-files"]);
});

activityBus.on("tool_run.completed", event => {
  queryClient.invalidateQueries(["tool-runs"]);
});
```

This avoids treating every event as a full list refetch.

---

## 1.9. Preventing unnecessary re-renders

A few rules that matter a lot here:

### Use memoized row components

```tsx
const DownloadRow = memo(function DownloadRow({ id }: { id: string }) {
  const task = useDownloadTask(id);
  const progress = useDownloadProgress(id);
  return <div>...</div>;
});
```

### Avoid passing new object literals as props

Bad:

```tsx
<DownloadRow task={tasks[id]} progress={{ percent: 42 }} />
```

Better:

```tsx
<DownloadRow id={download.id} />
```

Let the row select its own data.

### Virtualize long lists

For 50+ records, use:

- `react-window`
- `@tanstack/react-virtual`
- `react-virtuoso`

Virtualization is especially useful for:

- Saved Files
- Tool Runs
- Logs

### Keep tab filters in shallow state

If the user switches tabs, preserve:

- search text
- active filter chips
- scroll position
- expanded rows

You can either:

- keep tab panes mounted but hidden, or
- persist UI state in a lightweight store.

For performance, I would usually keep the active tab mounted and lazily mount the others, while preserving filters in state.

---

## 1.10. Drawer behavior when closed

A good policy:

```txt
If active downloads or active tool runs exist:
  keep the activity stream connected
Else:
  disconnect after a grace period
```

When the drawer reopens:

1. Fetch a lightweight snapshot.
2. Compare against last cursor/version.
3. Apply missing events or refetch.

This prevents the drawer from feeling stale without keeping unnecessary connections alive forever.

---

# 2. Visual hierarchy for scanning 50+ records

For high-volume activity panels, avoid overly “cardy” cards. Heavy borders, shadows, and large padding create visual noise.

Instead, use a **dense list-row pattern** with strong grouping.

---

## 2.1. Shared row anatomy

Each row should have three zones:

```txt
[Identity]              [Status/Metrics]        [Actions]
```

Example:

```txt
[icon] Lecture Part 2       42% • 1.8 MB/s • 35s      [Cancel]
       youtube.com
```

Use:

- one primary title
- one secondary metadata line
- one status indicator
- one primary action
- overflow menu for secondary actions

### General styling rules

Use:

```txt
Row height:       56–64px comfortable, 44–48px compact
Title:            13–14px, medium/semibold
Secondary text:   12px, muted
Badges:           10–11px, subdued
Numerics:         tabular-nums
Borders:          hairline dividers, not boxed cards
Actions:          visible on hover/focus, except primary state actions
```

Tailwind-ish example:

```tsx
<div className="flex items-center gap-3 px-4 py-3 hover:bg-neutral-50">
  <div className="min-w-0 flex-1">
    <div className="truncate text-sm font-medium text-neutral-900">
      {title}
    </div>
    <div className="truncate text-xs text-neutral-500">
      {subtitle}
    </div>
  </div>

  <div className="flex shrink-0 items-center gap-3 text-xs tabular-nums text-neutral-600">
    {metrics}
  </div>

  <div className="flex shrink-0 items-center gap-2">
    {actions}
  </div>
</div>
```

---

## 2.2. Downloads tab hierarchy

This tab should feel operational. The user wants to know:

1. Is it active?
2. How far along is it?
3. Is something wrong?
4. Can I stop/clear it?

### Recommended grouping

Pin active tasks first:

```txt
Active
- Downloading
- Queued
- Starting
- Cancelling

Needs Attention
- Failed
- Cancelled

Completed
- Finished
```

Or simpler:

```txt
In progress
Failed
Completed
```

### Row layout

For active download:

```txt
[spinner] Interview Ep. 12                    42%  1.8 MB/s  35s   [Cancel]
          youtube.com
          [====================>        ]
```

For completed:

```txt
[check] Interview Ep. 12                      128 MB  Completed   [Clear]
        youtube.com
```

For failed:

```txt
[alert] Interview Ep. 12                      Failed: network timeout [Retry]
        youtube.com
```

### Visual guidance

- Progress bar should be the dominant visual element.
- Use color sparingly:
  - blue / indigo for active
  - amber for queued or retrying
  - red for failed
  - green only for completed, if needed
- Use monospaced numerals for percent/speed/ETA.
- Do not show both status badge and progress bar unless necessary.
- Clear history should be a list-level action, not per-row only.

### Suggested toolbar

```txt
Downloads (3 active)        [Clear completed] [Clear failed]
```

If no active downloads:

```txt
No active downloads
Downloads started from tools appear here.
```

Since you removed inline URL input, do not reintroduce a form here. Instead, if needed, use a passive empty-state link:

```txt
Start a download from a tool to see it here.
```

---

## 2.3. Saved Files tab hierarchy

This tab is more inventory-like. Users scan by:

- file type
- language
- source tool
- created time
- whether it can be reused

### Recommended grouping/filtering

Use type filter chips:

```txt
All   Video   Audio   Subtitles   Text   Other
```

Or if you have many files:

```txt
All | Video | Audio | [EN SRT] | [VTT] | Transcripts | Exports
```

Default sort:

```txt
Newest first
```

Secondary sorts:

```txt
Name
Size
Type
Source tool
```

### Row layout

For subtitle file:

```txt
[file-icon] interview.en.srt                  18 KB • 2h ago        [Use as Input] [Copy Path]
            [EN SRT] • Transcriber • /artifacts/interview.en.srt
```

For audio:

```txt
[file-icon] podcast_audio.mp3                 48 MB • Today         [Use as Input] [Copy Path]
            [AUDIO] • Extractor • /artifacts/podcast_audio.mp3
```

### Badge strategy

Do not over-badge.

For 50+ files, too many colored badges become noise.

Good:

```txt
[EN SRT]
[VTT]
[AUDIO]
[VIDEO]
[TRANSCRIPT]
```

Better if combined:

```txt
EN · SRT
```

Use color only for broad category:

```txt
Video      indigo
Audio      violet
Subtitles  teal
Text       amber
Other      gray
```

Keep badge backgrounds subtle:

```txt
bg-teal-50 text-teal-700 ring-teal-200
```

not:

```txt
bg-teal-500 text-white
```

### Path handling

Server-side paths can be long.

Show:

```txt
/artifacts/interview.en.srt
```

Truncate middle if needed:

```txt
/artifacts/.../interview.en.srt
```

Actions:

- `Copy Path` should be icon-only with tooltip.
- `Use as Input` should be the primary affordance.
- Overflow menu can contain:
  - Rename
  - Delete
  - Download
  - Reveal source run

### Recommended row actions

Visible:

```txt
[Use as Input] [Copy Path]
```

Overflow:

```txt
Download
Delete
View source run
```

If space is tight:

```txt
[Use as Input] [⋯]
```

with Copy Path inside overflow, unless Copy Path is a frequent user action.

---

## 2.4. Tool Runs tab hierarchy

This tab should feel like an execution timeline.

Users care about:

1. Which tool ran?
2. Did it succeed?
3. How long did it take?
4. What input/output did it produce?
5. Where did it fail?

### Row layout

Collapsed run:

```txt
[tool-icon] Transcriber                       Success • 2m 14s       [Expand]
            interview.mp3 → interview.en.srt
```

Failed run:

```txt
[tool-icon] Translator                        Failed • 00:18         [Expand]
            interview.en.srt → interview.es.srt
            Error: target language not supported
```

Running:

```txt
[spinner] Translator                          Running • 00:07        [Expand]
          interview.en.srt → interview.es.srt
```

### Use expandable rows, not dense log previews

Do not show raw logs inline by default.

Use expandable detail:

```txt
[Run summary]
[Inputs/Outputs]
[Parameters]
[Logs]
```

Inside expanded state:

```txt
Status: Completed
Started: 18:02:11
Duration: 2m 14s
Input: interview.mp3
Output: interview.en.srt

Logs
--------------------------------------------------
[18:02:11] Starting transcription
[18:02:12] Detected language: en
[18:03:40] Segment 214/220
[18:04:25] Completed
```

### Log UX

For logs:

- monospace font
- level coloring, subtle
- autoscroll toggle
- wrap/unwrap toggle
- copy logs
- download logs
- virtualize if long

Good log toolbar:

```txt
Autoscroll [on]   Wrap [off]   Copy   Download
```

### Grouping

For many runs, group by day:

```txt
Today
  Transcriber — Success
  Translator — Failed
Yesterday
  Trimmer — Success
```

Or by status if operational monitoring is more important:

```txt
Running
Failed
Completed
```

For a general activity timeline, date grouping is usually better.

---

## 2.5. Making 50+ records effortless

A few high-leverage features:

### Sticky filter bar

```txt
Search files...       Type: All ▾     Source: All ▾     Sort: Newest ▾
```

### Saved filter chips

For Saved Files:

```txt
All
Video
Audio
Subtitles
Transcripts
English
Spanish
```

For Tool Runs:

```txt
All
Running
Failed
Transcriber
Translator
Trimmer
```

### Summary counts

In the tab bar:

```txt
Downloads     Saved Files     Tool Runs
    3             128             42
```

Use active-state emphasis:

```txt
Downloads (3)
```

### Bulk actions

For Downloads:

```txt
Clear completed
Clear failed
Cancel all active
```

For Saved Files:

```txt
Delete selected
Copy paths selected
```

For Tool Runs:

```txt
Clear old runs
Retry failed
```

But keep bulk actions secondary. Do not clutter the default state.

### Accessibility

Important for live activity UI:

- Use `aria-live="polite"` sparingly for major status changes.
- Avoid announcing every progress tick.
- Progressbars should expose:
  ```html
  role="progressbar"
  aria-valuenow={42}
  aria-valuemin={0}
  aria-valuemax={100}
  ```
- Ensure hover actions are keyboard accessible.
- Do not rely on color alone for status; use icon + text.

---

# 3. “Use as Input” compatibility and piping UX

This is the most product-design-sensitive part.

The goal is to make piping feel safe and obvious:

> “This file can be used here, and here is what will happen.”

Not:

> “I clicked a button and now the wrong tool opened.”

---

## 3.1. Model compatibility on the backend

Do not hardcode compatibility only in the frontend.

Each tool should declare an input policy.

Example:

```json
{
  "tool": "translator",
  "displayName": "Translator",
  "accepts": [
    {
      "kind": "subtitle",
      "formats": ["srt", "vtt"]
    },
    {
      "kind": "text",
      "formats": ["txt", "md"]
    }
  ],
  "rejects": [
    {
      "kind": "video",
      "reason": "Translator cannot process raw video. Transcribe it first."
    }
  ]
}
```

Artifact metadata:

```json
{
  "id": "art_123",
  "filename": "interview.en.srt",
  "kind": "subtitle",
  "format": "srt",
  "language": "en",
  "sizeBytes": 18233,
  "sourceTool": "transcriber",
  "serverPath": "/artifacts/interview.en.srt"
}
```

Then provide a compatibility endpoint:

```http
GET /api/artifacts/{id}/compatible-tools
```

Response:

```json
{
  "artifactId": "art_123",
  "compatible": [
    {
      "tool": "translator",
      "reason": "Subtitle file can be translated directly.",
      "recommended": true
    },
    {
      "tool": "subtitle_cleaner",
      "reason": "Subtitle file can be cleaned or normalized.",
      "recommended": false
    }
  ],
  "partiallyCompatible": [
    {
      "tool": "summarizer",
      "reason": "Can summarize transcript text after conversion.",
      "suggestedPipeline": ["convert_to_text", "summarizer"]
    }
  ],
  "incompatible": [
    {
      "tool": "trimmer",
      "reason": "Trimmer requires audio or video, not subtitles."
    }
  ]
}
```

This gives you one source of truth.

---

## 3.2. Pipe by artifact ID, not raw path

Even though you show Copy Path, the actual “Use as Input” action should use a stable artifact identifier.

Good API payload:

```json
{
  "tool": "translator",
  "inputArtifactId": "art_123",
  "parameters": {
    "targetLanguage": "es"
  }
}
```

Avoid:

```json
{
  "tool": "translator",
  "inputPath": "/artifacts/interview.en.srt"
}
```

Why?

- Artifact may move.
- Artifact may be deleted.
- Metadata may be needed.
- Permissions/validation are easier.
- Lineage tracking becomes cleaner.

Keep Copy Path as a convenience for humans, but make the machine action ID-based.

---

## 3.3. Interaction model for “Use as Input”

You have two good options.

---

## Option A: Smart tool picker modal

Best if users may want to choose among multiple tools.

Flow:

```txt
Saved File row
  -> click Use as Input
  -> modal opens
  -> source file chip appears
  -> compatible tools listed
  -> user selects tool
  -> parameters appear
  -> run
```

Modal example:

```txt
Use as Input
--------------------------------------------------
Source
[subtitle icon] interview.en.srt
EN · SRT · 18 KB · From Transcriber

Choose a tool
--------------------------------------------------
Translator                 Recommended
Translate subtitle to another language.
Compatible with SRT.

Subtitle Cleaner
Normalize timing and formatting.
Compatible with SRT.

Trimmer                    Not compatible
Requires audio or video.
```

This is the safest model.

---

## Option B: Split button with compatible tools

Best if there is usually one obvious target.

Row button:

```txt
[Use as Input ▾]
```

Clicking the main button opens the best default tool.

Dropdown:

```txt
Translator
Subtitle Cleaner
Convert to Text
```

This is faster for repeat users, but requires confidence in the default.

I would recommend:

- **Option A** as the default architecture.
- **Option B** only if user testing shows a dominant default action.

---

## 3.4. How to communicate compatibility inside the target tool modal

When the user selects a tool, the modal should immediately answer:

1. What file am I using?
2. Is it compatible?
3. Why?
4. What will be produced?
5. Are there missing requirements?

### Source chip

At the top of the modal:

```txt
Input
[subtitle] interview.en.srt
EN · SRT · 18 KB
```

With a small compatibility line:

```txt
Compatible with Translator
```

or:

```txt
Not compatible with Trimmer
```

### Compatibility badge

Use a clear inline badge:

```txt
[Compatible]
```

or:

```txt
[Requires conversion]
```

or:

```txt
[Not compatible]
```

Colors:

```txt
Compatible           green / emerald
Partially compatible amber
Incompatible         red / gray
```

But always pair color with text.

### Helper copy

Good:

```txt
This SRT file can be translated directly.
```

Good:

```txt
This MP4 contains audio and can be transcribed.
```

Good:

```txt
Translator accepts subtitles or text. This file is video. Transcribe it first.
```

Avoid vague errors:

```txt
Invalid input.
```

---

## 3.5. Compatibility states

Design explicit states.

---

### State 1: Directly compatible

Example:

```txt
SRT -> Translator
Audio -> Transcriber
Video -> Trimmer
```

UI:

```txt
[Compatible] This file can be used directly.
```

CTA:

```txt
Run Translator
```

---

### State 2: Compatible with warning

Example:

```txt
Large video file -> Transcriber
Subtitle file with unknown language -> Translator
```

UI:

```txt
[Compatible with warning]
This file is large. Transcription may take several minutes.
```

or:

```txt
Language could not be detected automatically. Please confirm it.
```

CTA remains enabled, but user confirmation may be required.

---

### State 3: Requires intermediate step

Example:

```txt
MP4 -> Translator
```

Translator cannot take video directly, but the user’s intent may be:

```txt
Translate spoken content into another language
```

In that case, show a pipeline suggestion:

```txt
Not directly compatible
Translator needs text or subtitles.

Suggested pipeline:
1. Transcribe video
2. Translate transcript
```

CTA:

```txt
Run pipeline
```

or:

```txt
Transcribe first
```

This is a very strong UX pattern because it preserves user intent instead of just blocking them.

---

### State 4: Incompatible

Example:

```txt
SRT -> Trimmer
Text transcript -> Audio Normalizer
```

UI:

```txt
Not compatible
Trimmer requires audio or video. This file is a subtitle file.
```

Actions:

```txt
Choose another tool
View compatible tools
```

Do not let the user submit a known-invalid job.

---

## 3.6. Show accepted input requirements in the tool modal

The tool modal should include a compact requirements row.

Example:

```txt
Accepted inputs: SRT, VTT, TXT
Max size: 100 MB
```

Then show the current file:

```txt
Current input: interview.en.srt ✓
```

If mismatch:

```txt
Current input: interview.mp4 ✗
This tool accepts subtitles or text, not video.
```

This is clearer than only saying “invalid”.

---

## 3.7. Recommended tool list inside the picker

When the user clicks “Use as Input”, order tools like this:

```txt
Recommended
Compatible
Requires conversion
Incompatible
```

Or hide incompatible by default:

```txt
Show incompatible tools
```

For most users, I would show:

```txt
Recommended
Compatible
```

and collapse incompatible behind a toggle.

If showing incompatible, disable them and provide the reason.

Example:

```txt
Translator          Recommended
Subtitle Cleaner    Compatible
Trimmer             Not compatible — requires media
```

---

## 3.8. Row-level tooltip / hover hint

The row action can reveal compatibility before click.

Tooltip:

```txt
Use as Input
Compatible with Translator, Subtitle Cleaner
```

For no compatible tools:

```txt
No compatible tools available
```

For mixed:

```txt
Use as Input
Direct: Translator
Indirect: Summarizer
```

This helps users understand the shortcut without opening a modal.

---

## 3.9. Example UX flow

Saved Files row:

```txt
[interview.en.srt]
[EN SRT] • 18 KB • Transcriber
[Use as Input] [Copy Path]
```

User clicks `Use as Input`.

Modal opens:

```txt
Use as Input
--------------------------------------------------
Source file
interview.en.srt
EN · SRT · 18 KB

Recommended tools
--------------------------------------------------
Translator
Translate subtitles into another language.
Compatible with SRT.

Subtitle Cleaner
Normalize timing, spacing, and formatting.
Compatible with SRT.

Other options
--------------------------------------------------
Summarizer
Requires text conversion first.
```

User selects Translator.

Modal becomes:

```txt
Translate subtitle
--------------------------------------------------
Input
interview.en.srt ✓

Source language
English (detected)

Target language
Spanish

Output
interview.es.srt

[Run Translator]
```

This feels deliberate without being heavy.

---

# 4. Suggested component architecture

A clean React structure might look like this:

```txt
ActivityDrawer/
  ActivityDrawer.tsx
  ActivityTabs.tsx

  downloads/
    DownloadsPanel.tsx
    DownloadsToolbar.tsx
    DownloadList.tsx
    DownloadRow.tsx
    DownloadProgressBar.tsx

  files/
    SavedFilesPanel.tsx
    SavedFilesToolbar.tsx
    SavedFileList.tsx
    SavedFileRow.tsx
    UseAsInputModal.tsx
    ToolCompatibilityList.tsx

  runs/
    ToolRunsPanel.tsx
    ToolRunsToolbar.tsx
    ToolRunList.tsx
    ToolRunRow.tsx
    ToolRunExpanded.tsx
    ToolRunLogs.tsx

state/
  activityStream.ts
  downloadsStore.ts
  filesStore.ts
  toolRunsStore.ts
  useDownloadProgress.ts
  useToolRunLogs.ts

api/
  activityApi.ts
  downloadsApi.ts
  filesApi.ts
  toolRunsApi.ts
  compatibilityApi.ts
```

---

# 5. FastAPI event design considerations

On the backend, keep event emission separate from business logic.

A good pattern:

```txt
Service performs action
  -> writes DB record
  -> emits domain event
  -> SSE broadcaster sends event to connected clients
```

Example events from services:

```txt
download_service.start_download()
download_service.update_progress()
download_service.complete_download()

artifact_service.register_artifact()
artifact_service.delete_artifact()

tool_run_service.start_run()
tool_run_service.append_log()
tool_run_service.finish_run()
```

If you run multiple workers, use a pub/sub layer:

```txt
Redis Pub/Sub
Postgres LISTEN/NOTIFY
message queue
```

Otherwise, one worker may not be able to broadcast to SSE clients connected to another worker.

---

# 6. Practical implementation checklist

If I were prioritizing this build, I would do it in this order:

---

## Phase 1: Stability

- Move SSE/WebSocket connection out of drawer tabs.
- Create one activity stream provider.
- Add event IDs/cursors.
- Add reconnect and backfill.
- Separate download progress from list state.

---

## Phase 2: Performance

- Memoize rows.
- Virtualize lists.
- Throttle progress events.
- Stream logs only when expanded.
- Use query invalidation instead of full polling.

---

## Phase 3: Scannability

- Convert heavy cards into dense list rows.
- Add filters and counts.
- Add grouping for Downloads and Tool Runs.
- Add type filters for Saved Files.
- Reduce badge color noise.

---

## Phase 4: Smart piping

- Add artifact metadata model.
- Add tool compatibility manifest.
- Add `/api/artifacts/{id}/compatible-tools`.
- Build Use as Input modal.
- Add pipeline suggestions for indirect compatibility.

---

# 7. My recommended final UX position

For your app, I would make these concrete choices:

## Drawer structure

```txt
Activity & Records
--------------------------------------------------
Downloads (3)   Saved Files   Tool Runs
--------------------------------------------------
[Tab content as dense virtualized list]
```

## Downloads

```txt
Pinned active tasks
Slim progress bars
Minimal badges
List-level clear actions
```

## Saved Files

```txt
File icon + filename
One combined format/language badge
Muted metadata line
Primary action: Use as Input
Secondary action: Copy Path
Overflow for less common actions
```

## Tool Runs

```txt
Timeline grouped by day
Collapsed rows show tool, status, duration
Expanded rows show input/output and logs
Logs streamed only when expanded
```

## Use as Input

```txt
Open a modal with source artifact chip.
Show compatible tools first.
Explain incompatibilities in plain language.
Offer pipelines when a direct tool is not compatible.
Use artifact ID for the actual API call.
```

---

The end result should feel like this:

- The drawer is always live, but never noisy.
- Switching tabs is instant and does not interrupt streams.
- Long lists feel calm and scannable.
- “Use as Input” feels intelligent, not ambiguous.

### grok 4.5 Recommendation
# Architectural & UX Breakdown: Activity & Records Drawer

## 1. State Synchronization & Polling/SSE Partitioning

Goal: tab switches must be cheap (no cascade re-renders, no dropped streams). Treat the drawer as a **shell** that owns connection lifetime; tabs are **pure subscribers**.

### Recommended Partition

```
App / Drawer Shell
├── ConnectionManager (singleton, lives for drawer open lifetime)
│   ├── SSE / WebSocket client (one persistent stream)
│   ├── Polling scheduler (fallback or hybrid)
│   └── Event bus / store updater
├── Normalized Store (Zustand / Jotai / Redux Toolkit / TanStack Query + external store)
│   ├── downloads: NormalizedEntityState
│   ├── savedFiles: NormalizedEntityState
│   └── toolRuns: NormalizedEntityState
└── Tab Panels (lazy, memoized)
    ├── DownloadsTab  → selectDownloads
    ├── SavedFilesTab → selectSavedFiles
    └── ToolRunsTab   → selectToolRuns
```

### Concrete Rules

**A. Single connection owned by the shell**
- Open the SSE/WebSocket (or start the poller) when the drawer mounts / becomes visible.
- Close it only when the drawer unmounts or the user explicitly disables live updates.
- Never tie the socket to the active tab. Tab switches must not call `connect()` / `disconnect()`.

**B. Push into a normalized store, not into React state inside tabs**
- Incoming events are reduced into entity maps + id lists:
  ```ts
  downloads: { byId: Record<string, Download>, allIds: string[], activeIds: string[] }
  ```
- Tabs only read via selectors. Because the data is already normalized, a progress update to one download touches one object and only re-renders the row that selected it (if you use shallow/compare or per-row subscriptions).

**C. Hybrid transport**
- **SSE or WebSocket** for true live entities (active downloads, running tool jobs). Payload = thin deltas (`{ id, progress, speed, eta, status }`).
- **HTTP polling or TanStack Query** for archival lists (completed downloads history, saved files, past tool runs). Longer staleTime (15–60s); invalidate on relevant SSE events (`download.finished` → invalidate `savedFiles`).
- Fallback: if SSE drops, the shell automatically switches the active set to polling without unmounting tabs.

**D. Render isolation**
- `React.memo` each row.
- Per-row subscription pattern (Zustand `useStore(s => s.downloads.byId[id])` or Jotai atoms per entity) so a 1% progress tick on download #47 does not re-render the other 49 rows.
- Tab panels themselves are memoized and receive only the list of ids + a stable callback bag. Switching tabs is just CSS/`hidden` or conditional render of an already-mounted panel (keep-alive) if you want to preserve scroll position; otherwise lazy-mount is fine because the store already has the data.

**E. Scroll & selection preservation**
- Store `scrollTop` and selected id per tab in the shell store so revisiting a tab restores position instantly.
- Avoid keying the whole list by `activeTab` (that forces remount).

**F. Cancellation & cleanup**
- Cancel buttons dispatch to the shell; the shell sends the cancel command and optimistically flips status. The socket stream continues uninterrupted.
- “Clear history” is a store action + API call; it never tears down the connection.

### Minimal Event Contract (SSE)
```ts
type ServerEvent =
  | { type: 'download.updated'; id: string; patch: Partial<Download> }
  | { type: 'download.terminal'; id: string; status: 'completed' | 'failed' | 'cancelled' }
  | { type: 'toolrun.updated'; id: string; patch: Partial<ToolRun> }
  | { type: 'savedfile.created'; file: SavedFile }  // triggers list refresh or insert
```

Shell reduces these directly. Tabs never see the raw socket.

---

## 2. Visual Hierarchy for Scan-Friendly Cards (50+ rows)

Design each tab around **one scannable primary column**, dense secondary metadata, and progressive disclosure. Aim for a spreadsheet-like rhythm rather than chunky cards.

### Shared List Patterns
- **Sticky compact header** with column labels + filter/search + bulk actions.
- **Fixed row height** (or very tight variable height) for stable virtualization.
- **Virtualize** (`react-virtual` / TanStack Virtual) once you expect > ~40 rows.
- **Zebra or hairline separators**, not heavy cards with shadows.
- **Left accent bar** or tiny status dot for state (running / success / error / queued).
- **Monospace for technical bits** (speeds, durations, paths); sans for titles.
- **Hover reveals** action cluster (right side); only the most critical action is always visible.
- **Relative timestamps** (“2m ago”) with absolute on hover.
- Truncate long names with middle ellipsis for paths/URLs; full value in tooltip.

### Tab-Specific Hierarchy

#### Downloads (live + history)
```
[●] Title / URL (primary, 1 line)
    ████████░░  68%   4.2 MB/s   ETA 1:12   [Cancel]
    video • mp4 • 1080p          started 2m ago
```
- **Primary**: content title or prettified URL.
- **Secondary (same row)**: progress bar + % + speed + ETA (only while active).
- **Tertiary**: format/quality badges, start time, final size when done.
- Terminal rows collapse the progress bar into a status chip (`Completed`, `Failed`, `Cancelled`) + “Clear” action.
- Grouping: optional sticky sub-headers “In progress” / “Today” / “Earlier” (sorted in store).

#### Saved Files
```
[VIDEO]  interview_raw.mp4                 1.2 GB   3h ago
         /data/jobs/…/interview_raw.mp4    [Copy Path]  [Use as Input ▾]
```
- **Primary**: filename (dominant weight).
- **Leading badge**: format family — `VIDEO` `AUDIO` `EN SRT` `VTT` `JSON` etc. Color-code by family (media vs captions vs data), not by random hue.
- **Secondary**: size • relative time • optional source tool.
- **Tertiary (muted, 1 line)**: path (truncated).
- Actions always available: Copy Path (icon button with toast), Use as Input (button or split button).
- Optional light filters: type chips (`All`, `Video`, `Audio`, `Captions`).

#### Tool Runs
```
[✓] Transcriber    1:24    finished 12m ago
    whisper-large • en • 2 outputs
    ▸ Logs
```
- **Primary**: tool name + status icon.
- **Secondary**: duration (monospace) + relative finish time.
- **Tertiary**: short param summary (model, language, key flags) — single truncated line.
- **Disclosure**: expandable raw log drawer (virtualized, monospace, auto-scroll if live). Do not embed multi-line logs in the default row.
- Failed runs: red accent + first error line as the tertiary text.

### Density Tokens (Tailwind-oriented)
- Row py: `py-1.5` or `py-2`
- Title: `text-sm font-medium text-gray-900 dark:text-gray-100`
- Meta: `text-xs text-gray-500`
- Badges: `text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded`
- Action icons: `opacity-0 group-hover:opacity-100` (always visible on touch breakpoints)

This keeps 50–100 rows readable without turning the drawer into a wall of cards.

---

## 3. “Use as Input” — Communicating Target Tool Compatibility

The shortcut must answer three questions instantly:
1. What will receive this file?
2. Is it compatible?
3. What happens next?

### Interaction Model
Prefer a **split button** or single button that opens a **tool picker popover** (not a blind auto-route), unless the file type has exactly one obvious consumer.

```
[ Use as Input ▾ ]
  ├─ Transcriber          ✓ audio/video
  ├─ Translator           ✓ captions
  ├─ Trimmer              ✓ video
  └─ … 
     (incompatible tools shown disabled with reason)
```

### Compatibility Engine (client-side, pure)
Maintain a static manifest:
```ts
const toolInputs: Record<ToolId, {
  accept: MimeFamily[]           // 'video' | 'audio' | 'caption' | 'json' | …
  exts?: string[]
  multiple?: boolean
  transform?: (file: SavedFile) => InputPayload
}>
```
- Derive `MimeFamily` from the saved file’s format badge / extension / server-provided `kind`.
- Picker lists tools in three tiers:
  - **Recommended** (hard match)
  - **Compatible** (soft match, e.g. video → Transcriber)
  - **Incompatible** (disabled, with one-line reason: “Requires captions (SRT/VTT)”)

### UX Feedback Loop
1. User clicks **Use as Input** on a saved file.
2. Popover shows tools with status:
   - Green check / default row = compatible
   - Muted + tooltip = incompatible
   - Optional “Open anyway” for power users (pre-fills what it can, marks the field dirty/invalid).
3. On choose:
   - Close drawer (or leave open — prefer closing on small viewports).
   - Open the target tool modal/route with the file **pre-bound** to the correct input field.
   - Show a persistent chip inside the modal:  
     `Input: interview_raw.mp4  [VIDEO]  ×`  
     so the user sees the binding and can clear it.
4. If the tool was already open with unsaved state, prompt: “Replace current input?” (Don’t silently overwrite).

### Affordance Details
- Badge on the button when only one tool matches: `Use in Transcriber` (skips the menu).
- Keyboard: Enter on a row opens the picker; number keys or typeahead select the tool.
- Toast on success: “Sent to Transcriber”.
- If the file is still being written (download not finished), disable the action with reason “Available when download completes”.

### Why this works
- Explicit picker = no surprise routing.
- Disabled+reason = teaches the capability model without docs.
- Pre-bound chip inside the tool modal closes the loop visually.
- Client-side manifest keeps the interaction instant and keeps the drawer free of form logic (aligned with your decision to remove the inline URL form).

---

## Quick Implementation Checklist

| Area | Do |
|---|---|
| Connection | One SSE/WS in drawer shell; tabs are selectors only |
| Store | Normalized entities + per-row subscriptions |
| Lists | Virtualized, fixed/dense rows, hover actions |
| Downloads row | Title → progress/speed/ETA → format meta |
| Saved Files row | Badge + filename → size/time → path; Copy / Use as Input |
| Tool Runs row | Tool + status → duration/time → param summary; logs collapsed |
| Use as Input | Picker with compatible/disabled tiers → pre-fill tool modal + input chip |

This keeps the drawer a pure **records & activity viewer**, scales to dozens of rows, and makes cross-tool piping discoverable without clutter or brittle socket lifecycles.

### opus 4.8 thinking Recommendation
# Activity & Records Drawer: Architecture & UX Breakdown

Good instinct removing the inline form—keeping the drawer a pure read/act surface (not an input surface) is the right separation of concerns. Here's a breakdown across your three questions.

---

## 1. State Synchronization & Streaming Partitioning

The core principle: **decouple the data lifecycle from the view lifecycle.** Tab switching is a UI concern and should never touch your connection layer.

### Lift streams above the tabs

Don't let any tab component own a socket/SSE connection. If a connection lives inside `<DownloadsTab>`, unmounting it (via tab switch) drops the stream. Instead:

```
<DrawerProvider>          ← owns connections, lives as long as drawer is mounted
  ├── connection manager (SSE/WS)
  ├── normalized stores (downloads, files, runs)
  └── <DrawerTabs>        ← purely presentational, mount/unmount freely
```

Keep connections alive at the provider level (or in a global store like Zustand/Jotai outside React's tree entirely). Tabs become **subscribers**, not **owners**.

### Recommended transport split

| Data | Transport | Why |
|------|-----------|-----|
| Downloads (progress %, speed, ETA) | **SSE or WS** | High-frequency, push-driven, per-task |
| Tool Runs (status transitions, logs) | **SSE** | Event-stream is a natural fit; logs are append-only |
| Saved Files | **Polling / invalidation** | Low churn; refetch on run-completion events |

For Saved Files, don't poll aggressively. Instead, let a *completed* download or tool-run event **invalidate** the files query (React Query's `invalidateQueries`). This way "Saved Files" updates reactively without its own timer.

### Avoiding re-render storms with 50+ live records

The killer problem: one download ticking progress every 250ms re-rendering the entire list.

- **Normalize state by ID** (`Record<string, DownloadTask>`), not arrays. Selectors subscribe to individual IDs.
- **Atomize with a store that supports granular subscriptions** (Zustand with selectors, or Jotai atom-per-record). Each `<DownloadCard>` subscribes only to its own record:

```tsx
function DownloadCard({ id }: { id: string }) {
  // re-renders ONLY when this task changes
  const task = useDownloadStore(s => s.byId[id]);
  return <Card task={task} />;
}
```

- The list component subscribes only to the **array of IDs** (order), not the record contents. Adding/removing a task re-renders the list shell; progress ticks re-render only the individual card.
- **Throttle inbound events** at the ingestion layer (not the render layer). Coalesce rapid progress updates to ~4–10 fps before committing to the store. yt-dlp can emit very fast; batch them with a `requestAnimationFrame` or 200ms flush buffer.

### Keep inactive tabs mounted but frozen

Instead of unmounting hidden tabs (which loses scroll position + causes remount cost), keep them mounted with `hidden`/`display:none` OR use `content-visibility: auto`. But—suspend their expensive work:

- Cards in a hidden tab should stop re-rendering. Since progress updates flow into the store regardless, when the user returns the tab reflects current truth instantly (no "catch-up" flicker).
- Consider pausing log auto-scroll and virtualization measurement while a tab is hidden.

### Virtualize the lists

For 50+ (and scaling to hundreds), use `@tanstack/react-virtual`. Combined with per-ID subscriptions, only visible cards subscribe and render.

### Connection resilience

- Single multiplexed connection > three separate ones. Tag events with a `channel` (`download` / `run` / `file`) and fan out in the manager.
- Handle reconnect with `Last-Event-ID` (SSE) or a resume cursor. On reconnect, **reconcile** with a REST snapshot to catch missed terminal states.

---

## 2. Visual Hierarchy for Scannable Cards

The goal for 50+ records: the eye should land on **status and identity first**, details second, actions on demand. Use a consistent **three-zone card grid** across all tabs so muscle memory transfers.

```
┌────────────────────────────────────────────────────────┐
│ [●] Primary Identity              [badges]      [⋯/act] │  ← scan row
│     secondary meta · meta · meta                        │  ← detail row
│     ▓▓▓▓▓▓▓▓▓░░░░░░  62%   (contextual, only if live)   │  ← state row
└────────────────────────────────────────────────────────┘
```

### Universal rules

- **Status as a color-coded leading dot/bar**, not a text label competing for attention. Encode status in a 3–4px left border or a leading dot: green (done), blue pulsing (active), amber (queued), red (error), gray (canceled). This lets users scan a vertical list by color alone.
- **One primary line, truncated with `text-ellipsis`.** Filename or URL title—never wrap to 3 lines. Full value in tooltip/expand.
- **Meta as a single dot-separated row** in muted, smaller type (`text-xs text-muted-foreground`). Consistency of position matters more than content.
- **Progressive disclosure:** logs, full paths, and raw metadata live behind an expand chevron or hover-revealed action cluster. Default state is calm.
- **Reserve vertical rhythm.** Fixed card height per type (or two heights: collapsed/expanded). Jitter from variable heights destroys scannability and breaks virtualization math.

### Per-tab specialization

**Downloads**
- Scan row: filename · leading status dot
- State row: progress bar with inline `62% · 4.2 MB/s · ETA 0:45`
- Actions (hover/persistent for active): Cancel (active), Retry (failed), Clear (terminal)
- Completed downloads collapse the progress bar entirely—don't show a 100% bar forever; replace with a subtle "✓ 24.1 MB" summary.

**Saved Files**
- Scan row: filename + **format badge cluster** (see §3)
- Detail row: source tool · size · timestamp
- Actions: `Copy Path` (icon), `Use as Input` (primary), overflow for reveal/download/delete
- Group or filter by format type; a filter chip row above the list (`All · Subtitles · Audio · Video`) beats scrolling.

**Tool Runs**
- Scan row: `Transcriber` (tool icon) · status dot · run label
- Detail row: `2.3s · completed · 3 outputs`
- Expandable raw log region (monospace, virtualized if long, with copy button). Collapsed by default.
- Link outputs back to Saved Files ("3 outputs" → filters Saved Files tab).

### Badge system discipline

Badges are the highest-density signal—keep them a **closed, consistent set**:

```tsx
const badgeStyles = {
  'EN SRT': 'bg-emerald-500/15 text-emerald-400',
  'VTT':    'bg-teal-500/15 text-teal-400',
  'AUDIO':  'bg-violet-500/15 text-violet-400',
  'VIDEO':  'bg-blue-500/15 text-blue-400',
};
```

- Uppercase, monospace-ish, uniform padding, `rounded-sm`. Max ~3 visible badges then `+2`.
- Category = hue, so color reinforces meaning (all subtitle-family = green/teal spectrum).

### Cross-cutting scannability

- **Sticky section date headers** ("Today", "Yesterday") if sorting chronologically.
- **Empty and skeleton states** per tab—never a blank drawer.
- Search/filter bar pinned at drawer top, scoped to active tab.
- Respect `prefers-reduced-motion` for the pulsing active indicator.

---

## 3. 'Use as Input' → Communicating Tool Compatibility

This is the trickiest UX. A `.srt` can't feed a Transcriber; an audio file can't feed a subtitle Translator's video preview. Compatibility must be **legible before the user commits**, and the interaction must not dead-end.

### Model compatibility as data, not hardcoded logic

Define a capability matrix on the backend (single source of truth), surfaced to the client:

```ts
// Each tool declares what it accepts
const toolInputs = {
  transcriber: { accepts: ['AUDIO', 'VIDEO'] },
  translator:  { accepts: ['SRT', 'VTT'] },
  trimmer:     { accepts: ['AUDIO', 'VIDEO'] },
};
```

A saved file's format badges then deterministically resolve which tools are valid targets. Never let the user attempt an invalid pipe and fail—**gate it upstream.**

### Recommended interaction: compatibility-aware target menu

Clicking `Use as Input` shouldn't jump straight into one modal (ambiguous when multiple tools qualify). Instead open a **small target-picker popover** anchored to the button:

```
Use "interview.mp4" as input to:
┌─────────────────────────────────┐
│ ✓ Transcriber        [VIDEO ✓]  │  ← enabled, shows why
│ ✓ Trimmer            [VIDEO ✓]  │
│ ─ Translator                    │  ← disabled
│   Needs SRT or VTT · this is    │
│   VIDEO                     (ⓘ)  │
└─────────────────────────────────┘
```

Key rules:
- **Show incompatible tools, disabled, with the reason inline.** Hiding them creates a "where did my tool go?" confusion. A grayed row with "Needs SRT/VTT" *teaches* the format model.
- **Echo the matching badge** next to compatible tools so the "why" is visible for both states.
- Single compatible target? Skip the popover, open the modal directly (but still validate).

### Carry context into the target modal

When a tool modal opens via this path, it should feel **pre-filled, not pre-empted**:

- Input field pre-populated with the file, shown as a **removable chip** with its badge: `[VIDEO] interview.mp4×`.
- A subtle provenance line: "From Saved Files." So users understand where the value came from and can clear it.
- Don't lock the modal—user may still swap inputs. The pipe is a convenience, not a rail.

### Handle the "almost compatible" case gracefully

Some pipes need a transform (e.g., a VIDEO into a subtitle Translator implies "transcribe first, then translate"). Two clean options:

1. **Suggest a chain:** "Translator needs subtitles. Run Transcriber first? [Transcribe → Translate]" — turns a dead-end into a guided multi-step flow.
2. Keep it strictly gated for v1 (disabled + reason) and add chaining later. Don't silently auto-convert; that hides cost/time from the user.

### Accessibility & feedback

- The popover is a `menu` with proper roles; disabled items use `aria-disabled` + the reason in `aria-description` (not just visual gray).
- On successful pipe, the target modal opening **is** the confirmation—but if it opens elsewhere/collapsed, a toast ("Sent to Transcriber") closes the loop.

---

## Summary of the Load-Bearing Decisions

1. **Connections live above tabs**; tabs are subscribers. Never let view lifecycle kill stream lifecycle.
2. **Normalize by ID + per-record subscriptions + throttled ingestion + virtualization** = smooth 50+ live records.
3. **Files update via event-driven invalidation**, not independent polling.
4. **Uniform three-zone card**, status-as-color, progressive disclosure, closed badge set = effortless scanning.
5. **Compatibility is declarative data**, surfaced as a target picker that *shows and explains* both valid and invalid tools, with context carried into a non-locking modal.

Want me to sketch the store shape (Zustand slices + selectors) or the compatibility-matrix contract between FastAPI and the client next?

## Alternatives Considered
- Evaluated architectural options across 3 model outputs in Agent Query Hub.

---
*Generated from Agent Query Hub: `q-arch-drawer-01`*
