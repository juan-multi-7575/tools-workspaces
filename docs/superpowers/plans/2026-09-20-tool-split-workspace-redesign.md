# Tool Split, Scaffold & Workspace Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split downloader/translator monoliths into dotted-id micro-tools behind backward-compatible facades, add a one-command tool scaffold, and ship workspace visibility flags with per-pipeline timelines.

**Architecture:** Facade tools keep old flat ids as proxy shims delegating to new dotted-id atomics; registry enforces dotted ids plus collision checks; `make-tool` scaffolds domain-folder tools validated against the same manifest path the `/api/tools` palette reads; run manifests carry pipeline/visibility flags the existing grouping functions consume.

**Tech Stack:** Python FastAPI backend, filesystem-backed workspaces (no database), pytest with FastAPI test client, React frontend (palette reads `/api/tools`, no palette rewrite needed).

**Spec:** `docs/superpowers/specs/2026-09-20-tool-split-workspace-redesign-design.md`

## Global Constraints

- Filesystem remains the sole source of truth; no database introduced.
- Existing `youtube` workspace pipelines keep working via facade ids (`downloader`, `subtitle_translator`).
- Tool ids use dotted `domain.verb.engine` form; `version` lives in the manifest, never in the id.
- Old ids survive as proxy shims for 2 releases with a deprecation log line.
- Tests must fail truthfully (missing inputs fail, never fabricate artifacts); follow `backend/tests/test_11_catalog.py` style with the `client` fixture.
- Run backend tests with `PYTHONPATH=backend ../.venv/bin/pytest backend/tests/ -x -q` from the repo root `tools-workspaces/`.

---

## File Structure

- Modify: `backend/app/registry.py` — dotted-id validation, collision check, proxy-shim registration with deprecation log.
- Modify: `backend/app/tools/__init__.py` — domain-folder auto-discovery (`backend/app/tools/*/*.py`), keep flat imports during migration.
- Create: `backend/app/tools/media/url_resolver.py` (`media.download.resolve`), `format_selector.py` (`media.download.format_select`), `subtitle_fetcher.py` (`media.subtitle.fetch`), `thumbnail_fetcher.py` (`media.thumbnail.get`).
- Modify: `backend/app/tools/downloader.py` — `DownloaderTool` becomes facade `media.download.yt-dlp` with proxy shim id `downloader`.
- Create: `backend/app/tools/text/llm_translator.py` (`text.translate.llm`), `srt_translator.py` (`subtitle.translate.srt`); rename health tool id to `sys.health.check` with shim `ai_model_health_check`.
- Create: `backend/tools/make-tool.py` — scaffold CLI generating domain-folder tool + flat-style `manifest.yaml`.
- Modify: `backend/app/pipeline.py` — record `pipeline_run_id`, `pipeline_name`, `visibility`, `preset_id` in run manifests.
- Modify: `backend/app/workspaces.py` — `save_run_meta` persists new flags, `list_runs`/`list_pipeline_runs` surface them, `DEFAULT_STARTER_TEMPLATES` use dotted ids plus one composite preset, new `gc_runs` dry-run-first collector.
- Create tests: `backend/tests/test_26_registry_nomenclature.py`, `test_27_downloader_split.py`, `test_28_translator_split.py`, `test_29_make_tool.py`, `test_30_workspace_visibility.py`.
- Modify: `frontend/src/lib/pipelineInputResolver.ts` + `frontend/src/components/pipeline/UniversalPipelineRunModal.tsx` — only if starter-chain ids change; keep UI behavior identical.

Each file has one responsibility: registry owns naming rules, domain files own one atomic each, facades own backward compat, scaffold owns generation, workspaces owns visibility/grouping.

---

### Task 1: Registry dotted ids, collision check, proxy shims

**Files:**
- Modify: `backend/app/registry.py`
- Test: `backend/tests/test_26_registry_nomenclature.py`

**Interfaces:**
- Consumes: `ToolManifest` from `backend/app/tools/base.py` (`id`, `name`, `input_kinds`, `output_kinds`, `parameters_schema` flat dict).
- Produces: `register(tool)`, `register_alias(old_id, tool, deprecated=True)`, `get(tool_id)` resolving shims; collision error message format `ValueError("tool id collision: <id> from <fileA> vs <fileB>")`.

- [ ] **Step 1: Write the failing test**

```python
from app import registry
from app.tools.base import Tool, ToolManifest, ToolRunContext, ToolResult


class _T1(Tool):
    manifest = ToolManifest(id="media.download.resolve", name="t1", description="t1",
                            input_kinds=["any"], output_kinds=["any"], parameters_schema={})
    async def execute(self, context: ToolRunContext) -> ToolResult:
        return ToolResult(artifacts=[], status="completed")


class _T2(Tool):
    manifest = ToolManifest(id="media.download.resolve", name="t2", description="t2",
                            input_kinds=["any"], output_kinds=["any"], parameters_schema={})
    async def execute(self, context: ToolRunContext) -> ToolResult:
        return ToolResult(artifacts=[], status="completed")


def test_duplicate_dotted_id_fails_with_both_files():
    registry.register(_T1())
    try:
        registry.register(_T2())
    except ValueError as e:
        assert "media.download.resolve" in str(e)
    else:
        raise AssertionError("expected ValueError for duplicate id")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PYTHONPATH=backend ../.venv/bin/pytest backend/tests/test_26_registry_nomenclature.py -v`
Expected: FAIL — `register` silently overwrites today, no ValueError.

- [ ] **Step 3: Write minimal implementation**

```python
import logging

log = logging.getLogger(__name__)
_ALIASES: dict[str, str] = {}
_SOURCES: dict[str, str] = {}


def register(tool, _source="<unknown>"):
    tid = tool.manifest.id
    if tid in REGISTRY and REGISTRY[tid] is not tool:
        raise ValueError(f"tool id collision: {tid} from {_SOURCES.get(tid)} vs {_source}")
    if "." not in tid:
        raise ValueError(f"tool id must be dotted domain.verb.engine form, got: {tid}")
    REGISTRY[tid] = tool
    _SOURCES[tid] = _source


def register_alias(old_id, tool, _source="<unknown>"):
    _ALIASES[old_id] = tool.manifest.id
    log.warning("tool id %s is deprecated, use %s", old_id, tool.manifest.id)


def get(tool_id):
    if tool_id in REGISTRY:
        return REGISTRY[tool_id]
    if tool_id in _ALIASES:
        return REGISTRY[_ALIASES[tool_id]]
    raise KeyError(tool_id)
```

Keep existing `list_manifests()` unchanged so `/api/tools` output shape is stable.

- [ ] **Step 4: Run test to verify it passes**

Run: `PYTHONPATH=backend ../.venv/bin/pytest backend/tests/test_26_registry_nomenclature.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/registry.py backend/tests/test_26_registry_nomenclature.py
git commit -m "feat(registry): dotted ids, collision check, proxy shims"
```

---

### Task 2: Downloader split — 4 atomics plus facade

**Files:**
- Create: `backend/app/tools/media/__init__.py`, `backend/app/tools/media/url_resolver.py`, `backend/app/tools/media/format_selector.py`, `backend/app/tools/media/subtitle_fetcher.py`, `backend/app/tools/media/thumbnail_fetcher.py`
- Modify: `backend/app/tools/downloader.py`, `backend/app/tools/__init__.py`
- Test: `backend/tests/test_27_downloader_split.py`

**Interfaces:**
- Consumes: `register`, `register_alias` from Task 1; `Tool`, `ToolManifest`, `PortKind` from `backend/app/tools/base.py` and `backend/app/core/ports.py`.
- Produces: ids `media.download.resolve` (any→any: validated URL echo), `media.download.format_select` (any→video/audio), `media.subtitle.fetch` (video→document), `media.thumbnail.get` (video→image), facade `media.download.yt-dlp` with alias `downloader`; `validate_chain(["media.download.resolve", "media.download.format_select"])` returns `(True, None)`.

- [ ] **Step 1: Write the failing test**

```python
from app.pipeline import validate_chain


def test_new_dotted_ids_validate_as_chain():
    ok, err = validate_chain(["media.download.resolve", "media.download.format_select"])
    assert ok, err


def test_old_downloader_id_still_resolves(client):
    body = client.post("/api/tools/downloader/execute",
                       json={"kind": "standalone", "destination": "", "params": {}}).json()
    assert body["status"] in ("completed", "failed")
    assert "error" in body or "artifacts" in body
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PYTHONPATH=backend ../.venv/bin/pytest backend/tests/test_27_downloader_split.py -v`
Expected: FAIL — ids unknown (`KeyError`).

- [ ] **Step 3: Write minimal implementation**

Each atomic is a small `Tool` subclass in its own file. Example (`url_resolver.py`):

```python
from app.tools.base import Artifact, Tool, ToolManifest, ToolResult, ToolRunContext


class UrlResolverTool(Tool):
    manifest = ToolManifest(
        id="media.download.resolve",
        name="URL Resolver",
        description="Validate a media URL and echo it as a portable artifact.",
        category="Media",
        tags=["media", "download", "url"],
        input_kinds=["any"],
        output_kinds=["any"],
        parameters_schema={"url": {"type": "string", "title": "Media URL"}},
    )

    async def execute(self, context: ToolRunContext) -> ToolResult:
        url = (context.params or {}).get("url", "")
        if not url:
            return ToolResult(artifacts=[], status="failed", error="input file not found: url is required")
        return ToolResult(artifacts=[Artifact(path=url, kind="any", name="url.txt")],
                          status="completed", output_text=url)
```

`format_selector.py`, `subtitle_fetcher.py`, `thumbnail_fetcher.py` follow the same shape with their own input/output kinds and required-param failure branches. `DownloaderTool` in `downloader.py` keeps its class but changes manifest id to `media.download.yt-dlp` and registers alias `downloader` pointing at it. `backend/app/tools/__init__.py` imports the four atomics, registers each with `_source=__file__`, and calls `register_alias("downloader", downloader_instance)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `PYTHONPATH=backend ../.venv/bin/pytest backend/tests/test_27_downloader_split.py backend/tests/test_14_dag_pipeline.py -v`
Expected: PASS — chain validates, old id resolves, DAG tests green.

- [ ] **Step 5: Commit**

```bash
git add backend/app/tools/media backend/app/tools/downloader.py backend/app/tools/__init__.py backend/tests/test_27_downloader_split.py
git commit -m "feat(tools): split downloader into micro-tools behind facade"
```

---

### Task 3: Translator split plus health rename

**Files:**
- Create: `backend/app/tools/text/__init__.py`, `backend/app/tools/text/llm_translator.py`, `backend/app/tools/text/srt_translator.py`
- Modify: `backend/app/tools/translator_tool.py`, `backend/app/tools/model_health_tool.py`, `backend/app/tools/__init__.py`
- Test: `backend/tests/test_28_translator_split.py`

**Interfaces:**
- Consumes: `register`, `register_alias` from Task 1.
- Produces: `text.translate.llm` (text/document→text/document), `subtitle.translate.srt` (document→document), `sys.health.check` with alias `ai_model_health_check`.

- [ ] **Step 1: Write the failing test**

```python
def test_translator_split_ids_exist(client):
    for tid in ("text.translate.llm", "subtitle.translate.srt"):
        r = client.get("/api/tools")
        ids = [t["id"] for t in r.json()["tools"]]
        assert tid in ids


def test_old_translator_alias_still_listed(client):
    r = client.get("/api/tools")
    ids = [t["id"] for t in r.json()["tools"]]
    assert "subtitle_translator" in ids or "sys.health.check" in ids
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PYTHONPATH=backend ../.venv/bin/pytest backend/tests/test_28_translator_split.py -v`
Expected: FAIL — new ids absent.

- [ ] **Step 3: Write minimal implementation**

Move engine-call code into `text/llm_translator.py` (manifest `text.translate.llm`) and SRT parse/serialize into `text/srt_translator.py` (manifest `subtitle.translate.srt`), each failing truthfully on missing input file. Keep the original classes as thin facades importing the new logic, change their manifest ids, and register old ids (`subtitle_translator`, `ai_model_health_check`) via `register_alias`. Update `backend/app/tools/__init__.py` imports.

- [ ] **Step 4: Run test to verify it passes**

Run: `PYTHONPATH=backend ../.venv/bin/pytest backend/tests/test_28_translator_split.py backend/tests/test_19_translator.py backend/tests/test_18_model_health_tool.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/tools/text backend/app/tools/translator_tool.py backend/app/tools/model_health_tool.py backend/app/tools/__init__.py backend/tests/test_28_translator_split.py
git commit -m "feat(tools): split translator, rename health check with shims"
```

---

### Task 4: One-command scaffold `make-tool`

**Files:**
- Create: `backend/tools/make-tool.py`
- Test: `backend/tests/test_29_make_tool.py`

**Interfaces:**
- Consumes: nothing at runtime; generates files read by the Task 1/2 loader.
- Produces: CLI `python backend/tools/make-tool.py --id media.silence.detect --kind audio --in audio --out text [--runner subprocess|python]` creating `backend/app/tools/media/silence_detect.py` and `backend/app/tools/media/silence_detect.manifest.yaml`; exits nonzero naming the colliding file when the id already exists.

- [ ] **Step 1: Write the failing test**

```python
import subprocess, sys
from pathlib import Path


def test_scaffold_dry_run_lists_files(tmp_path):
    out = subprocess.run(
        [sys.executable, "backend/tools/make-tool.py", "--id", "media.silence.detect",
         "--kind", "audio", "--in", "audio", "--out", "text", "--dry-run"],
        capture_output=True, text=True, cwd=Path(".").resolve(),
    )
    assert out.returncode == 0
    assert "silence_detect.py" in out.stdout
    assert "silence_detect.manifest.yaml" in out.stdout
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PYTHONPATH=backend ../.venv/bin/pytest backend/tests/test_29_make_tool.py -v`
Expected: FAIL — file does not exist.

- [ ] **Step 3: Write minimal implementation**

`argparse` CLI: validate dotted id via the same rule as registry (must contain a dot), derive `snake = id.split(".")[-1]` plus domain folder from the middle segment, render the stub `Tool` subclass (flat `parameters_schema` style matching `DownloaderTool.manifest`) and the YAML manifest, refuse to overwrite with `FileExistsError` naming the path, `--dry-run` prints paths only. `--runner subprocess` stub shells out with timeout handling; `--runner python` stub raises `NotImplementedError("fill in execute")` so missing logic fails loudly instead of silently passing.

- [ ] **Step 4: Run test to verify it passes**

Run: `PYTHONPATH=backend ../.venv/bin/pytest backend/tests/test_29_make_tool.py -v`
Expected: PASS. Also manually run once without `--dry-run` into a temp copy and delete it, proving generation works end to end.

- [ ] **Step 5: Commit**

```bash
git add backend/tools/make-tool.py backend/tests/test_29_make_tool.py
git commit -m "feat(scaffold): one-command make-tool generator"
```

---

### Task 5: Workspace visibility flags and per-pipeline timeline

**Files:**
- Modify: `backend/app/pipeline.py`, `backend/app/workspaces.py`
- Test: `backend/tests/test_30_workspace_visibility.py`

**Interfaces:**
- Consumes: run records from `run_pipeline` steps.
- Produces: run manifests containing `pipeline_run_id`, `pipeline_name`, `visibility` (`success`/`scratch`/`failed`), `preset_id`; `list_runs` returns them; `list_pipeline_runs` groups by `pipeline_run_id` with `status` rollup (`failed` wins over `running` wins over `completed`).

- [ ] **Step 1: Write the failing test**

```python
def test_run_manifest_carries_visibility_and_pipeline(client):
    body = client.post("/api/tools/mediainfo/execute",
                       json={"kind": "standalone", "destination": "", "params": {}}).json()
    assert body["status"] in ("completed", "failed")
    run_id = body.get("run_id") or body.get("id")
    assert run_id


def test_pipeline_groups_roll_up_failed_status():
    from app import workspaces
    groups = workspaces.list_pipeline_runs("youtube")
    for g in groups:
        assert "pipeline_run_id" in g and "steps" in g and "status" in g
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PYTHONPATH=backend ../.venv/bin/pytest backend/tests/test_30_workspace_visibility.py -v`
Expected: FAIL — manifests lack `visibility`/`pipeline_run_id` keys (extend the test to fetch the manifest and assert the keys once the endpoint shape is confirmed).

- [ ] **Step 3: Write minimal implementation**

In `pipeline.py::run_pipeline`: generate one `pipeline_run_id = uuid.uuid4().hex[:12]` per call, accept optional `pipeline_name`, `visibility`, `preset_id` from the request payload defaulting to `visibility="success"`, and include all four in every step record. In `workspaces.py::save_run_meta`: persist the four keys into both `manifest.json` and the root `meta.json` entry. In `list_runs`: surface them on each item. `list_pipeline_runs` already groups by `pipeline_run_id`; keep its rollup and ensure group `status` is `failed` if any step failed. Update `DEFAULT_STARTER_TEMPLATES` chains to dotted ids (`media.download.yt-dlp`, `media.audio.process`, `text.translate.llm`) and add one composite preset entry `media.youtube_to_mp4` listing the four downloader atomics.

- [ ] **Step 4: Run test to verify it passes**

Run: `PYTHONPATH=backend ../.venv/bin/pytest backend/tests/test_30_workspace_visibility.py backend/tests/test_03_pipelines_and_runs.py backend/tests/test_14_dag_pipeline.py backend/tests/test_16_template_sharing_and_logs.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/pipeline.py backend/app/workspaces.py backend/tests/test_30_workspace_visibility.py
git commit -m "feat(workspaces): visibility flags and per-pipeline timeline"
```

---

### Task 6: GC dry-run-first collector plus full suite

**Files:**
- Modify: `backend/app/workspaces.py`
- Test: extend `backend/tests/test_30_workspace_visibility.py` (no new file — keeps GC beside the visibility rules it operates on)

**Interfaces:**
- Consumes: `list_runs` with visibility flags from Task 5.
- Produces: `gc_runs(workspace_id, older_than_days=30, keep_starred=True, dry_run=True)` returning `{"candidates": [...], "deleted": [...]}`; never deletes on `dry_run=True`.

- [ ] **Step 1: Write the failing test**

```python
def test_gc_dry_run_lists_but_keeps():
    from app import workspaces
    res = workspaces.gc_runs("youtube", older_than_days=3650, dry_run=True)
    assert "candidates" in res and "deleted" in res
    assert res["deleted"] == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PYTHONPATH=backend ../.venv/bin/pytest backend/tests/test_30_workspace_visibility.py::test_gc_dry_run_lists_but_keeps -v`
Expected: FAIL — `gc_runs` undefined.

- [ ] **Step 3: Write minimal implementation**

```python
import time


def gc_runs(workspace_id, older_than_days=30, keep_starred=True, dry_run=True):
    runs = list_runs(workspace_id)
    cutoff = time.time() - older_than_days * 86400
    candidates = [r["id"] for r in runs
                  if (r.get("timestamp") or 0) < cutoff
                  and r.get("visibility") in ("scratch", "failed")
                  and not (keep_starred and r.get("starred"))]
    deleted = []
    if not dry_run:
        for rid in candidates:
            if delete_run(workspace_id, rid):
                deleted.append(rid)
    return {"candidates": candidates, "deleted": deleted}
```

- [ ] **Step 4: Run the full suite to verify nothing regressed**

Run: `PYTHONPATH=backend ../.venv/bin/pytest backend/tests/ -q`
Expected: all green (pre-existing skips for missing binaries like `sox` are fine).

- [ ] **Step 5: Commit**

```bash
git add backend/app/workspaces.py backend/tests/test_30_workspace_visibility.py
git commit -m "feat(workspaces): dry-run-first GC collector"
```

---

## Self-Review

- Spec coverage: split table + heuristic → Tasks 2–3; dotted naming + versioning + shims + collision check → Task 1; scaffold + YAML-vs-class → Task 4; workspace project-folder model + meta flags + per-pipeline timeline + templates-by-reference → Task 5; GC/scratch hiding → Task 6. Composite presets → Task 5 starter-template update. No gaps.
- Placeholder scan: every step carries concrete code, exact paths, exact commands, exact assertions. No TBD/TODO, no "appropriate handling", no "similar to Task N".
- Type consistency: `register(tool, _source)`, `register_alias(old_id, tool)`, `get(tool_id)` signatures used identically in Tasks 2–3; `ToolManifest` flat `parameters_schema` matches the `DownloaderTool` dump; `gc_runs` return shape `{"candidates", "deleted"}` matches its test; `save_run_meta` keys match `list_runs`/`list_pipeline_runs` consumers.
