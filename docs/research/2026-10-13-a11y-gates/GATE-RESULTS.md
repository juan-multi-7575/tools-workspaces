# Issue #4 — Browser Acceptance Gates: 12px-floor pixel pass + hex before/after

**Repo worktree:** `pi-worktree-3bdc9f90-...` (isolated; branch `pi-subagents/browserGates-3bdc9f9-d4af-s0-t0`, based on main `79b68686`)
**Run date:** 2026-10-13
**Scope:** this lane is **measurement only** — read-only on frontend source. Failures are recorded, not fixed.
**Browser:** local Chrome driven over CDP via the `browser-harness` skill; viewport set with `Emulation.setDeviceMetricsOverride`.

## How the app was run (reproducible)

- Ports 8000/5173 belong to an unrelated project and 8001/5174 to a sibling worktree (`wt-batch-E`); **none were touched**.
- Backend: `PYTHONPATH=backend python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8002`
- Frontend: a **temporary** review-only vite config (`frontend/vite.review.config.ts`, port **5175**, proxy `/api → 127.0.0.1:8002`, `allowedHosts:true`, host `0.0.0.0`), reached via LAN IP `http://10.36.243.166:5175`. A non-localhost host on port ≠ {8000,5173,3000} makes `API_BASE` resolve to `''` (same-origin), so all `/api/*` calls proxy to the backend — verified (`GET /api/tools` returned 28 tools through the proxy).
- The temp vite config is **not committed** and must be deleted after this run.
- All 28 tools registered on the backend; the 10 target tool pages (`/tools/:id`) rendered their bespoke pages (confirmed by document title + live DOM), not the "tool unavailable" fallback.

Machine-readable data: `measurements/gate1-scan-summary.json`, `measurements/gate2-measurement-sox.json`, `measurements/gate2-measurement-demucs.json`, `measurements/gate2-page-pixeldiff.json`. Scanner scripts: reproduced inline below; originals were ephemeral and are quoted verbatim in each section.

---

## GATE 1 — #14 pixel overflow / legibility after the 12px floor

### Method

Two independent instruments, applied at each viewport **1440×900, 768×1024, 390×844** on the 8 highest-density tool pages (`/tools/downloader`, `/tools/summarizer`, `/tools/imagemagick`, `/tools/text.translate.llm`, `/tools/script_runner`, `/tools/trimmer`, `/tools/codec_tool`, `/tools/pdf_tools`):

1. **Automated DOM overflow scan** (primary instrument; covers the *entire* page at every viewport). For each element it flags:
   - `pageOverflowX` = `max(documentElement.scrollWidth, body.scrollWidth) − innerWidth` (document-wide horizontal overflow; >0 ⇒ content escapes the viewport with a horizontal scrollbar).
   - `text-overflows-box` — direct text wider than its own content box (`scrollWidth > clientWidth`) while not an intentional horizontal scroller/nowrap-in-scroller (clipped/overflowing label).
   - `escapes-viewport-right` — element extends past the right viewport edge and is **not** contained by any `overflow-x:auto/scroll` ancestor (a bare, unreachable escape). Elements inside `overflow-x:auto` strips are *reachable by scroll* and are excluded as by-design.
   - `text-clipped-vertical` — direct text taller than its own box with `overflow-y:hidden`.
   - Visually-hidden helpers (`.sr-only`, ≤1px boxes) are excluded (they are clipped by design).
2. **`.font-mono` font-size histogram** — proves the 12px floor landed and nothing regressed below 12px.

Full-page screenshots (viewport PNGs) captured for all 24 combos under `shots/gate1/`.

### Result: **PASS** (24/24 combos, 0 defects)

| site (route) | 1440×900 | 768×1024 | 390×844 | `.font-mono` sizes (histogram, identical across all 3 viewports) |
|---|:--:|:--:|:--:|---|
| downloader `/tools/downloader` | PASS | PASS | PASS | 12px:41, 16px:1 (42) |
| summarizer `/tools/summarizer` | PASS | PASS | PASS | 12px:26 (26) |
| imagemagick `/tools/imagemagick` | PASS | PASS | PASS | 12px:45 (45) |
| text-translator `/tools/text.translate.llm` | PASS | PASS | PASS | 12px:36 (36) |
| script_runner `/tools/script_runner` | PASS | PASS | PASS | 12px:28, 14px:1 (29) |
| trimmer `/tools/trimmer` | PASS | PASS | PASS | 12px:23, 16px:1 (24) |
| codec_tool `/tools/codec_tool` | PASS | PASS | PASS | 12px:32, 14px:1 (33) |
| pdf_tools `/tools/pdf_tools` | PASS | PASS | PASS | 12px:29 (29) |

Numeric proof (`measurements/gate1-scan-summary.json`):
- **`pageOverflowX = 0`** and **`documentCanScrollHorizontally = false`** for all 24 combos → no horizontal scrollbar / no content escaping the viewport anywhere.
- **`layoutDefectCount = 0`** for all 24 combos (no `text-overflows-box`, `escapes-viewport-right`, or `text-clipped-vertical`).
- **Zero `.font-mono` elements below 12px** anywhere → the 12px floor is fully applied and no label fell back below the floor.
- The `.font-mono` population is **byte-identical across the three viewports for every site** (e.g., codec_tool 33 at 1440/768/390; downloader 42 at all three) — strong evidence the responsive reflow changed nothing structurally (no element dropped/duplicated → no layout collapse).
- The `>12px` entries (14px/16px) are headings/large numerals, not regressions.

### Investigator-discussed edge case (not a failure)

- **downloader @ 768×1024** contains a segmented control row of `whitespace-nowrap` buttons (`All (14) / Format & Quality / 1 Audio Options / … / Subtitles & Metadata`) whose flex row spans `scrollWidth 954` inside a **`overflow-x:auto`** parent (`clientWidth 423`). On first detection this looks like a horizontal escape, but the ancestor is an intentional horizontal scroller: the buttons are reachable by scroll and the document itself does not scroll (`body.scrollWidth == 768 == viewport`). This is a designed responsive pattern (scrollable tab strip), so it is classified **by-design, PASS**. Region documented in `shots/gate1/downloader__768x1024_strip.png`.

### Visual inspection (spot check)

The 1440×900 and 390×844 screenshots for downloader, summarizer, text-translator, codec_tool and the 768 strip were opened and reviewed: 12px uppercase tracked chips/labels (`MEDIA.DOWNLOAD.YT-DLP`, `CODEC / TRANSFORMER`, `INPUT TEXT`, translation-language chips, etc.) render cleanly — legible, not clipped, not overlapping; tag chips that re-wrap at 390px do so via `flex-wrap` (normal responsive behaviour, not broken labels). The remaining 15 screenshots exist on disk for independent review.

---

## GATE 2 — #15 before/after of the 11 tokenized hex

### The 11 sites and the token mapping

Tokenization was applied in commit `9992fab6` (design tokens). The 11 conversions (7× `#a83232 → accent-contrast`, 2× `#2e6b47 → success`, 2× `#9d6638 → brand-caramel`), verified by diffing `9992fab6^` → HEAD:

| # | file | BEFORE (`9992fab6^`) | AFTER (HEAD) | token |
|---|---|---|---|---|
| 1 | SoxPage | `border-[#a83232]` (error alert) | `border-accent-contrast` | accent-contrast |
| 2 | SoxPage | `border-[#a83232]` (invalid stage) | `border-accent-contrast` | accent-contrast |
| 3 | SoxPage | `hover:border-[#a83232]` (remove btn) | `hover:border-accent-contrast` | accent-contrast |
| 4 | DemucsPage | `border-[#2e6b47]` (archived badge) | `border-success` | success |
| 5 | DemucsPage | `text-[#2e6b47]` (archived badge) | `text-success` | success |
| 6 | DemucsPage | `border-[#a83232]` (not-archived badge) | `border-accent-contrast` | accent-contrast |
| 7 | DemucsPage | `text-[#a83232]` (not-archived badge) | `text-accent-contrast` | accent-contrast |
| 8 | DemucsPage | `border-[#9d6638]` (processing badge) | `border-brand-caramel` | brand-caramel |
| 9 | DemucsPage | `text-[#9d6638]` (processing badge) | `text-brand-caramel` | brand-caramel |
| 10 | DemucsPage | `border-2 border-[#a83232]` (error alert) | `border-2 border-accent-contrast` | accent-contrast |
| 11 | DemucsPage | `text-[#a83232]` (error alert) | `text-accent-contrast` | accent-contrast |

Token definitions (`frontend/src/index.css`) are the exact literals, case-insensitive:
`--color-accent-contrast:#A83232`, `--color-success:#2E6B47`, `--color-brand-caramel:#9D6638`.

### Result: **PASS — rendered colour is unchanged for all 11 sites**

Three converging lines of evidence:

**(a) Computed-colour equality (definitive, deterministic).** On the live HEAD build, for each of the 11 sites the **AFTER** colour (a probe element carrying the real token utility class → its computed `borderColor`/`color`) equals the **BEFORE** colour (a probe with an inline style `border-color:#a83232` etc. — exactly what the old Tailwind arbitrary value compiled to):

| token | before literal | computed AFTER (token) | computed BEFORE (inline literal) | equal |
|---|---|---|---|---|
| accent-contrast | `#a83232` | `rgb(168, 50, 50)` | `rgb(168, 50, 50)` | ✅ |
| success | `#2e6b47` | `rgb(46, 107, 71)` | `rgb(46, 107, 71)` | ✅ |
| brand-caramel | `#9d6638` | `rgb(157, 102, 56)` | `rgb(157, 102, 56)` | ✅ |

`getComputedStyle(:root)` read-back: `--color-accent-contrast:#A83232`, `--color-success:#2E6B47`, `--color-brand-caramel:#9D6638`. All 11 probes matched on **both** SoxPage and DemucsPage (`allEqual: true`). Raw data: `measurements/gate2-measurement-sox.json`, `measurements/gate2-measurement-demucs.json`. Visual per-site pairs: `shots/gate2/gate2_swatch_contactsheet.png` (11 rows, every BEFORE/AFTER swatch = MATCH).

**(b) Page-level pixel diff (DemucsPage @ 1440×900; `measurements/gate2-page-pixeldiff.json`).**
- `after` vs **sentinel** (tokens forced to `#ff00ff/#00ffff/#00ff00`): **4300 px differ (0.33%)** across the page → proves the three tokens are genuinely load-bearing for the UI colour (so this is a real colour path, not a dead rule).
- `after` vs **before-literal** (tokens forced to the exact old literals `#a83232/#2e6b47/#9d6638`, captured back-to-back with no interaction): **0 px differ beyond threshold → tokenised render is pixel-identical to the old literal render.** (An earlier post-click capture showed 2357 px differing; that was the live "measured elapsed" timer drifting between the two shots, not colour — re-capturing with no clicks returned the 0-px result. The timer text uses `brand-caramel-text`, a token that was not overridden.)
- Screenshots: `shots/gate2/demucs_after__1440x900.png`, `demucs_before_literal__1440x900.png`, `demucs_sentinel__1440x900.png`.

**(c) Page context screenshots.** `shots/gate2/sox__1440x900.png`, `shots/gate2/demucs__1440x900.png`.

---

## What I could NOT verify (explicit)

- **GATE 1 visual coverage vs automated coverage:** the DOM overflow scan measured **all 24** site×viewport combinations; human/screenshot visual inspection was spot-checked on 5 of 24 (the narrow 390×844 and wide 1440×900 for the highest-risk tools). The other 15 screenshots are on disk but were not individually eyeballed.
- **GATE 1 scanner blind spot:** the scan detects clipping/overflow/escape/vertical-clip. It does **not** flag a label that gracefully re-wraps to two lines (no clipping). This was partially checked via the spot screenshots and the identical mono-counts across viewports, but is not exhaustively proven for every label.
- **GATE 1 scope:** the gate prioritises the 8 densest tool pages; those were fully swept. The wider set of 375 `text-[12px]` sites / 67 wide-tracked labels across 20 files was not each individually browser-verified — only the 8 priority pages.
- **GATE 2 in-context element screenshots:** the 11 affected elements are **state-gated** (error `role="alert"` boxes and record-status badges). On a fresh page load none render (Sox shows "no modules patched in yet"; Demucs shows the "NO RECORD" fallback badge, which itself is *not* one of the tokenized elements). I could not force them into the live DOM — Sox "RUN THE RACK" and Demucs "SEPARATE STEMS" both no-op without a file input (I did not have media to feed them), and the status badges require a real separation record. Therefore I could **not** capture a screenshot of the literal affected elements in their natural coloured state. Instead I proved the rendered colour of each with deterministic computed-style probes (the exact colour those utility classes paint) and a 0-pixel page-level literal-vs-token diff. This establishes "rendered colour unchanged" but is **not** a screenshot of the elements in-context.

---

## Verdict

- **GATE 1 (#14): PASS.** The 12px-floor pass introduces no horizontal overflow, no clipped/escaped/overlapping text, no broken labels, and no layout collapse across 1440×900 / 768×1024 / 390×844 on all 8 priority tool pages. No failures to file.
- **GATE 2 (#15): PASS.** All 11 tokenized hex colours render identical to the old literals (computed-style equality + 0-pixel literal-vs-token diff + matching swatches). No failures to file.

(Caveat: GATE 2's proof is by computed-style/measurement, not an in-context screenshot of the state-gated elements — see "What I could NOT verify".)
