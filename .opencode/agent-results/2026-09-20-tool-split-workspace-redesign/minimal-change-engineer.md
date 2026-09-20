# Task 6 Report: GC dry-run-first collector plus full suite

- source set: 2026-09-20-tool-split-workspace-redesign
- agent name: minimal-change-engineer

## What was done
- finding: Added `gc_runs(workspace_id, older_than_days=30, keep_starred=True, dry_run=True)` to `backend/app/workspaces.py`, returning `{"candidates", "deleted"}`; never deletes on `dry_run=True`.
  - evidence: backend/app/workspaces.py:613
- finding: Predicate implements the BINDING controller ruling (overrides brief): candidate iff older than cutoff AND (`visibility` in ("scratch","failed") OR `status` in ("failed","error")) AND not starred-kept. Reason: API failures record `status=failed` while `visibility` defaults to `success`, so visibility-only filtering would never collect real failures.
  - evidence: backend/app/workspaces.py:618
- finding: Extended `backend/tests/test_30_workspace_visibility.py` with `test_gc_dry_run_lists_but_keeps` (brief's assertions + controller extension: a failed-status/visibility-success old run is asserted IN candidates; a fresh completed run asserted OUT; manifest still present after dry run).
  - evidence: backend/tests/test_30_workspace_visibility.py:97
- finding: No new imports needed (`time` already imported); `list_runs` already surfaces `status`/`visibility` keys, so no `list_runs` change. `starred` is not surfaced by `list_runs` (falsy via `.get`), kept as-is per minimal-change — no `list_runs` expansion.
  - evidence: backend/app/workspaces.py:6, backend/app/workspaces.py:159

## TDD record
- Test written first, ran `test_gc_dry_run_lists_but_keeps` → FAILED (`gc_runs` undefined) as expected.
- After implementation: target file 4 passed; full suite `PYTHONPATH=backend .venv/bin/pytest backend/tests/ -q` → **146 passed, 1 skipped** (pre-existing env skip; `sox`-type binary skips fine).

## Commit
- `31490ea feat(workspaces): dry-run-first GC collector` — exactly 2 files, 37 insertions: `backend/app/workspaces.py` (+16), `backend/tests/test_30_workspace_visibility.py` (+21). No other files staged (working tree has unrelated pre-existing user-dirty files, untouched).

## Scope self-check
- Task verbs: add `gc_runs`, extend test file, full suite green, commit two files only. Done, nothing more.
- Tempted but NOT done: surfacing `starred` in `list_runs`; testing non-dry-run deletion path; refactoring neighboring GC/media helpers. Filed here as follow-ups, not in diff.
- Diff could not be smaller: every line is load-bearing for the predicate or the test.

## Concerns
- None blocking. Note: `save_run_meta` writes the raw `record` (without defaulted timestamp) to `meta.json` while the manifest gets the defaulted timestamp — irrelevant here since the test passes explicit timestamps and `list_runs` reads manifests. Left untouched as out of scope.
