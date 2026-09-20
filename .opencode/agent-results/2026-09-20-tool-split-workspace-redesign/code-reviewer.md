# Code Reviewer — Final whole-branch merge gate
source set: 2026-09-20-tool-split-workspace-redesign
agent name: code-reviewer

Scope: plan docs/superpowers/plans/2026-09-20-tool-split-workspace-redesign.md, spec docs/superpowers/specs/2026-09-20-tool-split-workspace-redesign-design.md (binding), diff review-d2c6e57..31490ea.diff (12 commits, d2c6e57..31490ea). Read-only, no re-runs. Verified facts taken as given: 146 passed/1 skipped (env sox); per-task reviews closed.

## Verdict: Ready-with-fixes (1 small must-fix, rest may ride)

## Must-fix before merge
1. `backend/app/main.py:323-331` — `run_workspace_pipeline` drops `pipeline_name`/`visibility`/`preset_id` from payload; calls `run_pipeline(workspace_id, steps)` with defaults only. Plan Task 5 Step 3 (binding via spec §3 meta flags) requires these to ride on every step record. Fix: `results = await run_pipeline(workspace_id, steps, pipeline_name=payload.get("pipeline_name"), visibility=payload.get("visibility", "success"), preset_id=payload.get("preset_id"))`. Without this, linear-pipeline visibility is always "success" and preset_id never set; scheduler path (DAG) likewise never sets visibility/preset_id (scheduler.py:170-184 record lacks both keys) — at minimum fix the linear route; DAG parity is follow-up.
   - finding: pipeline flag forwarding missing; evidence: backend/app/main.py:331, backend/app/pipeline.py:24-30, backend/app/core/scheduler.py:170-184

## May-ride (parked with follow-up)
2. Warning-only dotted enforcement vs plan hard-fail — `backend/app/registry.py:290-291` logs warning where plan Task 1 Step 3 demands `ValueError` for non-dotted ids. 22 legacy flat ids still register; enforcing now would break the tree. Controller ruling to defer hardening until full migration is correct. Follow-up: migrate remaining flat ids (spec §1 small-tool renames: `media.audio.process`, `media.info.probe`, `doc.convert.pandoc`, `image.convert.magick`, `sec.codec.transform`, `ai.summarize.llm`, `dev.script.run` — none done in this branch) then flip to hard error. Spec/plan gap acknowledged, not merge-blocking.
3. Alias palette duplication by design — `backend/app/registry.py:317-333` emits canonical + `[deprecated alias]` rows; `backend/tests/test_28_translator_split.py:4198-4203` pins old ids listed. Keep. `backend/tests/test_09_cli.py:3808` unused-import nit (`list_manifests` still imported) — cleanup anytime. CLI alias callback canonicalizes (`backend/app/cli.py:121-131` `run_tool(manifest.id, ...)` runs canonical id) — correct, keep.
4. Health provider/model routes hardcoded to legacy id — `backend/app/main.py:120,126` `/api/tools/ai_model_health_check/...` work via alias (`backend/app/tools/__init__.py:72`, `backend/app/tools/model_health_tool.py:615` canonical `sys.health.check`). Add canonical-id route aliases as follow-up; not blocking.
5. make-tool minors — `backend/tools/make-tool.py:434-443` dry-run returns before `FileExistsError` collision check (by design for listing); `:436` cwd-anchored `Path(".").resolve()`; `:445-460` `FileExistsError` exit-1 only via `__main__` wrapper. All acceptable for a scaffold CLI; collision refusal still works on real runs. Cosmetic follow-up only.
6. `keep_starred` vacuous + live-delete untested — `backend/app/workspaces.py:613-622` honors `r.get("starred")` but `list_runs` (`backend/app/workspaces.py:135-176`) never surfaces `starred` and nothing writes it; `dry_run=True` default keeps live-delete path (`:3718-3721`) safe and untested. Follow-up: surface/persist `starred`, add live-delete test before any non-dry-run use. Not blocking with dry-run default.
7. Provenance/process notes — a251313 bundles in-tree user hardening (message notes provenance, keep message on squash); 3d05769 superseded in-range, 3eb1a2f abandoned unreferenced (no action); no git worktree used (deviation, no fallout); others' working-tree dirt untouched except reviewed hunks (correct).
8. Cross-task naming notes (informational, may ride): spec §3 says `pipeline_id`, plan+code use `pipeline_run_id` consistently (`backend/app/pipeline.py:30,34`, `backend/app/workspaces.py:162,452`) — follow plan, fix spec wording later. Composite preset `media.youtube_to_mp4` chain (`backend/app/workspaces.py:3652-3658`) threads `media.subtitle.fetch` (document) linearly after `format_select` with an inline comment admitting the thumbnail branch alternative — semantically odd but pinned by `test_30:4319-4323`; revisit when presets execute end-to-end. Starter chains remain mixed flat+dotted (`audio_processor`, `transcriber` alongside `media.download.yt-dlp`, `text.translate.llm`) — consistent with deferred small-tool migration above.

## Reasoning
The branch delivers the planned facade+atomics, shims, scaffold, and visibility/GC surface with a green suite, and every deferred item except the pipeline-flag forwarding is either by-design compat or safely inert behind defaults. The single must-fix is a ~2-line forwarding omission in `main.py:331` that leaves spec §3 flags unwritable via the linear pipeline route; everything else rides with logged follow-ups.

---

# Scoped re-review: fix wave 31490ea..b06d3f8 (2026-09-20)
source set: 2026-09-20-tool-split-workspace-redesign
agent name: code-reviewer

Scope: single commit b06d3f8 on base 31490ea; diff review-31490ea..b06d3f8.diff (1 file, 423 insertions, 6 deletions); fix-wave section of task-6-report.md. Read-only, no subagents, no re-runs. Suite counts taken as given (controller ran head).

## Verdict: MERGE-READY — must-fix ADDRESSED, no new breakage.

## (a) Must-fix forwarding hunk: ADDRESSED
- finding: forwarding hunk exists with safe defaults; evidence: backend/app/main.py:331-334
- `pipeline_name = payload.get("pipeline_name")` (None default), `visibility = payload.get("visibility", "success")`, `preset_id = payload.get("preset_id")`, forwarded as kwargs at backend/app/main.py:334. Matches the final-review prescribed fix verbatim, including the `"success"` default.
- Callee signature accepts all three with identical defaults (`pipeline_name: str | None = None`, `visibility: str = "success"`, `preset_id: str | None = None`); evidence: backend/app/pipeline.py:24-30. No TypeError risk; `.get` access means missing keys cannot KeyError.
- Fix hunk is confined to the linear `steps` path after the DAG early-return, so it cannot affect DAG dispatch.

## (b) DAG/scheduler path: UNTOUCHED (approved follow-up, may ride)
- finding: DAG branch not modified by the fix, scheduler parity still deferred as approved; evidence: backend/app/main.py:325-328
- The `if "nodes" in payload:` early-return block (DAGPipelineSpec → execute_dag_pipeline) is part of the preserved verbatim user work, not edited by the fix hunk — the fix only replaces the `run_pipeline(workspace_id, steps)` call below it. Scheduler records still lack visibility/preset_id per prior finding (scheduler.py:170-184), which the final review explicitly parked as follow-up. No action required for merge.

## (c) New breakage in fix diff: NONE
- finding: no deletion of existing behavior; the 6 removed lines are each replaced by a superset; evidence: diff review-31490ea..b06d3f8.diff lines 80, 194, 334, 418-419, 599
- Deleted-line inventory (all accounted for): (1) `app.state.dep_check = check_dependencies()` → same call with `index=` kwarg + background task; (2) `return result.model_dump()` → same return plus small-artifact hydration; (3) `results = await run_pipeline(workspace_id, steps)` → the must-fix forwarding (intended); (4-5) `get_templates` signature/body → added `starters=False` default, backward-compatible; (6) `return upgrade_package(package)` → channel-aware call with TypeError fallback. No behavioral deletion; all other 419 insertions are additive routes/middleware/usage the commit message discloses as pre-existing uncommitted user work preserved verbatim (stat confirms: 1 file, 423+/6-, single commit b06d3f8 on 31490ea).
- Spot-check notes (may-ride, NOT merge-blocking — pre-existing user work, out of this review's scope by controller ruling): `allow_origins=["*"]` with `allow_credentials=True`, unguarded `Path(path).resolve()` in `get_artifact_content`, `yt-dlp` subprocess on raw URL, `email`-based multipart parsing — all live in the bundled user hunks, were never part of the must-fix, and ride under the "user hunks preserved, not altered" instruction. Flagged here only so they are not mistaken for fix-wave regressions; recommend follow-up hardening, not a gate.
- Caveat: "preserved verbatim" taken on the report's claim (report: task-6-report.md:38-39); read-only scope confirms the diff contains no edit that contradicts it (no partial rework of user hunks interleaved with the fix hunk — the fix hunk at main.py:331-334 is cleanly separable).

## (d) Suite evidence: CREDIBLE (taken as given, internally consistent)
- finding: 146 passed / 1 skipped on head is consistent with pre-fix baseline and diff shape; evidence: task-6-report.md:40
- Pre-fix baseline at 31490ea was already 146 passed / 1 skipped (env skip); the fix commit touches only `backend/app/main.py` (no test files) with a 4-line kwargs-forwarding change whose defaults reproduce old behavior when keys are absent — suite count unchanged is exactly what is expected. Commit-stat check confirms single-file scope (`backend/app/main.py`, 423+/6-; HEAD == b06d3f8). Current working-tree dirt (post-head user modifications across docs/tests/tools) does not invalidate the head-run evidence. No re-run per read-only instruction.

## Open list: none. Next step: merge (keep b06d3f8 message on squash so user-work provenance survives).
