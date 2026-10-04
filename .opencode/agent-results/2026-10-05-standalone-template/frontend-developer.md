# Frontend Developer — findings

- source set: 2026-10-05-standalone-template
- agent name: frontend-developer
- date: 2026-10-05
- scope: build the home index and the first standalone tool site (ImageMagick),
  per `docs/research/design-briefs.md` #10 and D1–D12

---

## Delivered

| File | Note |
|---|---|
| `frontend/src/sites/App.tsx` | Route table. Home index + per-tool site bundles, each `lazy()`; falls through to the shell. |
| `frontend/src/sites/AppShell.tsx` | The old `src/App.tsx`, moved unchanged apart from its import depth and its catch-all. |
| `frontend/src/sites/registry.ts` | Per-tool site availability + accent. `path` only where a site exists. |
| `frontend/src/sites/home/HomeSite.tsx` | The index. Reads `api.listTools()`. |
| `frontend/src/sites/home/home.css` | Scoped under `.hs-root`. |
| `frontend/src/sites/imagemagick/ImageMagickSite.tsx` | Two-state entry, manifest loader, honest error state. |
| `frontend/src/sites/imagemagick/ImageMagickHero.tsx` | Intro state. |
| `frontend/src/sites/imagemagick/ImageMagickWorkspace.tsx` | Working state. |
| `frontend/src/sites/imagemagick/imagemagick.css` | Scoped under `.im-root`. |
| `frontend/src/sites/imagemagick/imagemagickManifest.ts` | Manifest hook, real resize presets, geometry key. |
| `frontend/src/tests/imagemagickSite.test.tsx` | 11 tests. |
| `frontend/scripts/test-loader.mjs` | Resolves `.css` imports to an empty module under `node:test`. |
| `frontend/index.html` | One preconnected Google Fonts link (Inter + JetBrains Mono, both SIL OFL). |
| `docs/research/template-review/` | 9 screenshots, `measurements.json`, `README.md`. |

Commits: `3dfbdc3`, `b83465c`, `96743b5`, `2f26c7b`.

---

## Findings

- **finding**: `/` had to stop redirecting to `/tools`. The brief requires `/` to
  be the home site and tool sites to be reachable with no shell around them, so
  the standalone routes are matched in a top-level `<Routes>` and `path="*"`
  falls through to the shell. The shell's own catch-all now goes to `/tools`
  rather than `/`, so an unrecognised URL never bounces through the index.
- **evidence**: `frontend/src/sites/App.tsx:66-84`;
  `frontend/src/sites/AppShell.tsx:170-183`

- **finding**: `frontend/src/App.tsx` is now a two-line re-export of the new
  router. `src/pages/`, `ToolsPage` and `/tools/*` are untouched and verified
  working in the browser at `/tools`, `/tools/imagemagick` and `/dependencies`.
- **evidence**: `frontend/src/App.tsx:2`; review `README.md` §"What the review approved"

- **finding**: the build confirms D7's isolation without any hand-maintained
  boundary: each site ships its own lazy JS chunk *and* its own CSS bundle,
  entirely separate from the 144 kB app stylesheet.
- **evidence**: `dist/assets/ImageMagickSite-*.css` 16.46 kB,
  `dist/assets/HomeSite-*.css` 4.51 kB, `dist/assets/index-*.css` 144.05 kB

- **finding**: the dependency gate is a flex sibling of the scrolling stage
  inside a `100dvh` column — not `sticky`, not `position: fixed`. This is what
  makes "Install is always on screen" structural rather than lucky: no page
  height can push it below the fold, which is how the previous build put Install
  580px down a tall aside rail.
- **evidence**: `frontend/src/sites/imagemagick/imagemagick.css` — `.im-root`
  (flex column, `100dvh`, `overflow: hidden`), `.im-stage` (`flex: 1 1 auto;
  min-height: 0`), `.im-dock` (`flex: 0 0 auto`), `data-tool-gate-region` in
  `ImageMagickWorkspace.tsx`. Measured: install bottom **873 ≤ 900** and
  **817 ≤ 844**.

- **finding**: the gate borrows `currentColor` and four `--dep-*` hues from
  `index.css`, where those hues were tuned for dark tool faceplates and reach
  only ~2.0:1 on a light ground. `.im-root .dep-gate` re-declares all eight as
  50/50 mixes toward `currentColor`, which measures ≥4.5:1 against either tone.
  Its surfaces, borders and radii are re-pointed too, so no cream or caramel
  token survives. Same treatment for the reused `ToolResultPanel`.
- **evidence**: `frontend/src/sites/imagemagick/imagemagick.css` — the
  `Dependency gate, in this site's palette` and `the shared result panel` blocks

- **finding**: all four manifest keys have exactly one labelled, bound control
  with `data-param-key` preserved. A test derives the key list from the
  manifest object rather than a hardcoded array, so a fifth key fails the suite
  instead of being dropped quietly.
- **evidence**: `frontend/src/tests/imagemagickSite.test.tsx` — "the workspace
  surfaces every manifest parameter, so a new key cannot be dropped silently"

- **finding**: **a factual error in my own copy, caught by running the tool.**
  The geometry key originally said `800x600` "may change the aspect ratio". A
  real run disproved it: a 640×400 source sent through `-resize 240x160` came
  back **240×150**. A geometry with no operator is a *bound* the aspect ratio is
  fitted inside; only an explicit `!` overrides that, and this tool exposes no
  flag that adds one. The key was corrected and the measured example is now
  stated in the UI.
- **evidence**: `frontend/src/sites/imagemagick/imagemagickManifest.ts` —
  `GEOMETRY_KEY`; `magick identify` → `JPEG 240x150 8-bit sRGB 1414B`

- **finding**: `index.css` styles `::-webkit-scrollbar` **globally** with the
  cream shell's `--brand-sage`, so an olive thumb rendered on this site's grey
  board. Both sites restate the pseudo-element. The home index additionally had
  to become its own scroll container (`height: 100dvh; overflow-y: auto`),
  because a document-level scrollbar belongs to no site and can only be styled by
  the shell.
- **evidence**: `frontend/src/index.css:93-104`;
  `frontend/src/sites/imagemagick/imagemagick.css` — the `::-webkit-scrollbar`
  block; `frontend/src/sites/home/home.css` — same

- **finding**: a long mono string inside a fixed-width element produced real
  horizontal overflow, because `width: 100%` resolves against the containing
  block, not the flex basis. Fixing it needed three changes together: `flex: 1 1
  0` on the item, `min-width: 0` on it, and `overflow-wrap: anywhere` on the
  string itself. Any one alone leaves the overflow.
- **evidence**: workspace dock `.im-dock__geo` + `.im-geo-input`;
  review `README.md` — finding 6

- **finding**: the decorative panel stack reported `scrollWidth` 728 against
  `clientWidth` 720. Each rotated corner swings past its own box — about 5px at
  2.6deg on the wide card, 24px at 2.4deg on the tall one. Fixed by giving each
  inset the headroom its own rotation needs, *not* by clipping, which would have
  hidden the measurement rather than the cause.
- **evidence**: `frontend/src/sites/imagemagick/imagemagick.css` — the comment on
  `.im-panel--back`

- **finding**: `node:test` cannot execute CSS, and a site component importing its
  own scoped stylesheet is the point of D7. The loader now returns an empty
  module for `.css`. Without it the new test file cannot even be collected, so
  the change was forced rather than chosen.
- **evidence**: `frontend/scripts/test-loader.mjs` — the `format: 'module'` branch

- **finding**: the backend redacts absolute paths out of tool error messages, so
  a missing input renders as `input file not found: [path]`. Confirmed by
  calling `POST /api/tools/imagemagick/execute` directly with `curl`. The page
  passes the text through verbatim; the redaction is the backend's and
  `backend/` was not touched.
- **evidence**: `backend/app/tools/image_tools.py:47`; review README §"End-to-end run"

---

## Verification

- `npm run verify` → **118 pass, 0 fail** (107 pre-existing, 11 new). `tsc -b`
  clean. `oxlint` warnings only, all pre-existing, none in `src/sites/`.
- `npm run build` → clean. No new chunk over the 500 kB advisory beyond the
  pre-existing 1,169 kB `index` bundle.
- Chrome 154, dedicated CDP instance, both viewports, all three surfaces:
  horizontal-overflow count **0** in all six cases; document overflow **0 px**;
  no `Tools Garage` / `Workspaces` / `Remote` / `ENGINE STATUS` / `Platform`
  string anywhere; exactly **1** gate on the workspace at each width.
- Real end-to-end run: 640×400 PNG uploaded through the hero's own file input →
  real 240×150 JPEG (1414 B) and 240×150 WebP (846 B) written to
  `downloads/imagemagick/`, both re-served over `/api/artifacts/content` as
  `image/jpeg` and `image/webp` and confirmed by `magick identify`. Bad path
  surfaces the backend's message verbatim.
- Zero console errors across all three standalone surfaces.

Full record, including the nine problems the screenshot review caught:
`docs/research/template-review/README.md`.

---

## Not done, stated plainly

- **The remaining 20 tools are not built.** This was D12's scope: one tool as a
  template. The registry carries all 21 briefs' accents and marks 20 as
  `planned`, so the index is honest about it, but 20 rows read "Site not built".
- **`src/pages/tools/*.tsx` and the 21 old in-shell pages are untouched.** D9
  says delete them; the task said do not delete them yet. They remain reachable
  at `/tools/:toolId` and still carry the old palette. Worth revisiting so the
  two shapes cannot be confused.
- **No accessibility audit beyond what the tests assert.** No axe run, no
  screen-reader pass, no keyboard-only walkthrough. `aria-pressed` on the format
  and geometry chips, `role="group"` + `aria-labelledby` on the format control,
  and a real `<label>` on the geometry field are in place; focus rings are scoped
  per site. But "WCAG 2.1 AA compliant" is not something I can claim — I have
  not tested it.
- **No Core Web Vitals measurement.** No Lighthouse run, no LCP/CLS/INP figures.
  The lazy chunks and scoped CSS are the right shape, but that is an inference
  from the build output, not a measurement.
- **`image-to-pdf-standalone/src/components/HeroPage.tsx` was named as the
  structural model and I could not read it** — the directory does not exist in
  this repo (`.superpowers/sdd/2026-10-03-image-to-pdf` is referenced in a
  deleted doc and the source is absent). I built the two-state hero/workspace
  shape from D2/D3 and the brief instead. If that file exists somewhere, the
  hero may need to be reconciled with it.
- **Mobile is usable, not generous.** At 390×844 the dock is 501px and the canvas
  291px. The dock is dominated by the gate, whose content (heading, rationale,
  dep name, purpose, "still not found on disk", size, Install) is real
  information I chose not to truncate. Making the phone canvas comfortable would
  mean either hiding gate content or moving the gate into a sheet — a design
  decision for whoever reviews this, not one I made silently.
- **Cross-browser is unverified.** Chrome 154 only. The CSS uses `color-mix()`,
  `dvh`, `backdrop-filter` and `overflow-wrap: anywhere`; all are widely
  supported, but I did not open Firefox or Safari and cannot claim it works
  there.
- **The four `media.*` helper tools and the three legacy aliases are listed but
  never routed.** They are marked honestly (`Legacy id`, `Hosted in its parent`)
  rather than linked, which is correct today, but if the aliases are ever meant
  to redirect, `registry.ts` is not currently doing that.