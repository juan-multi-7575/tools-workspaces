# Verification corrections — 2026-10-13

Post-hoc first-hand re-verification of the Task 4 / Task 5 follow-up work. This file
corrects two claims that entered the repo history and the fix-work backlog.

## Correction 1 — #14 12px floor is only PARTIALLY complete

**The claim as committed.** Commit `9992fab6` ("feat(ux): design tokens, typography
floor, focus rings + a11y review reports") states:

> 12px information-text floor: 373 sub-12px sites -> 0 across 24 files

**What that number actually measures.** The verification command was:

```
grep -rohE 'text-\[(9|10|11)px\]' frontend/src --include='*.tsx'
```

`--include='*.tsx'` limits the search to TypeScript JSX files and can only see
**Tailwind utility classes**. It structurally cannot see the stylesheets where the
batch A–E redesign actually sizes the per-tool site text.

**First-hand re-verification (2026-10-13, on merged `main` @ `fec5efa5`):**

| Search | Result |
|---|---|
| `text-[9\|10\|11]px` in `.tsx` | **0** (what `9992fab6` measured) |
| `font-size: <12px` in `index.css` | **0** — why the utility grep looked clean |
| `font-size: <12px` in **site CSS** | **209 declarations across 18 files** |

Per-file leaders: `sites/downloader/downloader.css` (42), `sites/summarizer/summarizer.css`
(21), `sites/imagemagick/imagemagick.css` (21), `sites/text-translator/text-translator.css`
(16), `sites/script_runner/script-runner.css` (15).

Spot-checked example — `frontend/src/sites/text-translator/text-translator.css:15`:

```css
.txt-kicker{font-size:10px;line-height:1.25;letter-spacing:.15em;text-transform:uppercase;font-weight:700;margin:0 0 24px}
```

**Scope of the committed work.** Task 4 did genuinely complete the Tailwind-utility half
(373 utility sites -> 0) plus the brand-token hex, z-index scale, and focus-ring work.
It did **not** complete the stylesheet half of #14.

**Ironically**, the widened text is concentrated in exactly the "wide-tracked uppercase
mono labels + table headers" that Task 4 flagged as the pixel-overflow risk, so the
residual overflow risk is larger than reported.

**Tracked as:** issue #1 (labels: `bug`, `accessibility`, `design-system`, `frontend`, `P1-high`).

**The commit message is being left unamended** (option C) rather than rewriting a
published commit; this file is the standing correction.

## Correction 2 — #15 "zero hex" was never true on the merged branch

`docs/issues/UI_UX_ARCHITECTURE_ISSUES.md` lines ~66-67 read:

- `#14 line 66` "Fixed (code) ... catalog browser check passed (no sub-12px text)"
- `#15 line 67` "Fixed (code) — Zero raw hex literals outside `index.css` (grep-verified)"

Both are overclaims on merged `main`:

- `#15` strict "zero hex outside index.css" is **UNMET by design** (approved Option A).
  ~406 non-test lines / ~601 occurrences of hex remain: the intentional per-site palette
  (`sites/registry.ts`), `lib/hostSkin.ts` runtime contrast + Canvas 2D, and literal
  SVG/QR consumers. The z-index sub-criterion *is* met.
- `#14`'s cited browser evidence (`browser-a11y-audit.md`, dated 2026-10-02) **pre-dates**
  the redesign merge `b8234442`, so it never described the current UI (see Correction 3).

Plan Task 5's step "update issue status with real evidence" was not completed.

**Tracked as:** issue #5.

## Correction 3 — both a11y audits are stale

`browser-a11y-audit.md` and `browser-a11y-audit-2.md` are both dated **2026-10-02**, before
the redesign merge. Proof they no longer describe the app: audit-2 defect 2 claims "zero
matches for `prefers-reduced-motion` in `frontend/src`", but `prefers-reduced-motion` now
exists in 9 files including `index.css:230` and is asserted by
`frontend/src/tests/textTranslatorSite.test.tsx:70`. No post-redesign browser audit exists.

Additionally `browser-a11y-audit-2.md` is not referenced by any Task 4/5 report, and it
**contradicts** `review-report.md`'s open-a11y item 7 (canvas-node names at
`PipelineCanvas.tsx:204` and Settings labels at `SettingsPage.tsx:164,289,308` are in fact
fixed).

## Open gates (not regressions, genuinely unrun)

- **#14 pixel gate** — overflow/legibility of the widened text at 1440×900 / 768×1024 /
  390×844 has never been browser-verified. 375 `text-[12px]` sites and 67 wide-tracked
  uppercase mono labels across 20 files are in scope. Tracked as issue #4.
- **#15 screenshot gate** — before/after capture of the 11 tokenized hex values. Tracked as issue #4.

## Hex-count discrepancy (reconciled)

`design-tokens-report.md` reports ~601 hex occurrences; `review-report.md` reports ~406
non-test lines. **Both are correct** — different units (occurrences vs lines) — but neither
documented that. Presence of the remainder is verified; only the unit differs.
