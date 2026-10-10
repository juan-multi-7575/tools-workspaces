# Backlog status review

Reviewed on 2026-10-02 against the current workspace. This is a code review and local verification, not a completed browser accessibility or backend-disconnect test. No application fixes were made.

## Current status

All 16 entries still have outstanding work. Several descriptions or proposed implementations need correction before implementation.

| Issue | Assessment | Evidence / correction |
|---|---|---|
| #1 Test wiring | Confirmed | `frontend/package.json` has neither `test` nor `verify`; TypeScript excludes `src/tests`. Five test files exist, using `node:test`, not Vitest. A React/Vite test plugin is unnecessary for these existing logic tests. Preserve the runner or deliberately migrate assertions and test registration. The acceptance criterion naming a second `test` script should say `verify`. |
| #2 Form registry | Confirmed; broader than described | `ToolsPage.tsx:1216` handles downloader canonical/alias IDs, but custom translator and health forms match only aliases. Their canonical IDs are `subtitle.translate.srt` and **`sys.health.check`**. The proposed registry incorrectly treats `ai_model_health_check` as canonical. `NodeInspectorPanel.tsx:265` only customizes downloader. All five starter workflows use downloader aliases. However, hiding deprecated aliases does **not** hide the canonical downloader: `backend/app/registry.py:list_manifests` emits canonical manifests independently. `DynamicForm` also requires a schema, so the proposed common form interface needs an adapter or schema prop. |
| #3 SSE disconnects | Confirmed; impact overstated | `api.ts:353` lacks signal, heartbeat, idle timeout, terminal-event verification and reader cleanup. Pending/running node states remain after disconnect. However, `PipelineCanvas.tsx:1010` catches thrown errors and `finally` resets `busy`, so a completed or failed reader does not leave the Stop button active indefinitely. A stream that remains open and stalls can still do so. Parse handling also catches exceptions thrown by `onEvent`, hiding consumer failures. |
| #4 Raw backend errors | Confirmed | `backend/app/main.py:321,369,472` return `str(e)`. `api.ts:200` discards structured status by throwing plain `Error`; `UniversalPipelineRunModal.tsx:130,140` matches Python error strings. Path sanitization tests should target error responses: legitimate artifact responses intentionally include paths. |
| #5 Error boundaries | Confirmed | No `ErrorBoundary`, `componentDidCatch`, or `Suspense` matches in `frontend/src`. Suspense handles loading and is not a substitute for an error boundary. Recovery/remounting alone does not guarantee preservation of canvas state; define persistence/state ownership explicitly. |
| #6 Focus indicators | Confirmed gap; blanket claim too strong | No global focus-visible rule; 44 `focus:outline-none` occurrences and 11 focus-visible/focus-ring matches. Some inputs have border changes or rings, and unsuppressed browser outlines can remain. Keyboard reachability and visual contrast require browser verification. |
| #7 Static health | Confirmed | Two static status claims (`ONLINE` and `PIPELINE ENGINE: READY`) plus one hardcoded host label. These are three static fields, not three independent health indicators. No `/api/health` endpoint in `main.py`. |
| #8 Canvas extraction | Confirmed | Canvas remains 1,523 lines with layout, history, persistence, execution, templates and shortcuts embedded. The layout loop is not a correct Kahn implementation: it never decrements in-degree or waits for all parents before enqueueing. |
| #9 Selection mirrors | Confirmed | Internal selection, external selection and parent selected-node object remain; mutable command refs remain. `PipelineCanvas.tsx:731` merges internal/external selection. |
| #10 Fetching races | Confirmed; clarify API claim | `WorkspaceDetailPage.tsx:108,130` links run fetching to `selectedRun`. Requests have no cancellation at these call sites or catalog deduplication. The generic `request` already accepts `RequestInit`, which can carry a signal; public read helpers currently do not expose it. Introducing TanStack Query is one solution, not a prerequisite for correcting these defects. |
| #11 Graph validity gating | Confirmed | Validation is manual; Run only checks for an empty graph (`PipelineCanvas.tsx:1348`). Execution does not call the validator. |
| #12 Cyclic layout | Confirmed; raise priority | A pure two-node cycle or self-loop falls through with no assigned levels. **A cycle reachable from a root loops indefinitely** because every visited child is unconditionally enqueued (`PipelineCanvas.tsx:824`). A bounded reproduction of the extracted loop timed out for `root → a → b → a`; the diamond case completed. Treat this as a UI-freeze bug, not merely mangled layout, and fix before broad extraction. |
| #13 Branch action | Confirmed; narrow backend capability | `WorkspaceDetailPage.tsx:427` only changes view; it never calls `api.branchRun`. `backend/app/workspaces.py:215` returns one tool run's params/artifacts; it does not implement full multi-step pipeline resume. Specify node mapping and how existing outputs feed the rerun before promising multi-step restoration. |
| #14 Small text | Confirmed | 312 occurrences of 9px/10px text and another 97 of 11px text. `frontend/index.html` lacks description/theme-color tags. A 12px floor alone does not establish accessibility compliance. |
| #15 Hardcoded colors | Confirmed; count understated | 3,098 raw hex occurrences in frontend TS/TSX outside `index.css`, including repeated utility colors and inline values. Tokens exist but are not consistently used. Distinguish occurrences, unique colors and affected sites when estimating work. |
| #16 Discarded artifacts | Confirmed; count correction | Discarded artifact state remains (`WorkspaceDetailPage.tsx:38`) with **three** setter sites (`147,188,465`), including two fetch paths. The delete setter is not a network request. No exact per-session request count is guaranteed. Trimming must refresh actual artifact consumers if this state is removed. |

## Verification

- `npm run build`: passed; bundle-size warning remains.
- `npm run lint`: passed with 12 warnings; no errors.
- Executed each `src/tests/*.test.ts` directly with Node 22.23.2 and `--experimental-strip-types`: 12 regression assertions passed across four files, plus one debug test (13 total). The debug test only logs and has no assertions.
- `node --experimental-strip-types --test src/tests/*.test.ts` reported five passing file-level tests in this environment; direct execution was used to confirm the individual assertions actually ran.
- Isolated the existing layout traversal using Node's VM with a 100ms execution limit: two-node cycle and self-loop received no levels; reachable cycle timed out; diamond completed.

## Suggested order

Wire an honest test/verify gate (#1), then fix the reachable-cycle freeze (#12), canonical form routing (#2), stream lifecycle (#3), error handling (#4/#5) and focus defaults (#6). Remove discarded artifact work (#16) and static health claims (#7) as small follow-ups. Proceed to validation gating (#11), then scoped extraction/state/fetch improvements (#8–#10), branch behavior (#13), typography (#14), and token migration (#15).

## Workspace guidance

`AGENTS.md` requires `adaptive-user-compatibility-assessment.md`. That file was not found in the workspace or in searches under the local `.agents`, `.codex`, and Downloads directories. Its contents could not be applied. Existing user changes and deletions were left intact.
