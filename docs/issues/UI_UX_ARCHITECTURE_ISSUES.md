# Issue Backlog — UI/UX + Frontend Architecture Review

> **Source:** [`UI_UX_ARCHITECTURE_REVIEW.md`](file:///home/hruthvik9487/Downloads/drive-download-20260807T051738Z-1-001/tools-workspaces/UI_UX_ARCHITECTURE_REVIEW.md)
> **Date:** 2026-10-02
> **Workspace Root:** `/home/hruthvik9487/Downloads/drive-download-20260807T051738Z-1-001/tools-workspaces`
> **Status:** local backlog, not yet pushed to a GitHub remote. Titles are written to be imported as-is. See **Implementation status — 2026-10-02** below for fix verification.

**Labels in use:** `bug` `a11y` `architecture` `frontend` `backend` `pipeline` `design-system` `test-infra` `quick-win` `tech-debt` `P0-blocker` `P1-high` `P2-medium` `P3-low`

---

## Summary

| # | Title | Labels | Est. |
|---|---|---|---|
| [#1](#issue-1) | Wire up the test suite — no `test` script exists | `test-infra` `P0-blocker` | 5 min |
| [#2](#issue-2) | Introduce a tool→form registry to kill the orphaned-component bug class | `architecture` `frontend` `P0-blocker` | 30 min |
| [#3](#issue-3) | SSE stream drops are silent — canvas spins forever | `bug` `pipeline` `P1-high` | 2 h |
| [#4](#issue-4) | Backend leaks `str(e)` — path disclosure + no error codes | `security` `backend` `P1-high` | 3 h |
| [#5](#issue-5) | No error boundaries — a render throw loses the whole pipeline | `bug` `frontend` `P1-high` | 40 min |
| [#6](#issue-6) | No visible focus indicators app-wide | `a11y` `P0-blocker` | 15 min |
| [#7](#issue-7) | Three hardcoded "system is healthy" indicators | `bug` `design-system` `P1-high` | 1 h |
| [#8](#issue-8) | Extract the canvas god component into testable units | `architecture` `tech-debt` `P2-medium` | 4 h |
| [#9](#issue-9) | Three mirrors of canvas selection state | `architecture` `tech-debt` `P2-medium` | 4 h |
| [#10](#issue-10) | Effect-driven fetching causes refetch loops and stale-response races | `architecture` `frontend` `P2-medium` | 5 h |
| [#11](#issue-11) | Run button is not gated on graph validity | `bug` `pipeline` `P2-medium` | 1 h |
| [#12](#issue-12) | Cyclic graphs silently produce mangled layouts | `bug` `pipeline` `P2-medium` | 45 min |
| [#13](#issue-13) | `branchRun` is half-wired — plumbing exists at both ends | `feature` `pipeline` `P2-medium` | 2 h |
| [#14](#issue-14) | Floor all information-bearing text at 12px | `a11y` `design-system` `quick-win` | 2 h |
| [#15](#issue-15) | Color tokens are dead code — 500 hardcoded hex values | `design-system` `tech-debt` `P3-low` | 3 h |
| [#16](#issue-16) | `setArtifacts` is dead state driving phantom re-renders | `bug` `tech-debt` `quick-win` | 5 min |

**Sequencing:** #1 first (unblocks regression safety for all others) → #2, #5, #6 in parallel → #3, #4 → #8 → #9 → #10.

---

## Implementation status — 2026-10-02

Fixes implemented by the fix-work agents (transport / canvas / forms + independent review); details in [`fix-work/`](fix-work/) reports. This section distinguishes what is verified from what still needs manual integration checks.

### Final gate (run 2026-10-02 on this checkout)

- `npm run verify` (frontend): **52 tests passed, 0 failed**; `tsc -b` clean; `oxlint` 0 errors (warnings only: hook-deps, Fast Refresh, other pre-existing).
- `npm run build` (frontend): passed; pre-existing chunk-size warning (~876 kB JS) remains.
- `PYTHONPATH=backend .venv/bin/python -m pytest backend/tests -q`: **165 passed, 1 skipped** (existing Starlette TestClient deprecation warning).
- `git diff --check`: clean.
- Browser spot check: catalog renders at 1440×900 with no horizontal overflow and no text below 12px.

### Per-issue status

| # | State | Evidence | Remaining manual checks |
|---|---|---|---|
| #1 | Fixed | `test`/`verify` scripts wired; 52 assertions run in the gate. Existing `node:test` runner kept per STATUS_REVIEW (Vitest not adopted); pre-existing `_dbg.test.ts` stays excluded from the runner. | — |
| #2 | Fixed | `lib/toolForms.tsx` + pure `lib/toolIds.ts`; canonical IDs `media.download.yt-dlp`, `subtitle.translate.srt`, `sys.health.check`; catalog and inspector share the registry; starters use canonical IDs; registry/alias tests. | — |
| #3 | Fixed (code) | `AbortSignal`, configurable idle timeout (default 45 s), heartbeats, `STREAM_INTERRUPTED`/`STREAM_STALLED`, reader cleanup, only pending/running nodes marked `interrupted`, Stop backend run / Reconnect status controls, atomic backend run reservations. **SSE replay is not implemented** — Reconnect polls status and refreshes outputs. | Kill the backend mid-run; confirm the disconnect surfaces within the idle window. |
| #4 | Fixed | Structured `{code,message}` at HTTP, SSE, tool-result and non-stream pipeline boundaries; `ApiError(status, code, message)` + `errorMessage`; run modal branches on codes (no Python substring matching); tracebacks logged server-side. Legitimate artifact paths intentionally preserved; route tests assert error fields carry codes and no private paths. | — |
| #5 | Fixed (code) | `ErrorBoundary` (Reload view / Copy diagnostics, sanitized) around app shell, catalog, modal layer and studio panes; inner graph-renderer boundary preserves the canvas toolbar; graph, persistence and execution state owned above the boundaries. | Induce a browser render throw; confirm pane recovery and preserved state. |
| #6 | Fixed (code) | Global `:focus-visible` rule on the `--color-focus-ring` token with `!important`, backing the 44 `focus:outline-none` sites; keyboard node/edge selection wired into the graph reducer (tests cover select/deselect/Escape). Node rewiring stays mouse-only — out of scope, to be filed separately. | Full keyboard-only pass: tab → open modal → run → workspace → select node → edit params → run. |
| #7 | Fixed (code) | `/api/health` returns `{status, version}`; shared `useHealth` poller drives all status displays; host derived from `API_BASE`; single version source. | Stop the backend; confirm indicators go offline, restart restores them. |
| #8 | Fixed | `PipelineCanvas.tsx` 1,523 → 615 lines; layout, history, persistence, graph and run concerns extracted into tested modules/hooks. | — |
| #9 | Fixed | Single graph reducer owns graph/selection/history; mutable command refs and the internal/external selection merge removed; selection and per-node param regression tests. | — |
| #10 | Fixed | No TanStack Query (STATUS_REVIEW: not a prerequisite) — run selection fires zero requests, workspace-scoped aborts and stale-response guards, session-shared cached catalog, per-workspace serialized save sessions with revision-safe retry. | — |
| #11 | Fixed | Debounced auto-validation on semantic graph changes; Run disabled with an inline reason; invalid connections marked; manual Validate retained; execution re-validates overrides and server validity. | — |
| #12 | Fixed | Bounded detection of self/pure/reachable cycles returns the closed path and offending edges; "Creates a cycle" badges; Run blocked; diamond dependency has no false positive; reachable-cycle freeze covered by regression test. | — |
| #13 | Fixed (code) | `onBranch` calls `api.branchRun`; canonical-ID node matching with disambiguation; source params restored; compatible artifacts become downstream file inputs; source/upstream excluded from execution; feedback and actionable errors; missing runs return `RUN_NOT_FOUND` (404). Multi-parent branches report unsupported (backend returns one tool run, not multi-step resume). | Fail a real 3-step pipeline, branch from the last good run, re-run. |
| #14 | Fixed (code) | Information-bearing text floored at 12px; `index.html` gained `description` and `theme-color` metas; catalog browser check at 1440×900 passed (no overflow, no sub-12px text). | Studio-pane visual pass at 1440×900. |
| #15 | Fixed (code) | Zero raw hex literals outside `index.css` (grep-verified); documented z-index scale `--z-panel/sticky/overlay/drawer/modal` + utilities; palette preserved. | Full-app before/after screenshot comparison. |
| #16 | Fixed | Discarded artifact state and both dead fetch paths removed; dock/media consumers refresh via `mediaRefreshKey`. | — |

### Deviations from the acceptance criteria as written

- **#1:** Vitest and a React test plugin were not added; the existing `node:test` runner was preserved per STATUS_REVIEW. `WALKTHROUGH_UI_UX.md` is absent from this checkout, so its §4 gate note could not be updated.
- **#3:** Default idle timeout is 45 s (criterion suggested ~30 s); configurable via `idleTimeoutMs`. No SSE replay.
- **#4 / #10:** Artifact-path responses and `activityStore` deliberately left unchanged.
- **#10:** No server-state library introduced; abort guards, stale-response guards and a session catalog cache instead.
- **#13:** Multi-parent branch resume is reported as unsupported rather than implemented.

### Outstanding manual integration checks (not claimed as passed)

1. Backend disconnect during a live run (#3).
2. Browser render-throw recovery of studio panes (#5).
3. Real failed 3-step branch followed by execution (#13).
4. Full-app before/after screenshot comparison (#15).

### Browser audit follow-up — 2026-10-02

A CDP-driven browser audit ([`fix-work/browser-a11y-audit.md`](fix-work/browser-a11y-audit.md)) verified two of the original manual checks:

- **#7 (health indicators):** backend stop → `OFFLINE` + `VERSION UNAVAILABLE` + "Failed to fetch … Retry Connection"; restart + Retry → `ONLINE`, version and catalog restored. **Verified.**
- **#6 / #14 (keyboard pass, typography, overflow):** visible caramel focus outline on all sampled stops, keyboard tool-modal flow (Enter opens, Escape closes, focus restored), keyboard node selection updating the inspector, zero sub-12px text except the 10px React Flow attribution, no 1440×900 overflow on any audited view, all sampled contrast pairs ≥ 4.5:1. **Verified**; the full pass stopping at pipeline execution was not run.

The audit also found **new defects** (details in the report): the standalone tool modal does not trap focus; three icon-only close buttons lack accessible names; canvas nodes have empty `aria-label`s; three Settings inputs lack programmatic labels; 88 tab stops precede the first canvas node; Escape-to-deselect was inconsistent once. These are not yet fixed.

---

<a id="issue-1"></a>
## Issue #1 — Wire up the test suite: no `test` script exists

**Labels:** `test-infra` `P0-blocker`
**Estimate:** 5 minutes
**Blocks:** #2, #3, #8, #10, #11, #12, #13

### Problem

`frontend/package.json` defines `dev`, `build`, `lint`, and `preview` — but **no `test` script**:

```json
"scripts": {
  "dev": "vite",
  "build": "tsc -b && vite build",
  "lint": "oxlint",
  "preview": "vite preview"
}
```

Four test files exist in `frontend/src/tests/` and are therefore **never executed by any project command**:

- `activityStore.test.ts`
- `toolCompatibility.test.ts`
- `mediaLabels.test.ts`
- `uxFixes.test.ts` / `_dbg.test.ts`

The quality gate recorded in `WALKTHROUGH_UI_UX.md` §4 — *"Build: clean exit, 0 errors / Lint: 0 errors / Both reviews APPROVED"* — cannot detect a single behavioral regression.

This is the highest-priority item in the backlog. `uxFixes.test.ts` contains regression tests written **specifically** for the tool-ID mismatch and pipeline-flow bugs described in `UI_UX_REVIEW_DEEP_DIVE.md` §2.1 and §3.1. That safety net exists and is not plugged in.

### Impact

- Every future fix in this backlog ships unverified.
- The single most expensive bug in the project's history (the orphaned `DownloaderForm`, see #2) had a regression test written for it, and that test never ran.

### Acceptance criteria

- [ ] `"test": "vitest run"` added to `frontend/package.json` `scripts`
- [ ] `vitest` + the appropriate React/Vite test plugin added to `devDependencies`
- [ ] `npm run test` executes all files in `src/tests/` and reports the real pass/fail count
- [ ] A pre-existing test failure is **not** silenced to force a green run — record the honest baseline instead
- [ ] `"test": "vitest run && tsc -b && oxlint"` wired as a single `verify` script, so one command gates a commit
- [ ] `WALKTHROUGH_UI_UX.md` §4 updated to state that tests are part of the gate

### Notes

Do this before touching anything else. Every subsequent issue should be able to demonstrate "tests pass before, tests pass after."

---

<a id="issue-2"></a>
## Issue #2 — Introduce a tool→form registry to kill the orphaned-component bug class

**Labels:** `architecture` `frontend` `P0-blocker`
**Estimate:** 30 minutes
**Related:** #1, #14

### Problem

**This is the root cause of the project's most expensive bug, and it is still present.**

The project's defining incident — documented in `UI_UX_REVIEW_DEEP_DIVE.md` §2.1 — was that `frontend/src/components/tools/DownloaderForm.tsx` was fully built but **never rendered**, because `ToolsPage.tsx` compared `runTarget.id === 'downloader'` while the backend's canonical tool ID was `media.download.yt-dlp`. The user saw a generic 24-card form instead.

That was not a typo. It was a **missing abstraction**. The "which component renders this tool's parameters" decision is currently scattered across multiple files as inline string comparisons:

| Location | Expression |
|---|---|
| `frontend/src/pages/ToolsPage.tsx:1216` | `runTarget.id === 'media.download.yt-dlp' \|\| runTarget.id === 'downloader'` |
| `frontend/src/components/studio/NodeInspectorPanel.tsx:265` | *identical expression, duplicated* |
| `frontend/src/components/pipeline/PipelineCanvas.tsx:347,358,369,384,394` | `STARTER_WORKFLOWS` hardcode `'downloader'` and `'subtitle_translator'` |

### The live trap

`STARTER_WORKFLOWS` references **`'downloader'` and `'subtitle_translator'` — deprecated aliases, not canonical IDs.** Backend confirmation at `backend/app/tools/__init__.py:70-72`:

```python
register_alias("downloader", _downloader_instance)
register_alias("subtitle_translator", _srt_translator_instance)
```

The canonical IDs are `media.download.yt-dlp` and `subtitle.translate.srt`.

This works today **only because** `register_alias` also writes into `REGISTRY` and `list_manifests()` emits aliases with a `"[deprecated alias]"` description suffix, which `ToolsPage.tsx:130` detects and hides behind a *"Show deprecated (3)"* toggle.

**The trap:** a user who hides deprecated tools sees a catalog with **no downloader in it**, while the empty-canvas starter buttons still spawn downloader nodes. The next alias cleanup breaks **5 of 5** starter workflows, silently.

### Impact

- Any new custom tool form will be orphaned the same way, by the same mistake, and the mistake is invisible in review because the mapping is scattered.
- No test can assert "every tool with a custom form resolves to it" because no single place enumerates the mapping.

### Proposed solution

One declarative file:

```ts
// frontend/src/lib/toolForms.tsx
import type { ComponentType } from 'react'
import DynamicForm from '../components/common/DynamicForm'
import DownloaderForm from '../components/tools/DownloaderForm'
import ModelHealthCheckForm from '../components/tools/ModelHealthCheckForm'
import TranslatorForm from '../components/tools/TranslatorForm'

export interface FormProps {
  value: Record<string, unknown>
  onChange: (val: Record<string, unknown>) => void
}

export const TOOL_FORMS: Record<string, ComponentType<FormProps>> = {
  'media.download.yt-dlp':       DownloaderForm,
  'ai_model_health_check':       ModelHealthCheckForm,
  'subtitle.translate.srt':      TranslatorForm,
}

/** Deprecated backend aliases → canonical tool IDs. */
export const ALIASES: Record<string, string> = {
  'downloader':          'media.download.yt-dlp',
  'subtitle_translator': 'subtitle.translate.srt',
  'ai_model_health_check': 'ai_model_health_check',
}

export const canonicalId = (id: string): string => ALIASES[id] ?? id
export const resolveForm   = (id: string): ComponentType<FormProps> =>
  TOOL_FORMS[canonicalId(id)] ?? DynamicForm
```

Both `ToolsPage` and `NodeInspectorPanel` then call `resolveForm(id)`, and `STARTER_WORKFLOWS` uses canonical IDs only.

### Acceptance criteria

- [ ] `frontend/src/lib/toolForms.tsx` created with `TOOL_FORMS`, `ALIASES`, `canonicalId()`, `resolveForm()`
- [ ] `ToolsPage.tsx:1216` and `NodeInspectorPanel.tsx:265` inline comparisons removed; both call `resolveForm()`
- [ ] `STARTER_WORKFLOWS` chains updated to canonical IDs (`media.download.yt-dlp`, `subtitle.translate.srt`)
- [ ] A regression test asserts: *"for every key in `TOOL_FORMS`, resolving that ID returns a component other than `DynamicForm`"*
- [ ] A regression test asserts: *"every ID referenced in `STARTER_WORKFLOWS` exists in `GET /api/tools`"*
- [ ] `npm run build` and `npm run lint` clean

---

<a id="issue-3"></a>
## Issue #3 — SSE stream drops are silent: the canvas spins forever

**Labels:** `bug` `pipeline` `P1-high`
**Estimate:** 2 hours
**Related:** #4

### Problem

`api.runPipelineStream` in `frontend/src/lib/api.ts` reads a `ReadableStream` and silently swallows parse failures:

```ts
for (const line of lines) {
  const trimmed = line.trim()
  if (trimmed.startsWith('data: ')) {
    try {
      const data = JSON.parse(trimmed.slice(6))
      onEvent(data)
    } catch {
      /* ignore JSON parse errors */   // ← swallowed
    }
  }
}
```

There is **no heartbeat, no idle timeout, and no abort signal**. When the stream ends abnormally — backend restart, Wi-Fi blip, laptop sleep — the reader either throws or returns `done: true`, and:

- `PipelineCanvas.tsx` `executePipelineWithParams` leaves every node in `running` / `pending`
- the Run button stays replaced by a pulsing red **Stop Pipeline** button
- nothing is ever surfaced to the user

### Impact

**An infinite spinner is indistinguishable from a long download.** The user's only recourse is to guess that something broke, hit Stop, and restart manually. For a tool whose pipelines can run for many minutes, this is a significant trust and usability failure, and it will be reported as "the app froze."

### Proposed solution

1. **Heartbeat** — backend emits `{"type": "heartbeat"}` on an interval (e.g. 10 s) while a pipeline is live. The client already dispatches on `evt.type`, so this is additive.
2. **Idle timeout** — if no event (including heartbeat) arrives within N seconds, abort the reader and dispatch a synthetic `pipeline_error` with `code: "STREAM_STALLED"`.
3. **Explicit disconnect state** — on reader completion without a terminal event (`pipeline_finished` / `pipeline_error`), surface *"Disconnected — pipeline may still be running on the backend"* with **Reconnect status** and **Stop** actions.
4. **`AbortController`** — plumb through so unmounting the page or navigating to another workspace tears the stream down cleanly instead of leaking a reader.

### Acceptance criteria

- [ ] `runPipelineStream` accepts an `AbortSignal`
- [ ] Client aborts on unmount and on workspace change; no leaked `ReadableStream` readers
- [ ] Idle timeout (configurable, default ~30 s) fires a `STREAM_STALLED` error
- [ ] Stream ending without a terminal event shows a **disconnected** state, not an eternal spinner
- [ ] `PipelineCanvas` resets nodes from `running` → `unknown`/`interrupted` on disconnect
- [ ] Manual test: kill the backend mid-run, confirm the UI reports a disconnect within the timeout window

---

<a id="issue-4"></a>
## Issue #4 — Backend returns raw `str(e)`: path disclosure and no error taxonomy

**Labels:** `security` `backend` `P1-high`
**Estimate:** 3 hours
**Related:** #3, #5

### Problem

`backend/app/main.py:365-370` catches a bare `Exception` and forwards the Python exception string to the client:

```python
except Exception as e:
    await event_queue.put({
        "type": "pipeline_error",
        "status": "failed",
        "error": str(e),     # ← raw Python exception
    })
```

The same pattern appears at `main.py:471-472` (`mux-subtitles` → `HTTPException(status_code=500, detail=str(e))`).

**Python exception strings can contain absolute filesystem paths**, module names, and internal stack context. The frontend then compensates by string-matching on that content — `UniversalPipelineRunModal.tsx` greps for `"ModuleNotFoundError"` to decide whether to show a soft notice.

Underneath this is a **type-system failure**. `request()` in `frontend/src/lib/api.ts` collapses every failure into a single `Error`, discarding the HTTP status code:

```ts
if (!res.ok) {
  let errorMsg = `${res.status} ${res.statusText}`
  // ... scrapes detail || error || message
  throw new Error(errorMsg)     // ← status lost
}
```

Because the code is gone, the frontend **cannot distinguish**:

| Situation | Status | Correct UX |
|---|---|---|
| Workspace/run not found | 404 | "Not found" |
| Validation failure | 400 | inline field error |
| Backend crash | 500 | retry + diagnostics |
| Backend down | network | "Is the backend running?" |

### Impact

- Internal implementation detail and potentially filesystem paths are exposed in the UI.
- The frontend is forced into brittle substring matching on Python internals — a layering violation that will break on any backend refactor.
- Every error is presented identically, so users cannot tell a typo from a crash.

### Proposed solution

**Backend:** return a structured, sanitized error. Never forward `str(e)`.

```python
except PipelineValidationError as e:
    await event_queue.put({"type": "pipeline_error",
        "error": {"code": "INVALID_GRAPH", "message": str(e)}})   # safe, user-facing
except Exception:
    log.exception("pipeline_error workspace=%s", workspace_id)     # traceback to server log
    await event_queue.put({"type": "pipeline_error",
        "error": {"code": "PIPELINE_INTERNAL", "message": "A pipeline step failed. See run logs."}})
```

**Frontend:** define a discriminated error type and branch on `code`, never on message content.

```ts
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message) }
}
```

### Acceptance criteria

- [ ] `grep -rn "str(e)" backend/app/main.py` returns no user-facing error paths
- [ ] A structured error contract `{ code, message }` documented and returned by pipeline + tool execution endpoints
- [ ] `ApiError` exported from `api.ts`, carrying `status` and `code`
- [ ] `UniversalPipelineRunModal` branches on `code` — **no** `ModuleNotFoundError` string matching remains
- [ ] Tracebacks still reach server logs for debugging
- [ ] A test asserts no API response body contains an absolute filesystem path

---

<a id="issue-5"></a>
## Issue #5 — No error boundaries: a render throw loses the whole pipeline

**Labels:** `bug` `frontend` `P1-high`
**Estimate:** 40 minutes
**Related:** #4

### Problem

```
$ grep -rn "ErrorBoundary|componentDidCatch|Suspense" frontend/src/
(no results)
```

**Zero error boundaries and zero `Suspense` boundaries in the entire application.**

Any render-time throw inside ReactFlow, `wavesurfer.js`, or any route component unmounts the entire React tree to a blank page.

### Impact

This app holds unsaved user work in React state. A user who has spent twenty minutes configuring a 12-node pipeline with per-node parameters **loses all of it** to a single unhandled render exception. The autosave at `PipelineCanvas.tsx` persists *canvas structure* to the backend, but node *parameters* edited in the inspector live only in component state until a debounced save lands.

A blank white screen with no recovery affordance is an unacceptable failure mode for a workbench tool.

### Proposed solution

Wrap the three route clusters in error boundaries with a recovery action that does **not** discard work:

- `ToolsPage` catalog
- `WorkspaceDetailPage` studio (palette / canvas / inspector as separate boundaries, so a canvas throw doesn't kill the inspector)
- Modal layer

Recovery button should offer **"Reload view"** and **"Copy diagnostics"** (component stack + last error), not a bare full-page reload.

### Acceptance criteria

- [ ] `ErrorBoundary` component implemented with `getDerivedStateFromError` + `componentDidCatch`
- [ ] Wraps the Tools catalog, the studio panes, and the modal layer
- [ ] Fallback UI shows the error message plus **Reload view** and **Copy diagnostics** actions
- [ ] Pipeline/inspector throw does **not** unmount the canvas toolbar or the nav sidebar
- [ ] Manually induced throw (temporary `throw` in a node renderer) confirms recovery works

---

<a id="issue-6"></a>
## Issue #6 — No visible keyboard focus indicators anywhere in the app

**Labels:** `a11y` `P0-blocker`
**Estimate:** 15 minutes
**Related:** #14

### Problem

```
$ grep -ro "focus-visible\|focus:ring" frontend/src/ | wc -l
11
```

**Eleven** focus-ring utilities across the entire application. `index.css` defines **no** `:focus-visible` rule at all.

Meanwhile, `focus:outline-none` is used **44 times** across the codebase — suppressing the browser default with no replacement. It is concentrated in form and settings surfaces: `DynamicForm.tsx` (6), `SettingsPage.tsx` (5), `UniversalPipelineRunModal.tsx` (5), `TranslatorForm.tsx` (4), `ModelHealthCheckForm.tsx` (4), `DownloadOptions.tsx` (4), `DownloaderForm.tsx` (3).

This is a keyboard-driven tool by intent: `⌘S`, `⌘Z`, `⇧⌘Z`, `Ctrl+Y`, `Delete`/`Backspace` for node deletion, `Escape` to close menus — all implemented in `PipelineCanvas.tsx`. **None of it is reachable for a keyboard-only user.**

### Impact

- WCAG 2.4.7 (Focus Visible) failure across the app.
- The app's core interaction model is keyboard-centric, and the keyboard affordances are invisible.
- `focus:outline-none` without a replacement is worse than no styling — it actively removes the indicator.

### Proposed solution

One global rule plus a token, in `index.css`:

```css
:root {
  --color-focus-ring: var(--color-brand-caramel);
}

:focus-visible {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 2px;
  border-radius: inherit;
}
```

Then remove the bare `focus:outline-none` occurrences in favour of this default.

### Acceptance criteria

- [ ] Global `:focus-visible` rule in `index.css` using a design token
- [ ] All 44 bare `focus:outline-none` occurrences replaced or backed by a visible ring
- [ ] Keyboard-only pass: tab through Tools → open a tool modal → run it → open a workspace → select a node → edit params → run the pipeline. Every stop is visibly focused.
- [ ] `⌘S` / `⌘Z` / `Escape` / `Delete` shortcuts all reachable without a mouse
- [ ] Note in the issue: `PipelineCanvas` node rewiring is still mouse-only (drag handles). A keyboard connect affordance is **out of scope here** and should be filed separately.

---

<a id="issue-7"></a>
## Issue #7 — Three hardcoded "system is healthy" indicators

**Labels:** `bug` `design-system` `P1-high`
**Estimate:** 1 hour
**Related:** #15

### Problem

Three separate locations assert system health **without ever asking the system**:

| Location | Claim | Reality |
|---|---|---|
| `frontend/src/App.tsx:150-151` | `ENGINE STATUS` → pulsing dot → `ONLINE` | Hardcoded literal |
| `frontend/src/App.tsx:155` | `localhost:8000` | Hardcoded literal |
| `frontend/src/pages/WorkspaceDetailPage.tsx:307-310` | `PIPELINE ENGINE: READY` + green check | Hardcoded literal |

`ui_ux_review_surface.md` issue #14 already flagged this and recommended either polling `/health` or removing it. **It was not done.**

### Impact

**A status indicator that is green when the backend is down is worse than no indicator at all.** It converts a five-second diagnosis into a twenty-minute one, and it trains the user to trust the tool instead of the evidence. When a run then fails with `ECONNREFUSED`, the UI has already told them everything is fine.

Note that `api.ts` already computes the real host dynamically via `API_BASE` — the hardcoded `localhost:8000` is not just static, it's *inconsistent* with the actual resolution logic.

### Proposed solution

Either wire them to a real health check or delete them. Do not leave them static.

```ts
// api.ts
health: () => request<{ status: string; version?: string }>('/api/health'),
```

Then a `useHealth()` hook polled on an interval, driving all three indicators. Reuse the resolved `API_BASE` for the host display. On failure, show `OFFLINE` in the error color with a "backend unreachable" hint.

### Acceptance criteria

- [ ] `/api/health` endpoint exists in `backend/app/main.py`
- [ ] `useHealth()` hook with a bounded retry interval
- [ ] All three indicators reflect **actual** backend state
- [ ] Host string derived from `API_BASE`, not hardcoded
- [ ] Manual test: stop the backend, confirm all three indicators go red within the poll window
- [ ] Version string in `App.tsx:44,90` sourced from a single constant or the health response (currently hardcoded `v1.4.0` in two places)

---

<a id="issue-8"></a>
## Issue #8 — Extract the canvas god component into testable units

**Labels:** `architecture` `tech-debt` `P2-medium`
**Estimate:** 4 hours
**Related:** #1, #9

### Problem

`frontend/src/components/pipeline/PipelineCanvas.tsx` is **1,523 lines** and holds six distinct responsibilities:

| Responsibility | Approx. location |
|---|---|
| Node & edge rendering | `ToolNode`, `DeletableEdge` |
| DAG layout algorithm | `computeArrangedPositions` |
| Undo/redo history engine | `pastRef`/`futureRef`/`lastSnapRef`/`applySnapshot`/`snapshotOf` |
| Debounced autosave + save-status state machine | `persistCanvas`, `saveCanvasNow` |
| Template save/load | `saveCurrentAsTemplate`, `loadWorkflowChain` |
| SSE run orchestration | `executePipelineWithParams` |
| Keyboard shortcuts | `⌘S` / `⌘Z` / `⇧⌘Z` / `Ctrl+Y` |

Two of these are **pure logic with zero React dependency**, and both are currently untestable without mounting ReactFlow:

- `computeArrangedPositions` — a Kahn's-algorithm topological layout (~40 lines)
- The history shift register — 50-deep snapshots, semantic diffing that strips `measured`/`selected` (~120 lines)

`ToolsPage.tsx` (1,285 lines) and `UniversalPipelineRunModal.tsx` (1,062 lines) are comparable.

### Impact

The existing tests cover pure logic (`activityStore`, `toolCompatibility`, `mediaLabels`) while the **stateful orchestration has none**. Extraction flips that ratio.

### Proposed extraction

| New module | Contents | Testable |
|---|---|---|
| `lib/dagLayout.ts` | `computeArrangedPositions`, `applyArrangedPositions` | pure, no React |
| `hooks/useCanvasHistory.ts` | undo/redo shift register, snapshot diffing | pure reducer + refs |
| `hooks/useCanvasPersistence.ts` | debounce, save-status machine, `⌘S` flush | hook test w/ fake timers |

### Acceptance criteria

- [ ] `PipelineCanvas.tsx` reduced below **900 lines**
- [ ] `dagLayout.ts` extracted with unit tests: linear chain, diamond, fan-out, disconnected components, **and a cycle** (see #12)
- [ ] `useCanvasHistory` extracted with unit tests: undo after add, undo after delete, undo after connect, undo after disconnect, redo, history cap at 50, and `historyLockRef` preventing undo-recording during replay
- [ ] `useCanvasPersistence` extracted; tested for debounce coalescing and `⌘S` flush
- [ ] No behavior change; `npm run build` and `npm run lint` clean

---

<a id="issue-9"></a>
## Issue #9 — Three mirrors of canvas selection state

**Labels:** `architecture` `tech-debt` `P2-medium`
**Estimate:** 4 hours
**Related:** #8
**Depends on:** #8 (do the extraction first)

### Problem

**The canvas graph is owned by `PipelineCanvas` but read by `WorkspaceDetailPage`.** The parent holds a mirror of selection, synced by effect:

- `WorkspaceDetailPage.tsx:52-53` — `addToolRef`, `updateParamsRef` (mutable refs)
- Passed as `externalAddToolRef` / `externalUpdateParamsRef`, assigned in `PipelineCanvas.tsx` inside an effect that runs on **every render** with no dep array
- `selectedCanvasNode` — a parent-held mirror of the canvas's selection
- `graphStats` — a parent-held mirror of node/edge count

There are now **three copies** of selection state:

1. `selectedNodeId` in `PipelineCanvas`
2. `externalSelectedNodeId` from the parent
3. `selectedCanvasNode` in the parent

reconciled by a defensive merge in `PipelineCanvas.tsx`:

```tsx
const selected = useMemo(() => {
  const targetId = selectedNodeId ?? externalSelectedNodeId
  return nodes.find((n) => n.id === targetId)
}, [nodes, selectedNodeId, externalSelectedNodeId])
```

The code carries a comment explaining that **the echo previously froze the inspector on the first-selected node**.

> That bug was not a bug. It was the architecture leaking.

### Impact

Any feature that needs to read or command the graph — a node context menu, bulk parameter edit, template diffing, multi-select — will add a fourth sync point and another race condition. The mutable-ref-as-forwardRef pattern is also invisible to type checking and trivial to break.

### Proposed solution

Lift the graph into a `useCanvasGraph()` hook or a small store (Zustand / Context), and make `PipelineCanvas` a **pure renderer** over it.

Then all three mirrors collapse into one source of truth, and the `selectedNodeId ?? externalSelectedNodeId` merge — plus the comment explaining the freeze — can be deleted.

### Acceptance criteria

- [ ] Graph state lives in one owner (hook or store)
- [ ] `addToolRef` / `updateParamsRef` / `externalAddToolRef` / `externalUpdateParamsRef` **all removed**
- [ ] `PipelineCanvas` receives graph state and callbacks as props; it no longer syncs to the parent
- [ ] The `selectedNodeId ?? externalSelectedNodeId` merge and its explanatory comment are deleted
- [ ] Regression test: selecting node A then node B updates the inspector to B (the original freeze bug)
- [ ] Regression test: params edited in the inspector persist to the correct node, and only that node

---

<a id="issue-10"></a>
## Issue #10 — Effect-driven fetching causes refetch loops and stale-response races

**Labels:** `architecture` `frontend` `P2-medium`
**Estimate:** 5 hours
**Related:** #1, #16

### Problem

There is **no server-state layer** — no React Query, no SWR, no `useSWR`. The app hand-rolls it in `lib/api.ts` + `useEffect` throughout. Concrete symptoms:

**(a) Selection triggers network I/O.** `WorkspaceDetailPage.tsx:108` + `:130`:

```tsx
const refreshRuns = useCallback(() => { ... }, [id, selectedRun])
useEffect(refreshRuns, [refreshRuns])
```

`selectedRun` is a **read-only UI concern**, yet every change re-creates the callback, re-fires the effect, and refetches **both** `/runs` and `/pipeline-runs`.

**(b) No request cancellation.** `request()` takes no `AbortSignal`. Fast workspace switching can land responses out of order and render workspace A's runs under workspace B.

**(c) No cache, no dedup.** `api.listTools()` is called from `ToolsPage`, `WorkspaceDetailPage:120`, and as a `PipelineCanvas` fallback — the same static catalog fetched 2–3× per session.

**(d) Dead state.** `WorkspaceDetailPage.tsx:38`:

```tsx
const [, setArtifacts] = useState<ArtifactFile[]>([])
```

The value is discarded. Four `setArtifacts` call sites (`:147`, `:188`, `:465`) drive a state variable whose only effect is triggering re-renders of a component that never reads it. See #16.

### The counter-example — do this, don't delete it

`frontend/src/lib/activityStore.ts` is **genuinely well-built**: `useSyncExternalStore` with per-ID subscriptions and rAF-coalesced 200 ms progress ticks is exactly the right pattern for high-frequency streaming data.

It should be the **template** for the rest of the app, not the exception.

### Proposed solution

Adopt TanStack Query for all `/api/*` reads. It gives cache, dedup, cancellation, retry, and stale invalidation for free, and removes the effect-wiring that causes (a) through (c).

Keep `activityStore` as-is — it is the correct custom solution for a problem a generic library solves badly.

### Acceptance criteria

- [ ] `WorkspaceDetailPage` no longer uses `useEffect(refreshRuns, [refreshRuns])` for data fetching
- [ ] Changing `selectedRun` triggers **zero** network requests
- [ ] All in-flight requests aborted on unmount and on workspace change; no stale-response rendering
- [ ] `api.listTools()` fetched once per session and shared across consumers
- [ ] `activityStore.ts` left functionally intact
- [ ] `npm run build` and `npm run lint` clean

---

<a id="issue-11"></a>
## Issue #11 — Run button is not gated on graph validity

**Labels:** `bug` `pipeline` `P2-medium`
**Estimate:** 1 hour
**Related:** #12

### Problem

`PipelineCanvas.tsx` **has** a `validate()` function that calls `api.validatePipeline(workspaceId, payload)` and returns `{ valid, error, topological_order }`. It works correctly.

But it is buried in the **"More" overflow menu** (`⋮` → `Validate Graph`), behind a button whose only hint is a tooltip. The primary **Run** button does not consult it.

### Impact

The user configures an invalid graph, clicks Run, waits for the run modal, and only then learns the graph was invalid. The failure surfaces *after* intent has been committed and the pipeline appears to have started.

`validate()` is a fast local-ish call. There is no reason to make the user go looking for it.

### Proposed solution

- Validate on graph mutation (debounced ~400 ms after the last node/edge change, matching the existing debounce).
- Cache the result.
- Gate the Run button: disabled with an inline reason when `valid === false`, e.g. *"Run · 3 nodes — 2 issues"*.
- Show the specific incompatibility inline on the offending edge/node.

### Acceptance criteria

- [ ] Graph validity evaluated automatically on node/edge/param change (debounced)
- [ ] Run button disabled with a visible, specific reason when invalid
- [ ] The specific incompatible connection is highlighted on the canvas
- [ ] Existing manual `⋮ → Validate Graph` retained
- [ ] A graph with an incompatible connection never reaches `executePipelineWithParams`

---

<a id="issue-12"></a>
## Issue #12 — Cyclic graphs silently produce mangled layouts

**Labels:** `bug` `pipeline` `P2-medium`
**Estimate:** 45 minutes
**Related:** #8, #11

### Problem

`computeArrangedPositions` in `PipelineCanvas.tsx` performs a BFS topological sort to assign each node a level:

```tsx
const queue = srcNodes.filter((n) => inDegree[n.id] === 0).map((n) => n.id)
queue.forEach((id) => (levels[id] = 0))
// ...BFS
```

**If the graph contains a cycle, no node has in-degree 0, `queue` is empty, no BFS runs, and every node falls through to `levels[n.id] || 0` — level 0.**

The result: every node is stacked at `x: 60`, `y: 60 + i * 180` — a single vertical column with no error, no warning, no indication that anything is wrong.

### Impact

ReactFlow permits drawing a cycle. The user gets a silently mangled layout, then a confusing validation error at run time, with no connection between the two symptoms. The user cannot tell *which* edge creates the cycle.

### Proposed solution

Detect cycles in `computeArrangedPositions` (it already builds the `inDegree` / `children` maps needed) and return them:

```ts
{ positions: [...], cycle: ['node-b', 'node-c'] }
```

Then:
- Render the offending edges in the error color with a "creates a cycle" badge.
- Surface the cycle path in the validity message: *"node-b → node-c → node-d → node-b"*.
- Block Run.

### Acceptance criteria

- [ ] `computeArrangedPositions` detects cycles and returns the cycle path
- [ ] Cyclic edges rendered in the error color with a visible marker
- [ ] Run is blocked, with the cycle path named in the message
- [ ] Unit test: a two-node cycle returns a non-null cycle
- [ ] Unit test: a self-loop (`a → a`) is detected
- [ ] Unit test: a DAG with a diamond dependency reports **no** false positive

---

<a id="issue-13"></a>
## Issue #13 — `branchRun` is half-wired: plumbing exists at both ends

**Labels:** `feature` `pipeline` `P2-medium`
**Estimate:** 2 hours
**Related:** #3

### Problem

The backend endpoint exists and the frontend API client exists — and **nothing connects them.**

- `frontend/src/lib/api.ts` defines:
  ```ts
  branchRun: (workspaceId, runId) =>
    request<{ run_id, tool_id?, artifacts, params }>(
      `/api/workspaces/${workspaceId}/runs/${runId}/branch`, { method: 'POST' })
  ```
- `RunDetailsModal` accepts an `onBranch` prop.
- `WorkspaceDetailPage.tsx` passes `onBranch` — but the handler **only navigates**:
  ```tsx
  onBranch={() => { setInspectRunId(null); setView('pipeline') }}
  ```
  It never calls `api.branchRun`.

The product doc (`PRODUCT.md`, `ADR-0006`) explicitly calls out **"Runs are branched from"** as a core capability: *"Every run creates a distinct run directory. Runs can be branched from, audited, or deleted."*

### Impact

**Highest value-per-effort item in the pipeline section.** A documented, backend-implemented, API-client-implemented feature is 95% present and 100% unreachable. Combined with #3, a user whose pipeline fails at step 3 of 5 must re-enter all parameters from scratch rather than resuming from the last good run.

### Proposed solution

Wire `onBranch` to `api.branchRun`, then load the returned `params` and `artifacts` back into the canvas:

1. Call `api.branchRun(workspaceId, runId)`
2. Apply returned `params` to the matching canvas node
3. Populate the upstream entry input with the returned `artifacts`
4. Show a confirmation: *"Branched from run `<id>` — 4 artifacts, 2 steps pre-filled"*

### Acceptance criteria

- [ ] `WorkspaceDetailPage` `onBranch` handler calls `api.branchRun`
- [ ] Returned `params` applied to the correct canvas node(s)
- [ ] Returned `artifacts` populate the upstream entry input
- [ ] Success feedback: which run was branched from, how many artifacts and steps were pre-filled
- [ ] Failure handled per #4's error contract (no raw exception text)
- [ ] Manual test: fail a 3-step pipeline, branch from the last successful run, confirm params and inputs are restored and the pipeline can re-run

---

<a id="issue-14"></a>
## Issue #14 — Floor all information-bearing text at 12px

**Labels:** `a11y` `design-system` `quick-win` `P2-medium`
**Estimate:** 2 hours
**Related:** #6, #15

### Problem

```
$ grep -ro "text-\[9px\]\|text-\[10px\]" frontend/src/ | wc -l
312
```

**312 occurrences** of 9px/10px text. Critically, these are the app's **primary scanning affordances**:

| Location | Content at sub-12px |
|---|---|
| `PipelineCanvas.tsx:210-260` | Port kind chips `text-[10px]`, category badge `text-[9px]`, status pill `text-[10px]` |
| `App.tsx:44,90` | Version string `text-[9px]` |
| `ToolResultViewer.tsx` | Table body `text-[11px]`, diagnostics `text-[9px]` |
| `UniversalPipelineRunModal.tsx` | Step option labels `text-[10px]` |

### The partial fix

`WALKTHROUGH_UI_UX.md` §3.1 records a typography pass that "calibrated base body font to 14px (`text-sm`) and metadata to 12px (`text-xs`), satisfying WCAG AA readability."

That fix was applied to **body copy only**. The 312 metadata sites were never propagated. The original `ui_ux_review_surface.md` finding ("Text is universally too small") is therefore **not resolved** — it was narrowed.

### Acceptance criteria

- [ ] **No information-bearing text below 12px.** `text-[9px]`/`text-[10px]` permitted only for decorative glyphs
- [ ] Port chips, status pills, category badges, timestamps, and table cells all ≥ 12px
- [ ] Spot-check at 1440×900: canvas nodes remain legible without zooming; the three-pane layout still fits
- [ ] No layout overflow introduced — the 3-pane studio has limited horizontal budget
- [ ] `index.html` gains a `description` and `theme-color` meta tag

---

<a id="issue-15"></a>
## Issue #15 — Color tokens are dead code: ~500 hardcoded hex values

**Labels:** `design-system` `tech-debt` `P3-low`
**Estimate:** 3 hours
**Related:** #7, #14

### Problem

`frontend/src/index.css` defines a complete, well-considered token system:

```css
@theme {
  --color-brand-cream:        #F7F1DE;
  --color-brand-cream-dark:   #EDE5CD;
  --color-brand-sage:         #B0BA99;
  --color-brand-caramel:      #9D6638;
  --color-brand-caramel-text: #7C5339;
  --color-brand-espresso:     #4E220F;
  --color-accent-primary:     #9D6638;
  --color-accent-contrast:    #A83232;
  /* ...16 tokens total */
}
```

**These tokens are effectively dead code.** The JSX uses raw hex values throughout — `bg-[#9D6638]`, `text-[#EDE5CD]`, `border-[#B0BA99]` — in roughly 500 places.

This is the "two parallel color systems in one app" finding from `ui_ux_review_surface.md`, unfixed. The warm cream/caramel/sage palette is genuinely cohesive and non-generic — **the design work is good; only the plumbing is missing.**

### Impact

- Changing the brand caramel is currently a repo-wide find-and-replace, not a one-line change.
- **Dark mode is blocked.** It cannot be done reliably against 500 hardcoded hex values.
- The hardcoded `localhost:8000` in `App.tsx:155` (#7) is a symptom of the same problem: derived values were hardcoded because there was no system to derive from.

### Acceptance criteria

- [ ] All raw hex in JSX replaced with `var(--color-brand-*)` / `var(--color-accent-*)` or Tailwind v4 `@theme` utilities
- [ ] Zero raw hex literals remain in `frontend/src/**` outside `index.css`
- [ ] **No visual change** — verified by screenshot comparison before/after
- [ ] A documented z-index scale replacing ad-hoc `z-20`/`z-30`/`z-40`/`z-50` across 12 files
- [ ] `npm run build` and `npm run lint` clean

### Sequencing note

This is **P3** deliberately. It is high-effort, purely mechanical, and has **zero user-visible benefit** until it is done — so it must not be allowed to delay #1 through #13.

---

<a id="issue-16"></a>
## Issue #16 — `setArtifacts` is dead state driving phantom re-renders

**Labels:** `bug` `tech-debt` `quick-win`
**Estimate:** 5 minutes
**Related:** #10

### Problem

`frontend/src/pages/WorkspaceDetailPage.tsx:38`:

```tsx
const [, setArtifacts] = useState<ArtifactFile[]>([])
```

The value is destructured away and **never read**. Four call sites drive it:

- `:147` — `api.listArtifacts(id, selectedRun).then(({ artifacts }) => setArtifacts(artifacts))`
- `:188` — `setArtifacts([])` in `confirmDelete`
- `:465` — `setArtifacts(next)` after a waveform trim

Every one of these is a **network round-trip whose result is thrown away.**

### Impact

- Three wasted `/artifacts` requests per session on the affected paths
- Re-renders of the entire `WorkspaceDetailPage` subtree — which contains the ReactFlow canvas — with no resulting UI change
- Actively misleading: the code reads as though artifact state is tracked, so the next person does not wire up the consumer

### Acceptance criteria

- [ ] Either the value is consumed (and genuinely used by a component) or the state is removed entirely
- [ ] `ArtifactFile` import removed if unused
- [ ] Verify `:147` and `:465` are not needed for cache-busting elsewhere — if they are, replace with the server-state layer from #10 and a targeted invalidation
- [ ] Confirm the canvas does not re-render on artifact fetch

---

## Appendix A — Explicitly out of scope

The UI/UX review skills (`high-end-visual-design`, `redesign-existing-projects`) prescribe several changes that are **incorrect for this product** and must not be filed as issues:

| Skill rule | Why it does not apply |
|---|---|
| "Dashboard always has a left sidebar → try top navigation or a floating command menu" | This is a DAG editor. n8n, Node-RED, ComfyUI and Blender all use a left rail. The current rail is correct. |
| "Section padding `py-24` to `py-40`" | Dense single-user workbench on a 1440×900 laptop. Macro-whitespace here means *less visible pipeline*. |
| "Ban Lucide icons, use Phosphor Light" | Icon consistency matters more than differentiation in a tool. Swapping ~200 imports for cosmetic gain is negative ROI. |
| "Ban edge-to-edge sticky navbars" | The studio shell is intentionally edge-to-edge and viewport-locked. |
| "Ban Inter / system fonts" | `ui-sans-serif` is defensible for a tool. The real issue is the token system (#15), not the typeface. |
| "Use double-bezel nested architecture, `rounded-[2rem]`" | Would consume 15–20% of canvas area per panel. Wrong for a workbench. |

**Rule:** take the accessibility, token-system, and state-completeness rules. Leave the marketing-aesthetic rules.

## Appendix B — Explicitly do not do

- Do not convert the studio to top navigation.
- Do not increase whitespace or section padding.
- Do not swap Lucide for Phosphor.
- **Do not attempt dark mode** until #15 lands — it cannot be done reliably against 500 hardcoded hex values.
