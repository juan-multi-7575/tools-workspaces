# Design tokens, typography & accessibility — Task 4 report

> **Plan:** `docs/superpowers/plans/2026-10-07-main-plan-completion.md` (Task 4)
> **Parent plan:** `docs/issues/fix-work/PLAN.md` (Task 4) against
> `docs/issues/UI_UX_ARCHITECTURE_ISSUES.md` (#6, #14, #15)
> **Scope decision:** approved by supervisor — hex tokenization **Option A** (exact brand-token
> matches only) + 12px floor + minimal metadata. Worked in the main shared checkout; no commit, no push.

## Summary

The batch A–E redesign merge (`b8234442`) reintroduced sub-12px text and raw hex, so Task 4 re-landed
the token/typography/a11y pass on top of the redesign. Key finding: the redesign turned #15's
"dead brand-token hex" into an **intentional per-site palette system** — see the hex section. That
makes #15's literal "zero hex outside `index.css`" criterion unsatisfiable without breaking the
palette; it is reported as **UNMET** with the reason. Everything else is done and verified.

| # | Item | Status |
|---|---|---|
| 1 | Floor information text at 12px (#14) | ✅ done in code (373 → 0); overflow/legibility **UNVERIFIABLE** (no browser) |
| 2 | Metadata on info elements | ✅ minimal — `data-*` on 2 color-coded status elements |
| 3 | Consolidate hex → theme tokens (#15) | ⚠️ 11 exact brand-matches tokenized; strict "zero hex" **UNMET** (documented) |
| 4 | Define z-index scale | ✅ done — documented custom properties + utilities; last ad-hoc `z-10` retired |
| 5 | #6 focus defaults | ✅ done — global `:focus-visible` on `--color-focus-ring`, backs all `focus:outline-none` |
| 6 | #14 typography consistent across breakpoints | ✅ done — zero responsive text-size variants exist (already consistent) |

## Commands run (frontend/)

| Command | Result |
|---|---|
| `npm run verify` | **exit 0** — 305 tests pass / 0 fail; `tsc -b` clean; oxlint 0 errors (pre-existing warnings only: hook-deps, Fast Refresh, one `no-extra-boolean-cast`) |
| `npm run build` | **success** — only the pre-existing >500 kB chunk-size warning (excluded by the plan) |

Baseline note: `verify` was green before and after; the floor/hex/metadata edits introduced no test,
type, or lint regressions (no test asserts the changed class strings — checked).

---

## 1 — 12px floor (#14)

Raised every information-bearing sub-12px font size to 12px: `text-[9px]`, `text-[10px]`, `text-[11px]`
→ `text-[12px]`. Count before: **373** (198×`10px`, 173×`11px`, 2×`9px`). Count after: **0**. The only
source-level decorative exception in the app is the React Flow attribution watermark, which is styled
by the React Flow library's own stylesheet (not a value in `frontend/src`), so it is outside this count
and left untouched. The 2×`text-[9px]` sites were uppercased table column headers in
`ModelHealthCheckPage.tsx` (information-bearing), so they were raised too.

The `text-[12px]` occurrences per file (spot-check targets; totals = floored + any pre-existing 12px):

`components/deps/DependencyManagerPanel.tsx` (22), `components/deps/DependencyGate.tsx` (8),
`components/tools/DownloaderForm.tsx` (1), `pages/tools/DownloaderPage.tsx` (58),
`SoxPage.tsx` (23), `LlmTranslatorPage.tsx` (23), `ModelHealthCheckPage.tsx` (21), `PackagerPage.tsx` (20),
`GalleryDlPage.tsx` (17), `MediainfoPage.tsx` (16), `DemucsPage.tsx` (16), `SrtTranslatorPage.tsx` (15),
`TranscriberPage.tsx` (14), `ScriptRunnerPage.tsx` (14), `SummarizerPage.tsx` (13), `PdfToolsPage.tsx` (12),
`ImageMagickPage.tsx` (12), `CodecToolPage.tsx` (12), `TrimmerPage.tsx` (11), `OcrMyPdfPage.tsx` (11),
`StreamlinkPage.tsx` (10), `ExifScrubberPage.tsx` (10), `AudioProcessorPage.tsx` (9), `PandocPage.tsx` (7).

**Most of these are wide-tracked uppercase mono labels** (e.g. `font-mono text-[12px] uppercase
tracking-[0.22em]`) inside dense rack panels. Raising 10/11px → 12px widens them ~10–20%.

**Unverifiable (browser check):** #14 requires BOTH "no info text below 12px" AND "no layout overflow
introduced" + a 1440×900 legibility spot-check. The pixel-side criteria could **not** be verified here
(no browser/DOM render). Run a human browser pass at 1440×900, 768×1024, 390×844 focused on the wide
uppercase labels and the 3-pane studio.

## 2 — Metadata on info elements (minimal)

Restricted, per decision, to the color-coded status/info elements among the floored ones — the only
floored elements that genuinely lack machine-readable state (plain captions already expose their text as
their accessible name, so redundant `aria-label`s were deliberately **not** added):

- `pages/tools/SoxPage.tsx:342` — stage card now carries `data-valid={valid ? 'true' : 'false'}` (its
  only valid/invalid cue was the border color).
- `pages/tools/DemucsPage.tsx:105` — run-condition "stamp" now carries `data-run-status={phase}`
  (its state was conveyed by ring color + a short label).

## 3 — Hex consolidation (#15) — Option A

**Converted: 11 occurrences** across 2 files — only values that are *provably exact matches* to existing
`--color-*` brand tokens, so the visual result is verifiably identical:

| Raw hex | → utility | Occurrences |
|---|---|---|
| `#a83232` (= `--color-accent-contrast`) | `accent-contrast` (`border-`/`text-`/`hover:border-`) | 7 |
| `#2e6b47` (= `--color-success`) | `success` (`border-`/`text-`) | 2 |
| `#9d6638` (= `--color-brand-caramel`) | `brand-caramel` (`border-`/`text-`) | 2 |

Locations: `pages/tools/SoxPage.tsx` lines 280, 344, 384; `pages/tools/DemucsPage.tsx` lines 91, 93, 95,
156, 157. Tailwind v4 already generates these utilities from `@theme` (`PackagerPage.tsx` already used
`text-brand-caramel-text`/`text-accent-contrast`), and the QR consumer already reads the tokens via
CSS vars, so this path is confirmed live.

**Remaining: ~601 occurrences (600 six-digit + 1 three-digit) outside `index.css`, by design.** #15's
literal acceptance criterion — *"Zero raw hex literals remain in `frontend/src/**` outside `index.css`"*
— is **UNMET**. Reason (recorded for the reviewer): the remaining hex is **not** the dead code #15 was
written against; the redesign made it the intentional palette system + JS/canvas plumbing. One
representative of each remaining category:

- **Per-site registry accents** — `sites/registry.ts`, e.g. `'media.download.yt-dlp': { accent: '#0A7C7C' }`,
  `sox: { accent: '#E8A33D' }`. These are the source of each tool's `--tool-accent` at runtime; remapping
  onto brand would collapse 22 distinct site accents into one.
- **Runtime contrast + canvas plumbing** — `lib/hostSkin.ts`, e.g. `FALLBACK_INK('#4E220F')`,
  `DARK_ON_ACCENT('#140E08')`, and `ctx.fillStyle = '#000'` (L92). These are measured for contrast and
  drawn into a Canvas 2D context; CSS custom properties do not resolve in JS contrast math or
  `CanvasRenderingContext2D.fillStyle`, so they must stay literal.
- **Per-page dark palettes** — e.g. `pages/tools/SoxPage.tsx` `#171210` / `#241d1a` / `#e0a96d`. These are
  the tool pages' own cohesive dark palettes, distinct from the cream shell; remapping onto brand
  (`--color-brand-cream/caramel`) would visibly break every tool page — the opposite of the plan's
  "preserve visual colors" constraint.
- **Literal SVG/QR consumers** — e.g. `pages/tools/RemoteControlPage.tsx` already drives
  `qrcode.react` with tokens (`<QRCodeSVG fgColor="var(--color-brand-espresso)" bgColor="var(--color-brand-cream)" />`),
  which is exactly why the tokens must remain defined; the 6 SVG site workspaces use `currentColor`/
  classes rather than literal `fill="#…"`. No SVG/QR consumer was broken by this pass.

Converting *all* remaining hex (the "411-token refactor") was explicitly **not** done per the approved
Option A scope.

## 4 — Z-index scale

Documented in `frontend/src/index.css` as custom properties + matching utilities:

```
--z-panel: 10; --z-sticky: 20; --z-overlay: 30; --z-drawer: 40; --z-modal: 50;
@utility z-panel / z-sticky / z-overlay / z-drawer / z-modal
```

Already consumed at 24 sites (`z-modal` ×14, `z-drawer` ×6, `z-panel`/`z-overlay`/`z-sticky` used). The
single remaining ad-hoc value, `z-10` in `pages/tools/AudioProcessorPage.tsx:197` (floating control
rail), was replaced with `z-panel`. Since `--z-panel` is `10`, this is an exact, zero-visual-change
mapping. **No ad-hoc `z-[n]`/`z-0/20/30/40/50` utilities remain in `frontend/src`.**

## 5 — #6 focus defaults

`frontend/src/index.css` already defines the global rule backing every control, including the 51
`focus:outline-none` sites:

```css
:root { --color-focus-ring: var(--color-brand-caramel); }
:focus-visible { outline: 2px solid var(--color-focus-ring) !important; outline-offset: 3px; }
```

`!important` guarantees the ring survives `focus:outline-none`, and `:focus-visible` (not `:focus`)
keeps it keyboard-only. Prior CDP audit (`docs/issues/fix-work/browser-a11y-audit.md`) verified 18/18
sampled Tab stops render the visible caramel ring. No change was needed; this section documents it as
done. (Open, out-of-Task-4-file-scope follow-ups from that audit — modal focus trap, canvas-node
accessible names, unlabeled Settings inputs — were not actioned here.)

## 6 — #14 typography consistent across breakpoints

A responsive text-size grep (`sm:/md:/lg:/xl:/2xl:text-*`) returns **zero** matches across
`frontend/src`, so font sizing does not vary across breakpoints anywhere in the app — the
"consistent across breakpoints" criterion is already satisfied by construction. The actionable part of
#14 was the 12px floor (section 1). `frontend/index.html` already carries
`<meta name="description">` and `<meta name="theme-color" content="#F7F1DE">`.

---

## Browser-check limitations (could not verify)

1. **12px-floor overflow / legibility** — no browser render available; pixel overflow and 1440×900
   legibility of the widened wide-tracking labels are **UNVERIFIABLE**. Spot-check targets per §1.
2. **Before/after screenshot comparison** (#15 "no visual change") — a pixel screenshot was not
   captured here. The 11 converted hex are exact token-value matches by construction, and the z-index
   swap is 10→10, so the *intended* change set is provably color/layer-neutral; a human screenshot pass
   is still the acceptance gate for #15.
3. **Multi-viewport QA** — no 768×1024 / 390×844 passes run.

## Unmet acceptance criteria

- **#15 "zero raw hex outside `index.css`"** — UNMET by design under approved Option A; ~601 hex remain
  as the per-site palette system + JS/canvas/SVG/QR consumers (see §3). Not fixable without violating
  "preserve visual colors" and "no breaking SVG/QR consumers".
- **#14 pixel criteria (no-overflow, 1440×900 legibility)** — applied in code but **UNVERIFIABLE**
  without a browser (see Browser-check limitations).

## Deviations / decisions

- Hex tokenization limited to exact brand-token matches (supervisor-approved Option A). Per-page
  palette tokenization was scoped out.
- Metadata kept minimal (2 `data-*` attributes) on color-coded status only; no blanket `aria-label`s on
  text-bearing captions (would be redundant).
- z-index `z-10`→`z-panel` chosen because `--z-panel === 10` (exact match).
