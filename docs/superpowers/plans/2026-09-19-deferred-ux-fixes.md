# Deferred UX Fixes — Post-Critical Blockers

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement task-by-task. Steps use checkbox syntax.

**Goal:** Decongest and clarify outputs after critical security/cache fixes — hide scratch files, group timeline per pipeline, fix modal a11y, and auto-collapse palette on mobile.

**Architecture:** Backend filters `*_scratch.*` from media; frontend groups `pipelineRuns` by `pipeline_run_id` correctly and adds a11y/mobile handling. Each task isolated.

**Tech Stack:** FastAPI, React 19, Vite, Tailwind.

**Spec:** `docs/superpowers/plans/2026-09-19-consolidated-critical-fixes.md` + browser-harness audit 2026-09-19 + code-reviewer suggestions (deferred minors)

## Global Constraints
- `npm run build` must pass (1995 modules).
- `PYTHONPATH=. pytest tests/ -q` must pass (129 passed).
- Preserve warm palette.
- No DB — filesystem truth.

---

### Task 1: Hide Scratch / Intermediate Files

**Files:**
- Modify: `backend/app/workspaces.py:334-340` (list_workspace_media)
- Modify: `frontend/src/components/workspaces/UnifiedMediaRunsHub.tsx` (Files tab filter)
- Test: `backend/tests/test_25_media_filter.py`

**Interfaces:**
- Consumes: `list_workspace_media(workspace_id)`
- Produces: same, but `*_scratch.*` and `*_asr_scratch.*` excluded from `all_files` and `packages`.

- [ ] **Step 1: Write failing test**
```python
def test_scratch_hidden():
    ws="test_scratch_hide"
    create_workspace(ws)
    r=run_dir(ws,"run1"); r.mkdir(parents=True, exist_ok=True)
    (r/"video.mp4").write_bytes(b"x")
    (r/"video_asr_scratch.wav").write_bytes(b"x")
    (r/"a_b.srt").write_bytes(b"x")
    save_run_meta(ws,"run1",{"id":"run1","tool_id":"transcriber","status":"completed","params":{},"artifacts":[{"name":"video.mp4","path":str(r/"video.mp4")},{"name":"video_asr_scratch.wav","path":str(r/"video_asr_scratch.wav")}]})
    from app.workspaces import list_workspace_media
    res=list_workspace_media(ws)
    names=[f["name"] for f in res["all_files"]]
    assert "video.mp4" in names
    assert "video_asr_scratch.wav" not in names
```

- [ ] **Step 2: Run test to fail**
`PYTHONPATH=. ../.venv/bin/pytest tests/test_25_media_filter.py::test_scratch_hidden -v` → FAIL (scratch present).

- [ ] **Step 3: Implement filter**
In `workspaces.py` loop `for f in target_dir.iterdir()` add early `if "_scratch" in f.name or f.name.startswith("scratch_"): continue` before `cat = _categorize_file`.

- [ ] **Step 4: Run test to pass**
Same pytest → PASS.

- [ ] **Step 5: Commit**
`git add backend/app/workspaces.py backend/tests/test_25_media_filter.py && git commit -m "fix(media): hide scratch intermediates"`

---

### Task 2: Timeline Grouping Per Pipeline

**Files:**
- Modify: `backend/app/workspaces.py:400-458` (`list_pipeline_runs`)
- Modify: `frontend/src/components/workspaces/UnifiedMediaRunsHub.tsx:380-500` (render)
- Test: `backend/tests/test_25_media_filter.py` add `test_pipeline_grouping`

**Interfaces:**
- Consumes: `list_runs` raw steps
- Produces: `pipeline_runs` where each DAG `pipeline_run_id` groups its 2-3 steps, sorted by `timestamp desc`.

- [ ] **Step 1: Write failing test**
```python
def test_pipeline_grouping():
    ws="test_group"
    create_workspace(ws)
    # simulate DAG with 3 steps sharing same pipeline_run_id
    for i,tool in enumerate(["downloader","audio_processor","transcriber"]):
        rid=f"run_{i}"
        r=run_dir(ws,rid); r.mkdir(parents=True, exist_ok=True)
        (r/"out.txt").write_bytes(b"x")
        save_run_meta(ws,rid,{"id":rid,"tool_id":tool,"status":"completed","pipeline_run_id":"pipe_123","pipeline_name":"YouTube→English","timestamp":1000+i,"artifacts":[]})
    res=list_pipeline_runs(ws)
    assert len(res)==1
    assert res[0]["pipeline_run_id"]=="pipe_123"
    assert len(res[0]["steps"])==3
```

- [ ] **Step 2: Run fail**
→ FAIL (currently 3 groups because old runs lack `pipeline_run_id` fallback mishandled).

- [ ] **Step 3: Fix grouping**
Ensure `list_runs` preserves `pipeline_run_id` from manifest (already does via `mdata.get("pipeline_run_id")`), and `list_pipeline_runs` uses `run.get("pipeline_run_id") or run.get("id")` only if truly missing; sort steps by `timestamp` within group.

- [ ] **Step 4: Run pass**
→ PASS.

- [ ] **Step 5: Commit**
`git add backend/app/workspaces.py backend/tests/test_25_media_filter.py frontend/src/components/workspaces/UnifiedMediaRunsHub.tsx && git commit -m "fix(timeline): group per pipeline_run_id"`

---

### Task 3: Modal A11y — role/dialog, ESC, focus trap

**Files:**
- Modify: `frontend/src/components/pipeline/UniversalPipelineRunModal.tsx:217-280`
- Test: Manual harness + `npm run build`

- [ ] **Step 1: Manual failing check**
Open Run Pipeline modal, inspect `document.querySelector('[role=\"dialog\"]')` → `null`, press `Escape` → modal stays.

- [ ] **Step 2: Implement**
Add `role="dialog" aria-modal="true" aria-labelledby="run-pipeline-title"` to outer div, `id="run-pipeline-title"` to title, `useEffect` to trap focus and listen `keydown Escape` → `onClose()`, return focus on close.

- [ ] **Step 3: Verify**
`npm run build` pass; harness `querySelector('[role=dialog]')` truthy, Escape closes.

- [ ] **Step 4: Commit**
`git add frontend/src/components/pipeline/UniversalPipelineRunModal.tsx && git commit -m "fix(a11y): modal dialog role and ESC"`

---

### Task 4: Mobile Palette Auto-Collapse

**Files:**
- Modify: `frontend/src/pages/WorkspaceDetailPage.tsx:47-50,206-260`
- Test: Harness 390×844 + `npm run build`

- [ ] **Step 1: Manual failing check**
At 390px width, palette + inspector both open → canvas <400px, horizontal pills overflow.

- [ ] **Step 2: Implement**
Add `useEffect` with `matchMedia('(max-width: 768px)')` to set `paletteCollapsed=true` and `inspectorCollapsed=true` on mount and on `change` event; drawer already supports `collapsed` prop.

- [ ] **Step 3: Verify**
Harness `innerWidth 390` shows palette collapsed, canvas >70% width.

- [ ] **Step 4: Commit**
`git add frontend/src/pages/WorkspaceDetailPage.tsx && git commit -m "fix(mobile): auto-collapse palette on narrow viewport"`
