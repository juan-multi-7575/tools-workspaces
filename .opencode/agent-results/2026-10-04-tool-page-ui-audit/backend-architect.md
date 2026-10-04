# Backend Architect — P3 fixes #12–#15

- **source set**: 2026-10-04-tool-page-ui-audit
- **agent name**: backend-architect
- **plan**: `docs/superpowers/plans/2026-10-04-tool-page-ui-audit.md` (P3 #12–#15)
- **scope**: `backend/` only. No file under `frontend/` was created, edited or deleted.

Commits (one per fix, explicit paths, no `git add -A`):

| # | commit | files |
|---|---|---|
| 13 | `b519ec6` fix(script_runner): give every standalone run its own dir and log | `backend/app/tools/script_runner.py`, `backend/app/runners/subprocess_runner.py`, `backend/tests/test_37_script_runner_run_isolation.py` |
| 14 | `a6e4040` fix(deps): retire the privileged install path in upgrade_package | `backend/app/deps.py`, `backend/app/main.py` (comment only), `backend/tests/test_08_settings.py` |
| 15 | `382e010` fix(image_tools): point the missing-exiftool error at the dependency manager | `backend/app/tools/image_tools.py` |

---

## #12 — `OcrMyPdfPage` ungated "read text layer" action (report only, no frontend edit)

**The backend mapping is already correct. It was not changed.**

- **evidence**: `backend/app/tools/deps_map.py:47` — `"pdf_tools": ["conda.poppler"],`
- **evidence**: `backend/app/depmgr/catalog.py:114-122` — `conda.poppler` is `packages=("poppler",)`, `provides=("pdftotext", "pdfinfo")`, which is exactly what the tool shells out to: `backend/app/tools/doc_tools.py:119` (`pdftotext`) and `backend/app/tools/doc_tools.py:139` (`pdfinfo`).
- **evidence**: `tools_for_dep("conda.poppler") == ['pdf_tools']` — blast radius is exactly right (verified by running it, not by reading).
- **evidence**: `GET /api/tools/pdf_tools/deps` with nothing installed returns
  `{"tool_id": "pdf_tools", "ready": false, "missing": ["conda.poppler"], ...}` (route: `backend/app/main.py:772`). The data the frontend needs already exists and is per-tool.

So nothing backend-side is missing. What the frontend needs (for whoever owns `frontend/`):

- **finding**: the "read text layer" step is not a second button. It is an **auto-chained** call fired from the completion effect: `frontend/src/pages/tools/OcrMyPdfPage.tsx:96` — `await read.run({ input_path: artifact.path, action: 'extract_text' })` where `read = useToolExecute('pdf_tools')` (line 57). The only gate on the page is `deps = useToolDeps('ocrmypdf')` (line 56), applied to the single Run button (line ~236, `disabled={busy || !deps.ready}`) and to `<DependencyGate toolId="ocrmypdf" state={deps} />` (line 225).
- **consequence**: with `conda.ocrmypdf` installed and `conda.poppler` missing, OCR succeeds and the chained read fires anyway; the page then shows `readError` (line 114) carrying the backend's `pdftotext not installed` (honest, but a dead end for the user — no install affordance is attached to it).
- **what to do**: add `const readDeps = useToolDeps('pdf_tools')` and (a) fold `!readDeps.ready` into the Run button's disabled condition so the real gap is visible *before* running, and (b) skip the chained `read.run(...)` when `readDeps.ready === false`, rendering the missing dep with the existing `<DependencyGate toolId="pdf_tools" … />` affordance instead of a bare failure string. The OCR artifact should still be shown — only the text read is blocked.
- **second ungated entry point worth checking**: the `ToolResultPanel … toolId="pdf_tools"` re-run panel at `OcrMyPdfPage.tsx:369-375` can re-trigger the same read with poppler missing; it needs the same condition.

---

## #13 — `script_runner` leaked output and artifacts across runs (FIXED)

Two independent causes, both real:

- **evidence**: `backend/app/runners/subprocess_runner.py:141` (pre-fix) — `log_handle = log_file.open("a", encoding="utf-8")`. Run 2's log therefore contained run 1's stdout, and `script_runner.py:80` reads that same file back into `output_text` / `data["stdout"]`, which is what the page renders.
- **evidence**: `backend/app/tools/script_runner.py:76` (pre-fix) — artifacts were built from `dest_dir.iterdir()` over the single shared `downloads/script_runner/`, so files left by earlier runs were listed as this run's artifacts.

### Fix

- **evidence**: `backend/app/tools/script_runner.py:38-44` — a standalone run now writes into `tool_downloads_dir(f"script_runner.{uuid.uuid4().hex[:12]}")`, a **sibling** of the tool directory rather than a child of it. The sibling placement is load-bearing: `backend/app/main.py:273` globs exactly `dl_base.glob("*/*")`, so a nested `downloads/script_runner/<run>/file` would have silently vanished from `/api/artifacts/recent` and with it from the artifacts panel.
- **evidence**: `backend/app/runners/subprocess_runner.py:115-125` — `run()` gained `truncate_log: bool = False`, and line 141 opens `"w"` when set, `"a"` otherwise.
- **evidence**: `backend/app/tools/script_runner.py:74-79` — `truncate_log=standalone`.

### On the `declarative.py` question (checked, as instructed)

`backend/app/tools/declarative.py:66,71` shares one `execution.log` across every step of a run — that accumulation is intentional there, so truncation is **opt-in per call, not global**. With the default left at `False`, `declarative.py` is byte-for-byte unchanged in behaviour, and workspace/pipeline `script_runner` runs are unchanged too: `run_dir()` (`backend/app/paths.py:78`) is already per-run, so nothing carries over there and the shared-dir log still accumulates across the steps of one run. `tests/test_37_script_runner_run_isolation.py::test_log_truncation_is_opt_in_per_call` pins that contract (append by default, truncate on request).

### Red / green evidence

Test written and run **before** the fix — RED, `backend/tests/test_37_script_runner_run_isolation.py`:

```
$ ../.venv/bin/python -m pytest tests/test_37_script_runner_run_isolation.py -q
FF                                                                       [100%]
=================================== FAILURES ===================================
_ test_second_standalone_run_reports_only_its_own_output_and_artifacts[asyncio] _
...
>       assert RUN_ONE_MARKER not in reported, "run 2 reported run 1's stdout as its own output"
E       AssertionError: run 2 reported run 1's stdout as its own output
E       assert 'RUN-ONE-MARKER-9f2c' not in '[stdout] RU...ARKER-4b71\n'
E
E         'RUN-ONE-MARKER-9f2c' is contained here:
E           [stdout] RUN-ONE-MARKER-9f2c
E           [stdout] RUN-TWO-MARKER-4b71

    def run_once(marker: str, *, truncate: bool) -> None:
        runner = AsyncSubprocessRunner(...)
>       res = await runner.run(log_file=log, truncate_log=truncate)
E       TypeError: AsyncSubprocessRunner.run() got an unexpected keyword argument 'truncate_log'

tests/test_37_script_runner_run_isolation.py:79: TypeError
=========================== short test summary info ============================
FAILED tests/test_37_script_runner_run_isolation.py::test_second_standalone_run_reports_only_its_own_output_and_artifacts[asyncio]
FAILED tests/test_37_script_runner_run_isolation.py::test_log_truncation_is_opt_in_per_call[asyncio]
2 failed, 1 warning in 0.23s
```

After the fix — GREEN:

```
$ ../.venv/bin/python -m pytest tests/test_37_script_runner_run_isolation.py -q
..                                                                        [100%]
2 passed, 1 warning in 1.93s
```

(Same command run alongside the suites most likely to regress: `tests/test_13_runners.py tests/test_15_expanded_catalog.py tests/test_03_pipelines_and_runs.py` → `16 passed`.)

---

## #14 — privileged install path in `app/deps.py` (FIXED)

**Chosen option: delete the privileged branch, and have `upgrade_package()` refuse the packages `app/depmgr` owns with a message naming the dep id — i.e. the "clear response pointing at the dependency manager" option, not delegation.**

- **evidence**: `backend/app/deps.py` pre-fix lines 83-93 shelled out to `["apt-get", "install", "-y", "libimage-exiftool-perl"]` with `sudo` inserted when `shutil.which("sudo")` found it. Reachable from `POST /api/settings/deps/update` (`backend/app/main.py:725-737`).
- **evidence**: `"apt_package": "libimage-exiftool-perl"` removed from `PINNED_DEPENDENCIES`; it existed only to feed that branch.

**Why refusal over delegating to depmgr.** `app/depmgr/installer.py:455 install()` is `async` and streams progress; this endpoint is a synchronous call that must keep returning a plain dict — the existing tests monkeypatch `app.main.upgrade_package` (`tests/test_08_settings.py:78`, `:164`) and assert the endpoint returns that dict verbatim. Delegating would have meant rewriting the endpoint's contract and its tests, which is a larger change than the defect warrants. Refusal keeps `/api/settings/deps` doing the one thing it is still good at (reporting installed vs. latest) and leaves exactly one install authority.

**Why the pip branch stays.** It is neither privileged nor system-wide: it upgrades inside this app's own virtualenv. What I removed from it is yt-dlp/gallery-dl, because `app/depmgr` already provisions those (`conda.ytdlp`, `pip.gallery_dl`) under the deps root and `_apply_tool_deps` (`backend/app/runners/subprocess_runner.py:70-85`) *prepends* the dep root to `PATH` — so a venv copy is shadowed when the managed one exists, and when it does not, `/api/deps` would report the dependency missing while the tool quietly worked off the venv copy. That is a status lie, which is worse than a refused upgrade. `faster-whisper` has no managed dep, so its in-venv pip upgrade is untouched.

**Tradeoff, stated plainly**: `POST /api/settings/deps/update {"package":"yt-dlp","channel":"nightly"}` no longer performs a pre-release upgrade — that branch became unreachable once yt-dlp is refused, so I deleted it rather than leave dead code. No frontend code calls this endpoint (`updateDep` in `frontend/src/lib/api.ts:433-439` has zero callers outside that file), so nothing in the product reaches the old behaviour. If nightly yt-dlp matters, it belongs in `app/depmgr/catalog.py` as a channel on `conda.ytdlp`, not back on this path.

- **evidence**: `backend/app/deps.py:20-28` — new `MANAGED_BY_DEPMGR = {"yt-dlp": "conda.ytdlp", "gallery-dl": "pip.gallery_dl", "exiftool": "conda.exiftool"}`.
- **evidence**: `backend/app/deps.py:91-121` — refusal returns `{"ok": False, "package": ..., "error": "<pkg> is installed and upgraded by the dependency manager, not here. Install it with POST /api/deps/install using dep_id '<id>', or from the Dependencies console."}`.
- **evidence**: `backend/app/main.py:740-745` — the section comment said "which is the legacy apt/pip updater", which my change made false; corrected. No other `main.py` change.

New tests in `backend/tests/test_08_settings.py`: refusal names the right dep id and never shells out; no command ever contains a privileged tool; and an AST walk of `app/deps.py` (same shape as the existing installer guard at `tests/test_36_depmgr.py:449`). The AST guard was checked against the pre-fix file — it reports `OLD offenders: ['apt-get', 'sudo', 'sudo']` / `NEW offenders: []`.

### Verification: no privileged install path remains

```
$ grep -rn "apt install\|apt-get\|sudo " backend/app frontend/src ; echo "exit $?"
--- grep exit: 1 (1 = no matches) ---
```

Wider sweep including tests and the remaining docstring mentions of the guarantee (`backend/app/depmgr/__init__.py:5`, `catalog.py:4`, `installer.py:1`) plus the guard tests' own token lists (`tests/test_36_depmgr.py:457`, `tests/test_08_settings.py:111,123`) — no executable reference to a privileged package manager remains anywhere. `docs/research/tool-catalog-ideas.md` also mentions `apt install` in prose, for tools that were never implemented; it is not an install path and was left alone.

---

## #15 — wrong install advice for exiftool (FIXED)

- **evidence**: `backend/app/tools/image_tools.py:12-16` — new module constant `EXIFTOOL_MISSING`: *"exiftool is not installed. It is the managed dependency conda.exiftool and can be installed from the Dependencies console on this page."*
- **evidence**: `backend/app/tools/image_tools.py:121` and `:148` — both the `inspect` and the `scrub` branch now return that message. `conda.exiftool` exists and installs root-free (`backend/app/depmgr/catalog.py:94-101`, `provides=("exiftool",)`), so the old apt advice named a privileged install the app neither performs nor needs.

---

## Test status — real output

Baseline before my work:

```
$ ../.venv/bin/python -m pytest -q
FAILED tests/test_29_make_tool.py::test_scaffold_dry_run_lists_files - assert...
1 failed, 219 passed, 1 skipped, 1 warning in 13.64s
```

Final, after all three fixes:

```
$ ../.venv/bin/python -m pytest -q
FAILED tests/test_29_make_tool.py::test_scaffold_dry_run_lists_files - assert...
1 failed, 224 passed, 1 skipped, 1 warning in 10.47s
```

Failure count unchanged at 1. The single failure is the pre-existing `test_29_make_tool.py::test_scaffold_dry_run_lists_files` path bug (it looks for `backend/backend/tools/make-tool.py`), which I did not touch. `219 → 224` passed = 5 new tests (2 in `test_37_script_runner_run_isolation.py`, 3 in `test_08_settings.py`), 0 removed.

---

## Could not fix truthfully / left alone

1. **`frontend/` untouched, so #12 is not fixed — only diagnosed.** The gate change belongs to the frontend agent; the backend mapping it depends on is already correct, which I verified by running it.
2. **Workspace/pipeline `script_runner` runs still collect artifacts with `iterdir()` over the shared run directory** (`backend/app/tools/script_runner.py:92`), so a pipeline that runs `script_runner` after another step can list that step's files as its own artifacts. Same as `declarative.py`, which has the same shape. I left it because the instruction was to preserve workspace/pipeline behaviour and `run_dir()` is already per-run, so there is no cross-*run* leak. Fixing it properly means a before/after file-set diff like `declarative.py:39,84-85`. Not done — flagging it.
3. **Standalone script-run directories accumulate**: each run now gets `downloads/script_runner.<token>/` and nothing prunes old ones. Previously the files also accumulated (in one shared directory), so this is not a regression, but per-run directories make the count grow faster. No retention policy was added — that is product scope, not a bug fix.
4. **The yt-dlp nightly upgrade is gone** from `/api/settings/deps/update` (see the tradeoff note above).
5. I could not register this session with `register_session` because no session ID was provided to me; the findings file is on disk at `.opencode/agent-results/2026-10-04-tool-page-ui-audit/backend-architect.md`.