# Consolidated Fixes & Critical Blockers — Tools Garage Workbench

> Source: Consolidates HANDOFF.md (2026-09-19), all prior session fixes, browser-harness UI research, and code-reviewer agent findings. This is the single source of truth going forward.

**Date:** 2026-09-19 20:11 UTC  
**Workspace Root:** `/home/hruthvik9487/Downloads/drive-download-20260807T051738Z-1-001/tools-workspaces`  
**Branch:** `main` — Stack: FastAPI Python 3.12, React 19 / Vite / @xyflow/react / Tailwind, filesystem-backed `workspaces/<id>/`

---

## 1. What Was Done Before Today (Prev Plans & Fixes — Saved)

### 1.1 Handoff baseline (HANDOFF.md 2026-09-19)
- **De-duplicated Node Inspector:** Removed inner `lg:col-span-1` Node Config panel from `PipelineCanvas.tsx:1057-1110`; inspection now only via `NodeInspectorPanel.tsx`.
- **Unified 3 tabs → 1:** Merged `pipeline_runs` + `media_explorer` + `artifacts` into `UnifiedMediaRunsHub.tsx` with 3 stacked rows; `WorkspaceDetailPage.tsx` now has only 2 top tabs: `Pipeline Canvas` | `Media, Runs & Assets`.
- **Spacious Canvas:** ReactFlow at `100%` width `h-[620px]/h-[780px]`, single-row action bar (Starters, Templates, Auto Arrange, Validate, Save Template, Clear, Run).
- **Starter templates** `PipelineCanvas.tsx:307-369` now carry `defaultParams` e.g. `transcriber: {task:"translate", output_format:"srt"}` for YouTube→English.
- **Multi-node Run Modal:** `pipelineInputResolver.ts:resolvePipelineFlow()` detects `transcriber`/`subtitle_translator` translation nodes, exposes `🌐 English Subtitles & Translation` toggle + collapsible Step Options accordion in `UniversalPipelineRunModal.tsx`.

### 1.2 Hotfixes applied in this session
- **Sanitize file false positive** `frontend/src/lib/pipelineInputResolver.ts:126-129` — `restrict_filenames` (boolean) contained “file” → flagged `isFilePath` → huge `UniversalFileInput` dropzone in primary inputs. Fixed by type-aware `isFilePath` (`spec.type !== 'boolean'` + `endsWith('_path'/'_file')` or `artifact_picker`). Added boolean checkbox rendering in `UniversalPipelineRunModal.tsx:425+ ,514+`. `frontend build 1995 modules` pass.
- **Phantom cache reuse** `backend/app/core/cache.py:62-66` — `detect_existing_artifacts` matched any same URL without param or filesystem check; manual `rm` of Korean `.srt` still reused stale Korean output. Fixed with `_significant_params` + `_params_compatible` strict check (`task`, `target_lang`, `provider`, `output_format`) + `exists() && size>0` + symlink verification. `find_cached_artifacts_for_node` now returns `None` on mismatch. `pytest 129 passed`.
- **Media/Runs dedup** `backend/app/workspaces.py:314-358` — `seen_paths` only deduped by resolved Path, so identical subtitle names from different `runs/*/artifacts` appeared twice (your 12.2 KB ×2). Now `seen_names[lower_name]` keeps newest `mtime`, skips zero-byte / broken symlink. `UnifiedMediaRunsHub.tsx` highlight + stale-package sync added.

### 1.3 Media organization & error presentation (just shipped)
- **Output-first** `frontend/src/pages/WorkspaceDetailPage.tsx:64-84` — `prevPipelineIdsRef` + `justCompletedRunId` + `outputBanner` auto-switches to `media_hub` on new `pipeline_run_id`, shows `Outputs ready` banner (8s dismiss).
- **UnifiedMediaRunsHub redesign** `frontend/src/components/workspaces/UnifiedMediaRunsHub.tsx` — rewrote from 3 stacked sections to sub-tabs:
  - Header `Ouputs • Organized by Recency` `X successful • Y failed • Z packages • N files • Latest: relativeTime • id`
  - **Latest tab** branches: failed → red `Latest run failed — no new outputs` + failed step error excerpt + `View Logs` + `Previous successful outputs` card with video; success → hero video player with subtitles/tracks.
  - **Timeline tab** grouped by `Today/Yesterday/date` via `dateGroupLabel()`, compact rows with status pills, `Files` expand, per-run artifacts, `NEW` badge via `highlightRunId`.
  - **Files tab** chip filters + search + `filesPerPage=12` pagination `Load more (N remaining)`, `relativeTime` per file, copy/preview/download/delete.
- Build `vite 1995 modules → 790-796 KB` pass; harness at `localhost:5173/workspaces/youtube` shows 58 buttons, `Latest Output|Timeline(9)|Files(6)` working.

---

## 2. Browser-Harness UI/UX Research (2026-09-19 20:11)

**Method:** CDP `Accessibility.getFullAXTree` + `Runtime.evaluate` + screenshots at 1536×746 and 390×844 mobile, navigating `/workspaces` → `/workspaces/youtube` Canvas → Media Hub tabs → `Run Pipeline` modal.

**Findings (key):**
- Top tabs `Pipeline Canvas` / `Media, Runs & Assets 9` work; new sub-tabs render correctly (live text captured: `Latest run failed… bd6698e97c57 • Sep 19, 08:09 PM • 42 min ago • FAILED`, `TODAY 9 runs`, `Files (6)` with 6 audio/video/subtitle items).
- **Remaining congestion:** Timeline lists *per-step* not per-pipeline (9 rows for 3 DAGs). Root: `list_pipeline_runs` grouping by `pipeline_run_id` broken for old runs fallback. Files tab surfaces internal `*_asr_scratch.wav 16.1 MB` at top.
- Canvas: `240px` sidebar + `~600px` canvas + `260px` inspector; nodes `DOWNLOADER Done`, `AUDIO_PROCESSOR Done (0.9s)`, `TRANSCRIBER Failed` overlap edge label `out: audio`; duplicate error banner (top + node pill). Mobile 390px sidebar does not collapse → horizontal overflow risk.
- Modal `Run Pipeline` now shows `ENGLISH SUBTITLES & TRANSLATION` toggle correctly but `role=dialog` is `false` and `ESC` does not dismiss (tested `dispatchKeyEvent Escape`).

---

## 3. Critical Blockers — Code-Reviewer Agent (2026-09-19)

Report: `.opencode/agent-results/review/code-reviewer.md`

**Blocker 1 — Glob injection** `backend/app/workspaces.py:243,251` `delete_workspace_media_file()`:
```py
for f in runs_dir.glob(f"*/artifacts/{filename}"):
for f in media_dir.glob(f"**/{filename}"):
```
`filename` from `DELETE /api/workspaces/{id}/media/{filename}` is user-controlled. `filename="*"` deletes everything.

**Blocker 2 — FFmpeg injection** `backend/app/workspaces.py:503` (actually `backend/app/tools/downloader.py:489` via `mux_subtitles_to_video` / transcribe):
```py
cmd = ["ffmpeg","-y","-i",str(v_src),"-vf",f"subtitles='{str(s_src).replace(':', r'\:')}'", ...]
```
Only `:` escaped; `'` can break out. Need `shlex.quote` or temp copy.

**Blocker 3 — Cache stem false positive** `backend/app/core/cache.py:112,125`:
```py
elif input_stem and input_stem in art["name"].lower() and art["tool_id"] == tool_id
```
`"cat"` matches `"concatenate.mp4"` across unrelated videos.

**Blocker 4 — Workspace-switch bleed** `frontend/src/pages/WorkspaceDetailPage.tsx:66,74`:
`prevPipelineIdsRef` never cleared on `workspaceId` change → spurious `setView('media_hub')` when switching `youtube` → `other`.

**Suggestions (next):** stale closure `selectedRun` in `refreshRuns` deps, timer leak at `:83`, double `loadMedia()` on mount, unused `runs` prop, `onRemoveRun(steps[0].id)` targets wrong step, aggressive `lower_name` dedup hides distinct `output.mp4`, `copyPath` clipboard guard.

---

## 4. Critical Plan — Fix One-by-One (Superpowers)

We will use superpowers `writing-plans` + `subagent-driven-development` to execute each blocker as an isolated, testable task. Each task has its own failing test → fix → build → commit, so review can reject one without blocking others.

Order (by blast radius): B1 Glob → B2 FFmpeg → B3 Cache stem → B4 Workspace ref. Then UI follow-ups (scratch file hide, Timeline grouping, modal a11y, mobile collapse).

See plan file: `docs/superpowers/plans/2026-09-19-critical-blockers-plan.md` (created next).
