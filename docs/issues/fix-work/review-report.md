# Task 5 — Integration and Review

Final integration/verification pass over the UI/UX backlog (`UI_UX_ARCHITECTURE_ISSUES.md`, corrected by `STATUS_REVIEW.md`). Companion to **`design-tokens-report.md`** (Task 4).

## ⚠ Correction note — an initial pass verified the wrong worktree

Task 4 (design tokens / typography / #6 focus / #15 Option-A) was executed in the **main checkout** (`tools-workspaces`) as **uncommitted working-tree changes** (the plan says "no push or commit"). An initial Task 5 pass ran the #14/#15 greps against the `wt-batch-E` worktree, which **does not contain Task 4's edits** — so that pass mistakenly reported #14 as "200 sub-12px sites", #15 as "407 hex / problem", and `design-tokens-report.md` as "missing". Those statements were artifacts of the wrong tree and are **retracted**. All #14/#15 facts below were re-verified **first-hand in the main checkout**. Only the automated gate commands were run in `wt-batch-E` (that worktree holds the merged Tasks 1–3 + 4.5 code), and those gate results are valid and unchanged.

## Tree provenance

| What | Where verified | Note |
|---|---|---|
| Frontend `verify` / `build`, backend suite | **wt-batch-E** (merged Tasks 1–3 + 4.5) | Valid for merged work; corroborated by Task 4's independent `verify`/`build` in the main checkout (also 305 tests / exit 0). |
| #14 (12px floor), #15 (hex/z), Task 4 edits | **main checkout** (`tools-workspaces`, uncommitted) | Task 4's source of truth. `wt-batch-E` lacks these edits, so `wt-batch-E` still shows the pre-Task-4 counts. |

## Automated gate results

### 1. Frontend `npm run verify` — PASS (exit 0)

`cd frontend && npm run verify` (= `npm run test && tsc -b && oxlint`):

| Stage | Result |
|---|---|
| Tests | **305 passed, 0 failed** across 40 test files (baseline was 214) |
| `tsc -b` | clean |
| `oxlint` | **0 errors**, 34 warnings (pre-existing Fast-Refresh + `exhaustive-deps` advisories) |

### 2. Backend suite — PASS from repo root (239 passed, 1 skipped)

`PYTHONPATH=backend python3 -m pytest backend/tests/ --ignore=backend/tests/test_09_cli.py -q` → **239 passed, 1 skipped, 0 failed** (13.8 s).

- The 1 skip is environmental: `test_11_catalog.py:60 "sox binary not installed"`.
- `test_09_cli.py` excluded as directed: `backend/app/cli.py:11` imports `NoArgsIsHelpError`, absent from the environment's system `click` 8.1.8. Pre-existing dependency-version mismatch in the CLI import path; the FastAPI app (and the other 239 tests) are unaffected.
- `test_29_make_tool.py` is **invocation-sensitive**: it hardcodes `cwd=Path(".")` + `"backend/tools/make-tool.py"`, so it **passes from the repo root** (canonical `PYTHONPATH=backend … pytest backend/tests`) and fails only under the `cd backend && pytest tests/` invocation. Under the canonical invocation the suite is fully green.

### 3. Frontend `npm run build` — PASS (exit 0)

`cd frontend && npm run build` → built in 1.66 s. **Exactly one warning**, the accepted >500 kB chunk notice (`index-*.js` 1,117.73 kB / gzip 287 kB). No other warnings/errors.

---

## Acceptance criteria — verified verdicts

"Met (code)" = source-verified + covered by automated tests. Browser/pixel gates are called out explicitly.

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| #1 | Wire up test/verify gate | Met (deviation) | `test` + `verify` scripts wired; 305 assertions run. Deviation (per STATUS_REVIEW): `node:test` runner preserved, Vitest **not** adopted; `_dbg.test.ts` excluded. `WALKTHROUGH_UI_UX.md` absent from these checkouts, so its §4 note wasn't updated. |
| #2 | Tool→form registry | Met (functional) | `lib/toolForms.tsx` (`TOOL_FORMS`, `getToolForm`, schema-aware `<ToolForm>` → `DynamicForm` fallback) + pure `lib/toolIds.ts` (`canonicalId`). Catalog, inspector (`NodeInspectorPanel.tsx:266`), `ToolPageRouter`, `WorkspaceDetailPage`, `PipelineCanvas` all resolve through the registry; no inline `=== 'downloader'` matches. `toolForms.test.tsx` regression. API naming (`getToolForm`/`ToolForm`) differs from the issue's proposed `resolveForm`. |
| #3 | SSE drops not silent | Met (code) | `apiTransport.ts`: `{signal, idleTimeoutMs}`; AbortSignal fused; SSE comments as heartbeats; terminal gating on `pipeline_finished`/`pipeline_error`; `STREAM_STALLED` (default **45 s**, deviation from ~30 s), `STREAM_INTERRUPTED`; reader cleanup; only pending/running nodes interrupted. Deviation: **no SSE replay** (Reconnect reconciles status/outputs). Manual check: kill backend mid-run. |
| #4 | No raw `str(e)`; `{code,message}` | Met (code) | `grep "str(e)" backend/app/main.py` = 0; `stream_public_data` applied at every public boundary incl. non-SSE tool exec (`main.py:242`), DAG/chain (`364,371,408`), tool result (`819,879,885`), SSE (`398,847`). `ApiError(status,code,message)` exported. No Python-substring matching in the run modal (only test fixtures mention `ModuleNotFoundError`). Route tests assert codes + no private paths. |
| #5 | Error boundaries | Met (code) | `ErrorBoundary` (Reload view + Copy diagnostics, sanitized) wraps ToolsPage, ToolPageRouter, WorkspaceDetailPage/studio, run modal, PipelineCanvas (narrower Graph-renderer boundary preserves the toolbar), `sites/App` + `AppShell`. Manual check: browser render-throw recovery. |
| #6 | Visible focus | Met (code) | `index.css`: global `:focus-visible { outline: 2px solid var(--color-focus-ring) !important; outline-offset: 3px }` backs all 51 `focus:outline-none` sites. Prior CDP audit: 18/18 sampled Tab stops render the caramel ring. Full keyboard pass remains a coordinator browser check. |
| #7 | Real health | Met (code + audited) | `/api/health` → `{status,version}` (`main.py:101`); shared `useHealth` poller drives `sites/AppShell` + `WorkspaceDetailPage`; host from `API_BASE`. Prior CDP audit verified OFFLINE→retry→ONLINE. |
| #8 | Extract canvas | Met (functional) | `PipelineCanvas.tsx` = 616 lines (< 900). Extracted + tested: `lib/canvasGraph.ts` (bounded Kahn + DFS cycles + reducer/history), `lib/canvasPersistence.ts`/`hooks/useCanvasPersistence.ts`, `hooks/useCanvasGraph.ts`/`useCanvasRun.ts`. Module names differ from the issue's proposed `dagLayout.ts`/`useCanvasHistory.ts`. |
| #9 | One graph/selection owner | Met | Single reducer/hook owns graph+selection+history; `addToolRef`/`external*Ref` mirrors and the `selectedNodeId ?? externalSelectedNodeId` merge removed; atomic `graph.replace` for clear/load/branch; `canvasGraph.test.ts`. |
| #10 | No refetch races | Met | `refreshRuns` deps `[id]` only → changing `selectedRun` = **zero requests**; workspace reads abort on switch/unmount; catalog fetched once per session via `api.ts` module-level promise; `activityStore` untouched. No server-state lib (per STATUS_REVIEW). |
| #11 | Run gated on validity | Met | Debounced (400 ms) auto-validation (`PipelineCanvas.tsx:135-143`); Run `disabled={!valid \|\| !canRun}` with inline reason; invalid/cycle edges highlighted; manual Validate retained. Interop note: local check uses exact-kind equality vs backend MIME/wildcard `is_assignable` — no current manifest exercises MIME kinds, forward-looking only. |
| #12 | Cycles detected | Met | Bounded Kahn + DFS back-edge detection returns `{positions, cycle, cycleEdgeIds}`; cycle edges marked; Run blocked with `Cycle: a → b → a`. Unit tests: self-loop, pure/reachable cycles, diamond (no false positive). |
| #13 | `branchRun` wired | Met (code) | `WorkspaceDetailPage.tsx:428` → `api.branchRun`; node matching, params restored, artifacts routed downstream, source/upstream excluded, `RUN_NOT_FOUND` 404. Deviation: multi-parent resume reported unsupported. Manual check: real failed 3-step branch rerun. |
| #14 | 12px text floor | Met (code) — pixel gate UNVERIFIED | **Main checkout: 0** `text-[9/10/11]px` sites (Task 4 raised 373 → 0; wide-tracked uppercase mono labels widened ~10–20%). `index.html` has `description` + `theme-color`. **Unverifiable without a browser:** the "no layout overflow introduced" + 1440×900 / 768×1024 / 390×844 legibility spot-checks (see `design-tokens-report.md` §1). |
| #15 | Zero raw hex / z-index scale | Hex UNMET **by design**; z-index **Met** | **Main checkout: 406** six-digit hex outside `index.css` (non-test) remain under supervisor-approved **Option A** (exact brand-token matches only). Reason: the redesign made hex an **intentional system** — per-site registry accents (`sites/registry.ts`, e.g. `#0A7C7C`), JS/canvas contrast + `fillStyle` (`lib/hostSkin.ts`), per-page dark palettes, and literal SVG/QR-safe consumers. Converting all would collapse 22 site accents to one and violate "preserve visual colors". z-index sub-criterion **fully met**: `--z-panel/sticky/overlay/drawer/modal` documented + utilities, **0** ad-hoc `z-[n]` utilities remain. Before/after screenshot gate for the 11 converted matches still owed. |
| #16 | Remove dead `setArtifacts` | Met | Dead state + fetch paths removed; dock/media consumers refresh via `mediaRefreshKey`. |

---

## Findings

### F1 — #14 & #15 drift is real and now reconciled (doc-hygiene)
The batch A–E redesign merge (`b8234442`) reintroduced sub-12px text and raw hex **after** `STATUS_REVIEW.md`'s grep-verified "Fixed" claims were written. Task 4 re-landed the pass on the main checkout (main, uncommitted) and `design-tokens-report.md` records the reconciliation. **Action for coordinator:** the committed `STATUS_REVIEW.md` in these checkouts still predates `b8234442`/Task 4 and is now stale; refresh it against the main checkout before any push so the record doesn't re-introduce the earlier grep-verified claim as truth.

### F2 — #15 acceptance criterion, as literally written, is unmet by design
Not a defect: the strict "zero raw hex outside `index.css`" line in `UI_UX_ARCHITECTURE_ISSUES.md` #15 conflicts with the redesign's intentional per-site palette + the "preserve visual colors" constraint. Supervisor-approved Option A governs (11 exact brand matches tokenized; ~406/601 remainder left). z-index scale is fully landed. The residual acceptance owes a human before/after screenshot comparison of the 11 converted matches.

### F3 — Pixel/a11y gates rely on a human browser pass
#14 overflow/legibility and #15 screenshot equivalence can't be closed by source scans or this role. Coordinator browser checks remain the acceptance evidence.

## Outstanding manual checks (not claimed as passed)

1. #3 — kill the backend mid-run; disconnect surfaces within the idle window (Stop + reconnect).
2. #5 — induce a browser render-throw; confirm pane recovery and toolbar survival.
3. #13 — real failed 3-step branch → rerun.
4. #14 — pixel overflow + legibility at 1440×900 / 768×1024 / 390×844 (wide uppercase labels + 3-pane studio).
5. #15 — before/after screenshot of the 11 tokenized hex.
6. #6 — full keyboard-only pass (prior CDP audit covered catalog/tool-modal/health + 18 Tab stops, not a complete pass, and predates Task 4).
7. From the prior CDP audit (not re-verified here): tool-modal focus trap, canvas-node accessible names, unlabeled Settings inputs — out of Task-4 file scope, still open.

## Residual risks

- **`test_09_cli.py` cannot run** in this environment (system `click` 8.1.8 lacks `NoArgsIsHelpError`). A pinned/newer `click` in a project venv would likely collect it; excluded as directed and disclosed.
- **`test_29_make_tool.py` is invocation-sensitive** — always invoke pytest from the repo root (`PYTHONPATH=backend … pytest backend/tests/`) to keep it green.
- **`frontend/package-lock.json` is modified** in `wt-batch-E` (unrelated optional-dependency `libc` metadata from env setup). Left untouched (no commit requested).
- **`STATUS_REVIEW.md` is stale** vs the main checkout (F1).

## Reproduce

```bash
# Gates — in wt-batch-E (merged Tasks 1-3 + 4.5)
cd frontend && npm run verify          # 305 passed / tsc clean / oxlint 0 errors
cd frontend && npm run build           # exit 0; only >500 kB chunk warning
cd <repo-root> && PYTHONPATH=backend python3 -m pytest backend/tests/ --ignore=backend/tests/test_09_cli.py -q
# 239 passed, 1 skipped (sox), 0 failed

# #14 / #15 + Task 4 — in the main checkout (tools-workspaces) where Task 4's uncommitted edits live
cd tools-workspaces
grep -rohE 'text-\[(9|10|11)px\]' frontend/src --include='*.tsx' | wc -l        # 0  -> #14 met on code
grep -rEn '#[0-9A-Fa-f]{6}\b' frontend/src --include='*.ts' --include='*.tsx' | grep -v '\.test\.' | grep -vc '\.css'   # 406 -> #15 hex unmet by design
grep -rnE '\bz-\[?[0-9]{2,3}\]?' frontend/src --include='*.ts' --include='*.tsx' | grep -v '\.test\.' | grep -vcE 'z-(panel|sticky|overlay|drawer|modal)'  # 0 -> z-index met
ls -la docs/issues/fix-work/design-tokens-report.md     # exists (Task 4 evidence)
```

---
---

# Independent implementation review (prior — superseded findings preserved as history)

> Superseded by the Task 5 section above; retained for provenance. Its five findings were all
> subsequently ADDRESSED (see the scoped re-review at the end). Its "#6/#14/#15: no remaining raw hex"
> line predates the `b8234442` redesign merge and Task 4; see the Correction note and F1/F2 above.

Reviewed the current source and focused tests against the 16 issue criteria, PLAN.md, STATUS_REVIEW.md, forms-report.md and canvas-report.md. transport-report.md was not present at review time. No source changes, commits, nested agents or routine full test reruns were made. Coordinator owns browser checks and color screenshot comparison.

## Important findings

1. **Failed autosave can overwrite newer successfully saved work.** `frontend/src/lib/canvasPersistence.ts:32-35`: a failed write restores its snapshot into `this.snapshot` whenever empty. A newer snapshot already removed from that field into a queued flush is invisible to this test. After that newer write succeeds, disposal flushes the restored old snapshot over it. Focused reproduction with actual CanvasSaveSession: queue `old`, queue `new`, reject the first write, await both, dispose; writes are `['old', 'new', 'old']`. Retry tracking must distinguish snapshot generations and never restore an earlier version after a later version was queued. This is a material #10 persistence regression.

2. **Graph undo creates partial, invalid graphs and rewinds live execution state.** `frontend/src/hooks/useCanvasGraph.ts:43-48` creates history on every nodes/edges setter, including every execution event and drag frame. Clear (`PipelineCanvas.tsx:167-168`), workflow loading and branching (`WorkspaceDetailPage.tsx:425`) issue separate node and edge actions. Actual reducer reproduction: clear nodes then clear edges then Undo yields no nodes plus the old a→b edge. Reproduction of pending→running→completed then Undo returns status `running` although execution already ended. React batching does not combine reducer history actions. Atomic graph actions are needed for graph-wide edits; execution/measurement/drag updates need separate history policy. This affects #8/#9 and persisted graph validity.

3. **Keyboard node/edge selection is dropped.** `frontend/src/hooks/useCanvasGraph.ts:55-56` filters every `select` change; `PipelineCanvas.tsx:511-513` updates selection only from mouse click callbacks. Inspection of installed @xyflow/react actual implementation confirms Enter/Space/Escape go through `handleNodeClick`/`addSelectedEdges` and emit selection changes, without calling the external onNodeClick/onEdgeClick callbacks. Keyboard selection therefore does not populate the inspector or owner selection, and the next controlled render resets it. Forward those selection changes into the single graph owner. This blocks #6 keyboard-only selection/parameter editing and regresses #9.

4. **Structured/sanitized errors cover SSE but omit public execution responses.** `backend/app/main.py:222` returns `res_dict` unchanged from tool execution; `main.py:343,350` return unchanged non-SSE DAG/chain results. Tools still return raw string failures, including `downloader.py:920` (`input file not found: {p}`), multiple `error=str(e)` paths, and translator missing-input file messages. `stream_public_data` is only used in SSE. Normal unsuccessful ToolResult values do not throw, so the global exception handler cannot sanitize them. These endpoints still leak filesystem paths and violate the requested `{code,message}` tool/pipeline contract in #4. Preserve artifact paths while transforming error fields at each public response boundary.

5. **Canvas crash recovery loses the remote-run control state.** `WorkspaceDetailPage.tsx:332` puts PipelineCanvas, hence useCanvasRun, below the error boundary. `useCanvasRun.ts:11-12,16-24` resets busy/disconnected on remount and aborts its observer on unmount. The backend intentionally keeps execution alive (`main.py:393-400`). After Reload view or navigation back to a running workspace, nodes become interrupted but `disconnected` is false, so `PipelineCanvas.tsx:452` hides Stop backend run and Run can start another execution. Scheduler only tracks one cancellation event per workspace (`scheduler.py:69`), so a duplicate run overwrites the existing stop target. Keep execution identity/control state above pane recovery, or reconcile actual remote state before enabling a new run. This is a material #3/#5 lifecycle gap.

## Material acceptance gaps

- #3: No **Reconnect status** action or remote-run reconciliation exists. Refreshing output lists does not reattach/reconcile an active run. Stop exists only while busy/disconnected state survives, as finding 5 explains.
- #5: A canvas renderer throw removes the entire PipelineCanvas, including its toolbar; graph/parameters do survive above the boundary, but the explicit toolbar-survival criterion is not met. A browser recovery check remains necessary.
- #11: Local compatibility uses exact kind equality/`any`, whereas backend is_assignable supports legacy/MIME normalization and wildcards. No current manifest with MIME-specific kinds was found, so this is a future interoperability limitation rather than a current blocking reproduction.
- #6/#14/#15: Source scans found no remaining raw hex or ad-hoc numeric z utilities outside index.css; screenshot equivalence, studio overflow and full keyboard focus reachability remain coordinator browser checks. Typography/focus source changes cannot establish these acceptance criteria alone.
- #13: Pure branch tests verify source exclusion and downstream file routing; a real failed three-step branch followed by execution remains necessary. Unsupported multi-parent branching is explicitly reported rather than pretending full resume support.

## Positive evidence and scope

The canonical/alias form registry is shared by catalog and inspector, starters use canonical IDs, health is a shared cancellable poller, reachable/self/pure cycles are bounded and marked, workspace reads have abort guards, discarded artifacts state is gone, and PipelineCanvas is 616 lines. Existing tests exercise these pure helpers, transport frames, health generations and ordinary save ordering. The focused reproductions above expose gaps not covered by the current tests. No Critical finding was confirmed; all five findings above are Important and should be resolved before describing all issues as complete.

## Scoped re-review after fixes

Re-read latest source, canvas/transport reports and new regression assertions. The five original findings below are **all ADDRESSED**; the original findings above remain as the review history, not outstanding defects. No new Important gap was confirmed within this scoped re-review.

| Finding | Verdict | Implementation and test evidence |
| --- | --- | --- |
| 1 — Autosave rollback | ADDRESSED | CanvasSaveSession now increments snapshot revisions and only restores failed snapshots when still latest. The exact failed-old/queued-new/dispose reproduction is a committed regression assertion and passes; disposal no longer writes old after new. |
| 2 — Graph history | ADDRESSED | Clear, workflow load and branch now use atomic graph.replace. Runtime updates use setRuntimeNodes without history; editing snapshots omit runtime status and dimensions, and undo retains current runtime observations. Drag frames capture their starting graph and record once on drag finish. New tests cover one-step clear undo, 20-frame drag coalescing/start restoration, no runtime history, and parameter undo preserving completed status. |
| 3 — Keyboard selection | ADDRESSED | ReactFlow node/edge change handlers dispatch the full change stream to the reducer, which updates canonical node/edge IDs from select/deselect changes without creating edit history. New tests cover node selection and edge selection/Escape clearing. Controlled ReactFlow selected props continue to derive from these IDs. |
| 4 — Non-SSE errors | ADDRESSED | Direct tool execution and both non-SSE DAG/chain response paths now call stream_public_data, changing only public error fields. Focused actual HTTP route tests assert TOOL_EXECUTION_FAILED and absence of private paths in error messages while preserving artifact paths. Chain route coverage is source inspection; the new pipeline assertion exercises DAG results. |
| 5 — Remote-run recovery | ADDRESSED | WorkspaceDetailPage now owns useCanvasRun above pane boundaries and displays Stop backend run/Reconnect status above those panes. A narrower Graph renderer boundary preserves the canvas toolbar on node/ReactFlow render failure. Initial workspace status reconciles remote execution; canStartRun only permits confirmed idle state. Integrated stopRemoteRun/reconnectRemoteRun helpers preserve unknown/active gating and stale-generation guards. Backend atomic route reservations reject duplicate stream/nonstream execution before another request can enter, with active status covering the reservation. New tests exercise shared recovery helper transitions, failed Stop, stale responses, and backend duplicate stream rejection. |

Focused verification performed during re-review:

- Imported only canvasPersistence.test.ts, canvasGraph.test.ts and canvasRunRecovery.test.ts through the project TS loader: **25 passed, 0 failed**.
- `PYTHONPATH=backend .venv/bin/python -m pytest backend/tests/test_33_transport.py -q -k 'nonstream or active_status'`: **3 passed, 7 deselected**; existing Starlette deprecation warning.
- Did not rerun full suites, edit source, or manipulate browser/user data.

The tests now materially cover the original failed mechanisms. Remote recovery assertions exercise the same helpers used by the hook, but do not mount the React hook or induce an actual ReactFlow render failure. Keyboard assertions exercise the actual reducer input shape but do not prove browser Enter/Space dispatch or focus presentation. Coordinator browser checks remain the evidence for mounted boundaries, preserved toolbar/control visibility, keyboard reachability, real disconnect/restart and real branch execution. Status reconciliation refreshes outputs rather than reattaching SSE, which meets the Reconnect status intent without claiming replay.
