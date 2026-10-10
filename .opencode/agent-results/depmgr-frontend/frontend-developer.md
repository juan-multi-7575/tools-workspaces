# Dependency-manager frontend — agent output

- **source set**: depmgr-frontend
- **agent name**: frontend-developer
- **date**: 2026-10-04
- **workspace**: `/home/hruthvik9487/Downloads/drive-download-20260807T051738Z-1-001/tools-workspaces`

## Commits

| SHA | Subject |
|---|---|
| `ab807c4` | feat(frontend): typed client and useToolDeps for the dependency manager |
| `f3fe316` | feat(frontend): inline dependency gate with byte-honest install progress |
| `e6bf3ab` | feat(frontend): gate Run behind a real dependency check on all 22 tool pages |
| `6ff46e2` | feat(frontend): dependency console at /dependencies with remove, re-install and nuke |
| `0e7c337` | fix(frontend): theme the surfaces the dependency console owns, drop a dead rule |

Baseline before this work: `31915e2`, 81/81 tests passing.

## Files created

- `frontend/src/lib/depsApi.ts` — typed client for the six endpoints + `consumeDepStream`
- `frontend/src/hooks/useToolDeps.ts` — hook + exported pure reducer
- `frontend/src/components/deps/DependencyGate.tsx` — inline preflight panel
- `frontend/src/components/deps/DependencyManagerPanel.tsx` — management console
- `frontend/src/tests/depsUi.test.tsx` — 21 tests (reducer + gate + parity + console)

## Files modified

- `frontend/src/index.css` — added `.dep-gate`, `.dep-instrument` scoped blocks (existing rules untouched)
- `frontend/src/App.tsx` — nav entry + `/dependencies` route
- `frontend/src/pages/SettingsPage.tsx` — link to the managed installer
- `frontend/src/pages/tools/*.tsx` — all 22 pages wired

No backend file was modified. No existing test was modified.

---

## Findings

### finding: Backend contract transcribed, not guessed
- **source set**: depmgr-frontend
- **agent name**: frontend-developer
- **finding**: Every `DepEntry`/`DepTotals` field in `depsApi.ts` was read off the backend rather than taken from the brief, so a mismatch cannot hide.
- **evidence**:
  - `backend/app/depmgr/resolver.py:56-72` — `DepStatus.as_dict()` (the exact 13 fields)
  - `backend/app/depmgr/resolver.py:204-215` — `totals()` keys
  - `backend/app/depmgr/resolver.py:187-201` — `check()` returns `tool_id`/`ready`/`missing`/`deps`
  - `backend/app/main.py:749-782` — `GET /api/deps` adds `packages` + `dependents`
  - `backend/app/depmgr/uninstaller.py:66-73` — `remove()` returns `breaks_tools`, `freed_bytes`
  - `backend/app/depmgr/uninstaller.py:89-95` — `nuke()` returns `errors`, `existed`
  - `frontend/src/lib/depsApi.ts:16-33` — the transcribed `DepEntry`

### finding: The install SSE carries no byte offsets
- **source set**: depmgr-frontend
- **agent name**: frontend-developer
- **finding**: The installer streams *stages and command output lines*, never a downloaded-so-far byte count. `_run_streaming` emits `total=total_hint` (a catalog estimate) and each stdout line as a `message`. So "live bytes" can only honestly mean bytes of dependencies the backend has confirmed `done`.
- **evidence**:
  - `backend/app/depmgr/installer.py:225-231` — the per-line emit: `type`, `dep_id`, `message`, `total`
  - `backend/app/depmgr/installer.py:299-310` — `approx_bytes`/`heavy` on the `installing` frame
  - `frontend/src/hooks/useToolDeps.ts:154-186` — `deriveDepByteProgress` counts a dep only once it reports `done`
  - `frontend/src/components/deps/DependencyGate.tsx:331-341` — indeterminate sheen for the in-flight dep instead of a fabricated percentage

### finding: Raw status hues fail contrast on the cream shell
- **source set**: depmgr-frontend
- **agent name**: frontend-developer
- **finding**: The four `oklch` status hues measure 2.0:1–3.9:1 against the cream shell (`#F7F1DE` on `#4E220F`), i.e. below the 4.5:1 body floor, even though they clear 4.9:1 on the dark tool faceplates. Pulling each hue 50% back toward `currentColor` fixes both directions.
- **evidence**:
  - measured: `ok` 2.97→6.49, `active` 2.72→6.09, `warn` 2.01→4.59, `bad` 3.86→6.81 on cream; 4.94→7.90, 5.40→8.35, 7.29→9.81, 3.81→6.89 on the dark faceplate
  - `frontend/src/index.css:120-133` — the `--dep-*-text` mixes, with the measurements in the comment
  - `frontend/src/components/deps/DependencyGate.tsx:35-44` — `STAGE_TEXT_HUE` used for every status word

### finding: `bg-current` cannot pick a readable ink, so the primary control is a tinted fill
- **source set**: depmgr-frontend
- **agent name**: frontend-developer
- **finding**: Filling the Install button with `currentColor` requires an opposite-ink label, but the gate cannot know the host's surface. A `Canvas` keyword label is white everywhere because `color-scheme: light` is global (`index.css:44`) while many tool pages are dark islands — it would have been invisible on all of them. The button is therefore a 12% wash of `currentColor` with a 2px `currentColor` border, which keeps the label on `currentColor` and so inherits the host's guaranteed contrast.
- **evidence**: `frontend/src/components/deps/DependencyGate.tsx:174-186`; `frontend/src/index.css:44` (`color-scheme: light`)

### finding: A solid `bg-current` + `text-[Canvas]` label would have been invisible on 22 dark pages
- **source set**: depmgr-frontend
- **agent name**: frontend-developer
- **finding**: Caught during self-review before it shipped; recorded because it is the trap the "inherit the host identity" rule invites.
- **evidence**: `frontend/src/index.css:44` vs `frontend/src/pages/tools/SoxPage.tsx:217` (`text-[#efe4d8]` dark faceplate)

### finding: Check errors and install errors were initially conflated
- **source set**: depmgr-frontend
- **agent name**: frontend-developer
- **finding**: My first gate branched on `status === 'error' && !state.error`. Because the hook folds both sources into one `error` field, a failed *check* fell through to the install panel and rendered "The install did not complete" for something that never started installing. Fixed to branch on `status === 'error'` alone, which the hook only ever sets for a failed check.
- **evidence**: `frontend/src/components/deps/DependencyGate.tsx:180-182`; `frontend/src/hooks/useToolDeps.ts:196-202` (status derivation); caught by `frontend/src/tests/depsUi.test.tsx` ("a failed dependency check is reported and offers a retry")

### finding: `busy || !input && !deps.ready` silently left Run enabled — operator precedence
- **source set**: depmgr-frontend
- **agent name**: frontend-developer
- **finding**: My first wiring pass appended `&& !deps.ready` to each `disabled` expression. `&&` binds tighter than `||`, so `execute.busy || !inputPath && !deps.ready` parses as `busy || (!inputPath && !ready)` — Run stayed enabled whenever an input was present but the dep was missing. Reverted all 22 pages and redid it with `||`, which is associative and always correct. The parity test now asserts the `||` form specifically.
- **evidence**:
  - `frontend/src/pages/tools/PandocPage.tsx:186` and 21 other pages — all now `|| !deps.ready`
  - `frontend/src/tests/depsUi.test.tsx` parity test regex `/disabled=\{[^}]*\|\|\s*!deps\.ready\}/`
  - **verified non-vacuous**: reintroducing the `&&` bug on PandocPage made the suite fail 101/102 with `PandocPage.tsx (hook:true gate:true disablesRun:false)`

### finding: The gate would have been dropped inside a JSX ternary
- **source set**: depmgr-frontend
- **agent name**: frontend-developer
- **finding**: ScriptRunnerPage's Run button sits in the `: ` branch of `{execute.busy ? <cancel/> : <run/>}`, so inserting above the `<button>` produced `TS2657: JSX expressions must have one parent element`. Moved above the conditional.
- **evidence**: `frontend/src/pages/tools/ScriptRunnerPage.tsx:153` (gate now precedes the ternary); error was `src/pages/tools/ScriptRunnerPage.tsx(179,15): error TS2657`

### finding: A block panel is a bad child of a flex row — placement is layout-aware
- **source set**: depmgr-frontend
- **agent name**: frontend-developer
- **finding**: Four pages put Run inside a flex row. My first heuristic excluded `flex-col` parents, which wrongly classified `flex flex-col gap-2 sm:flex-row` (GalleryDl, Streamlink) as safe — at the `sm` breakpoint the gate would have been squeezed between the URL input and its button. Second heuristic hoists out of any parent containing `flex-row` (including responsive variants) or lacking `flex-col`.
- **evidence**:
  - `frontend/src/pages/tools/GalleryDlPage.tsx:152` and `frontend/src/pages/tools/StreamlinkPage.tsx:161` — gate hoisted above the `sm:flex-row` wrapper
  - `frontend/src/pages/tools/CodecToolPage.tsx:188`, `frontend/src/pages/tools/ModelHealthCheckPage.tsx:189`, `frontend/src/pages/tools/PackagerPage.tsx`, `frontend/src/pages/tools/ExifScrubberPage.tsx`, `frontend/src/pages/tools/OcrMyPdfPage.tsx`, `frontend/src/pages/tools/PdfToolsPage.tsx` — hoisted above their wrapping rows

### finding: Two pages needed their action region restructured, not just a sibling inserted
- **source set**: depmgr-frontend
- **agent name**: frontend-developer
- **finding**: GenericToolPage and TrimmerPage run their actions from a `flex flex-wrap items-center justify-between` footer. A third flex child there would sit between the summary and the buttons. Both footers were wrapped in a `space-y-2` div with the gate above the row. GenericToolPage's restructure left two duplicated closing tags, which `tsc` caught (`TS1003`/`TS1381`/`TS1382`).
- **evidence**:
  - `frontend/src/pages/tools/GenericToolPage.tsx:40-68`
  - `frontend/src/pages/tools/TrimmerPage.tsx:782-812`

### finding: Success can never be claimed off a per-dep `done` frame
- **source set**: depmgr-frontend
- **agent name**: frontend-developer
- **finding**: The reducer deliberately refuses to set `status` from a per-dep `done`. Only a terminal `finished` frame carrying `status: "completed"` sets it, and the hook stays in `installing` until the follow-up `GET` resolves, so the gate cannot report ready on the strength of a stream.
- **evidence**:
  - `frontend/src/hooks/useToolDeps.ts:96-102` (the `done` branch sets `done` only)
  - `frontend/src/hooks/useToolDeps.ts:104-118` (the `finished` branch)
  - `frontend/src/hooks/useToolDeps.ts:222-238` (refetch on terminal frame)
  - test: "a per-dep done frame never claims the job succeeded"

### finding: The install result is the authority on failure, not the last progress line
- **source set**: depmgr-frontend
- **agent name**: frontend-developer
- **finding**: The final `installing` frame is often an unrelated subprocess stdout line. The reducer prefers `result.failures[0].error`, then `result.error`, and only falls back to the last progress message.
- **evidence**: `frontend/src/hooks/useToolDeps.ts:106-114`; test: "the terminal frame wins over a noisy last progress line when reporting failure"

### finding: Unit basis is mixed in the backend, so one formatter with honest labels
- **source set**: depmgr-frontend
- **agent name**: frontend-developer
- **finding**: Catalog estimates are decimal (`660_000_000`, described as "660 MB") while `measured_bytes` comes from a 1024-based `du`. Both go through one SI formatter, and the UI labels which is which ("about 660 MB" vs a bare figure) rather than implying they are comparable.
- **evidence**: `backend/app/depmgr/catalog.py:68`; `backend/app/depmgr/store.py:130-134`; `frontend/src/lib/depsApi.ts:284-296`; `frontend/src/lib/depsApi.ts:299-311`

### finding: Zero-dependency tools get an honest chip, not a blank
- **source set**: depmgr-frontend
- **agent name**: frontend-developer
- **finding**: Six tools map to `[]` in the backend. The gate says "No external dependencies — this tool runs on the Python already installed" rather than rendering nothing, so the check is visibly real.
- **evidence**: `backend/app/tools/deps_map.py:53-65`; `frontend/src/components/deps/DependencyGate.tsx:96-103`

### finding: Console palette chosen by measurement, not by eye
- **source set**: depmgr-frontend
- **agent name**: frontend-developer
- **finding**: Body text measures 5.5:1–15.4:1 on both grounds; `#4E6B7A` was chosen for control borders because it clears the 3:1 that WCAG 1.4.11 requires of a non-text affordance (`#2A3A44` only reached 1.58:1, acceptable for a divider but not for a control).
- **evidence**: `frontend/src/components/deps/DependencyManagerPanel.tsx:33-37` (the constants, with measured rationale); contrast figures 15.39/7.75/5.76/13.10/13.80/13.44/10.21 on `#0A0E11`

### finding: The console had inherited the cream shell's warm scrollbar
- **source set**: depmgr-frontend
- **agent name**: frontend-developer
- **finding**: Global scrollbars are cream/sage, which is wrong on a graphite ground. The console now themes its own track, thumb and `::selection`. Reduced motion also only covered `.dep-gate` spinners, not the console's.
- **evidence**: `frontend/src/index.css:178-200`; `frontend/src/index.css:216-219`; `frontend/src/index.css:87-98` (the pre-existing global scrollbar)

### finding: Detector reported 3 findings, all pre-existing and all false positives
- **source set**: depmgr-frontend
- **agent name**: frontend-developer
- **finding**: `impeccable detect` returned exactly 3 items, every one `gray-on-color` for `text-slate-950 on bg-sky-500` in TrimmerPage. **Zero** findings in any file I authored. The three are pre-existing (present at `f3fe316`, before any page wiring; my only change to those lines was re-indentation), and the actual contrast is **7.28:1**. The rule's implied remedy — white text — measures **2.77:1**, i.e. applying it would break the same task's 4.5:1 floor. I therefore did not change them and am reporting this rather than silently degrading real contrast to satisfy a hue heuristic.
- **evidence**:
  - `frontend/src/pages/tools/TrimmerPage.tsx:362`, `:627`, `:804`
  - `git show f3fe316:frontend/src/pages/tools/TrimmerPage.tsx` lines 359, 461, 624, 797 — same classes, pre-wiring
  - measured `#020617` on `#0ea5e9` = 7.28:1; `#ffffff` on `#0ea5e9` = 2.77:1

---

## Not done / limitations

1. **The detector's 3 findings were left in place on purpose** — see the finding above. If the maintainers want the heuristic satisfied regardless of measured contrast, that is their call to make explicitly.
2. **`OcrMyPdfPage` gates only its Run action.** That page has two executors: `ocr` (`ocrmypdf` → `conda.ocrmypdf`) and `read` (`pdf_tools` → `conda.poppler`). The gate covers `ocrmypdf`, which is what the Run button runs. The separate "read text layer" action can still be clicked without `conda.poppler` installed and will fail on its own terms. Gating it would need a second hook and a second gate on one page; I scoped to Run as specified rather than expand.
3. **Same for `TrimmerPage`'s probe** (`mediainfo`) — gated via `trimmer` (`conda.media`), which is the same dep `mediainfo` needs, so it is covered incidentally.
4. **`DownloaderPage` gates the standalone Run only.** Its three atomic helpers (`media.download.resolve`, `.format_select`, `.media.subtitle.fetch`) are pure HTTP parameter plumbing with `[]` deps in the backend, so nothing is missing there.
5. **No live backend run.** Verification is `tsc -b`, `npm test` (102/102), `npm run verify` (exit 0) and the detector. I did not start the server and exercise a real 663 MB ffmpeg install, so the SSE framing is verified against the backend source and unit tests, not against a live stream.
6. **`useToolDeps` adds one `GET /api/tools/{id}/deps` per page mount.** On the 22-page fleet that is 22 small requests when navigating between tools, each aborted on unmount. Acceptable, but a shared cache keyed by tool id would cut it if it shows up in profiling.
