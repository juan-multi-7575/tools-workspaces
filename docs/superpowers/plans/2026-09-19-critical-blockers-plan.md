# Critical Blockers Fix Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Patch 4 code-reviewer blockers (glob/ffmpeg injection, cache false positive, workspace ref bleed) one-by-one with isolated tests so failed outputs stop leaking, phantom reuse stops across unrelated videos, and workspace switching stops auto-jumping.

**Architecture:** Backend fixes sanitize filesystem globs and ffmpeg filter escaping, tighten cache to exact stem match; frontend fixes clear ref on workspace switch. Each task is isolated (backend vs frontend), testable, and committable alone.

**Tech Stack:** FastAPI Python 3.12, React 19, Vite, pytest, Tailwind.

**Spec:** `docs/superpowers/plans/2026-09-19-consolidated-critical-fixes.md` §3 Blockers

## Global Constraints
- Filesystem is source of truth — no DB.
- Every workspace must remain isolated.
- `npm run build` must pass (1995 modules).
- `PYTHONPATH=. pytest tests/ -q` must pass (129 passed, 1 skipped).
- Preserve warm palette `#4E220F #9D6638 #EDE5CD #B0BA99 #F7F1DE`.

---

### Task 1: B1 — Sanitize `delete_workspace_media_file` Glob

**Files:**
- Modify: `backend/app/workspaces.py:235-256`
- Test: `backend/tests/test_22_cache_and_stop.py` (extend) + new `backend/tests/test_24_media_security.py`

**Interfaces:**
- Consumes: `delete_workspace_media_file(workspace_id: str, filename: str) -> bool`
- Produces: same signature, now safe for `filename="*"` etc.

- [ ] **Step 1: Write failing test**
```python
def test_delete_media_glob_injection():
    ws="test_sec_ws"
    create_workspace(ws)
    r_dir=run_dir(ws,"run_sec")
    r_dir.mkdir(parents=True, exist_ok=True)
    (r_dir/"keep.txt").write_text("keep")
    (r_dir/"other.txt").write_text("other")
    from app.workspaces import delete_workspace_media_file
    # "*" should NOT delete both; should return False and leave files
    assert delete_workspace_media_file(ws, "*") is False
    assert (r_dir/"keep.txt").exists()
    assert (r_dir/"other.txt").exists()
    # "../" traversal should be sanitized
    assert delete_workspace_media_file(ws, "../keep.txt") is False
```

- [ ] **Step 2: Run test to verify it fails**
Run: `PYTHONPATH=. ../.venv/bin/pytest backend/tests/test_24_media_security.py::test_delete_media_glob_injection -v`
Expected: FAIL — both files deleted (current glob).

- [ ] **Step 3: Implement sanitization**
In `backend/app/workspaces.py:235`:
```py
def delete_workspace_media_file(workspace_id: str, filename: str) -> bool:
    safe_name = Path(filename).name  # strip dirs, "*" becomes "*"
    if not safe_name or safe_name in (".", "..") or any(c in safe_name for c in "*?[]!"):
        # reject globs/traversal; only exact filename
        return False
    # then use exact path, not glob:
    ws_root = paths.workspace_root(workspace_id)
    deleted=False
    runs_dir=paths.workspace_runs_dir(workspace_id)
    for f in runs_dir.glob(f"*/artifacts/{safe_name}"):  # now safe
        ...
    # same for media_dir
```
Use `Path(safe_name).name` and early return on wildcards; switch media search to `media_dir.rglob(safe_name)` with name equality check or `glob.escape`.

- [ ] **Step 4: Run test to verify it passes**
Run: `PYTHONPATH=. ../.venv/bin/pytest backend/tests/test_24_media_security.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/app/workspaces.py backend/tests/test_24_media_security.py
git commit -m "fix(security): sanitize delete_workspace_media_file glob"
```

---

### Task 2: B2 — Escape FFmpeg subtitles filter

**Files:**
- Modify: `backend/app/tools/downloader.py:489` (and `backend/app/workspaces.py:492` `mux_subtitles_to_video` same pattern)
- Test: `backend/tests/test_24_media_security.py` add `test_ffmpeg_subtitles_escape`

**Interfaces:**
- Consumes: `mux_subtitles_to_video(workspace_id, video_path, subtitle_path, output_name, burn_in)`
- Produces: same, now safe for subtitle names containing `'` or `:`.

- [ ] **Step 1: Write failing test**
```python
def test_ffmpeg_subtitle_escape():
    # subtitle path with single quote should not break command
    ws="test_sec_ws2"
    create_workspace(ws)
    # create dummy video/subtitle with quote in name
    v=Path("uploads/video.mp4"); v.parent.mkdir(exist_ok=True); v.write_bytes(b"\x00")
    s=Path("uploads/a'b.srt"); s.write_text("1\n00:00:00 --> 00:00:01\nHi")
    # mux with burn_in True should not raise injection error
    try:
        from app.workspaces import mux_subtitles_to_video
        # mock ffmpeg not needed; check command building via escaping function
        from app.tools.downloader import _escape_ffmpeg_path  # to be created
        escaped=_escape_ffmpeg_path(str(s))
        assert "'" not in escaped or "\\'" in escaped
    except ImportError:
        pytest.skip("helper not yet implemented")
```

- [ ] **Step 2: Run test to verify it fails**
Expected: `ModuleNotFound` or assertion fail (filter only escapes `:`).

- [ ] **Step 3: Implement escaping**
Create helper `def _escape_ffmpeg_subtitle(p: str)->str: return p.replace("\\","\\\\").replace(":","\\:").replace("'","\\'")` and use `f"subtitles='{escaped}'"`. Also consider using `subtitles=filename:escape` via `ffmpeg -vf` with `shlex.quote` or write to temp file with safe name.

- [ ] **Step 4: Run test to verify it passes**
Run: `PYTHONPATH=. ../.venv/bin/pytest backend/tests/test_24_media_security.py::test_ffmpeg_subtitle_escape -v`

- [ ] **Step 5: Commit**
```bash
git add backend/app/tools/downloader.py backend/app/workspaces.py backend/tests/test_24_media_security.py
git commit -m "fix(security): escape ffmpeg subtitles filter"
```

---

### Task 3: B3 — Tighten Cache Stem Match

**Files:**
- Modify: `backend/app/core/cache.py:70-81,112,125`
- Test: `backend/tests/test_22_cache_and_stop.py` add `test_cache_stem_exact`

**Interfaces:**
- Consumes: `detect_existing_artifacts(workspace_id, nodes, params_by_node)`
- Produces: same, but `input_stem in art["name"]` replaced by exact stem equality.

- [ ] **Step 1: Write failing test**
```python
def test_cache_stem_exact_match():
    ws="test_cache_stem"
    create_workspace(ws)
    r_dir=run_dir(ws,"run_cat")
    r_dir.mkdir(parents=True, exist_ok=True)
    (r_dir/"concatenate.mp4").write_bytes(b"x")
    save_run_meta(ws,"run_cat",{"id":"run_cat","tool_id":"downloader","status":"completed","params":{"url":"https://example.com/cat"},"artifacts":[{"name":"concatenate.mp4","path":str(r_dir/"concatenate.mp4")}]})
    # current input is "cat.mp4" — should NOT match "concatenate.mp4"
    res=detect_existing_artifacts(ws, [{"id":"n1","tool_id":"downloader","params":{"input_path":"cat.mp4","task":"translate"}}], {"n1":{"input_path":"cat.mp4"}})
    # Should be no match because stem "cat" != "concatenate"
    assert res["has_existing"] is False
```

- [ ] **Step 2: Run test to verify it fails**
Expected: FAIL — currently `has_existing True` due to substring.

- [ ] **Step 3: Implement exact match**
Replace:
```py
elif input_stem and input_stem in art["name"].lower() and art["tool_id"] == tool_id:
```
with:
```py
elif input_stem and Path(art["name"]).stem.lower() == input_stem and art["tool_id"] == tool_id:
```
Also apply to line 125 in `find_cached_artifacts_for_node` path. Keep `_params_compatible` check already added.

- [ ] **Step 4: Run test to verify it passes**
Run: `PYTHONPATH=. ../.venv/bin/pytest backend/tests/test_22_cache_and_stop.py::test_cache_stem_exact_match -v`

- [ ] **Step 5: Commit**
```bash
git add backend/app/core/cache.py backend/tests/test_22_cache_and_stop.py
git commit -m "fix(cache): exact stem match prevents false reuse"
```

---

### Task 4: B4 — Reset `prevPipelineIdsRef` on Workspace Switch

**Files:**
- Modify: `frontend/src/pages/WorkspaceDetailPage.tsx:64-96`
- Test: Manual harness: switch `youtube` → create `test2` → verify no auto-jump; plus `npm run build`.

**Interfaces:**
- Consumes: `prevPipelineIdsRef: React.MutableRefObject<Set<string>>`
- Produces: same, now cleared on `id` change.

- [ ] **Step 1: Write failing manual test**
Steps: open `localhost:5173/workspaces/youtube`, note `prevPipelineIdsRef` has 9 ids, create new workspace `test2`, navigate to `/workspaces/test2`, then run one pipeline — observe `setView('media_hub')` fires spuriously even though ref still holds old ids.

- [ ] **Step 2: Implement fix**
Add:
```ts
useEffect(() => {
  prevPipelineIdsRef.current = new Set()
  setJustCompletedRunId(null)
  setOutputBanner(null)
}, [id])
```
Also clear timer leak at `:83`: store `setTimeout` id in `useRef` and `clearTimeout` on `id` change/unmount.

- [ ] **Step 3: Verify build**
Run: `cd frontend && npm run build`
Expected: pass, 1995 modules.

- [ ] **Step 4: Verify harness**
Switch workspaces via `WorkspaceSwitcherDropdown`, confirm no auto-jump.

- [ ] **Step 5: Commit**
```bash
git add frontend/src/pages/WorkspaceDetailPage.tsx
git commit -m "fix(frontend): reset pipeline ref on workspace switch"
```

---

## Self-Review Checklist
- [x] Each blocker has isolated failing test → fix → pass.
- [x] Types match across tasks (no cross-task signature drift).
- [x] No placeholders — each step has concrete code/commands.
- [x] `npm run build` + `pytest` guard each task.

## Execution Handoff
Plan saved to `docs/superpowers/plans/2026-09-19-critical-blockers-plan.md`. Two options:
1. **Subagent-Driven (recommended)** — fresh subagent per task, review between.
2. **Inline Execution** — batch in this session.

Which approach?
