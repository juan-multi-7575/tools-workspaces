# Template review — home index + ImageMagick site

Date: 2026-10-05. Chrome 154.0.8037.97 on a dedicated CDP instance
(`--user-data-dir=/tmp/opencode/chrome-audit`, port 9222), driven with
`browser-harness`. Backend on `:8000`, Vite dev server on `:5173`, both live.

This is the D12 template review: the surfaces the other 20 tools will be built
from. Anything wrong here would have been copied 20 times, so the notes below
are as much about what the review caught as about what it approved.

## What was reviewed

| Surface | Route | Screenshots |
|---|---|---|
| Home index | `/` | `home-1440x900.png`, `home-390x844.png` |
| Image Converter intro | `/t/imagemagick` | `hero-1440x900.png`, `hero-390x844.png` |
| Image Converter workspace | `/t/imagemagick/workspace` | `workspace-1440x900.png`, `workspace-390x844.png`, `workspace-390x844-rail-open.png` |
| Real conversion | workspace, after an upload | `e2e-1-source-loaded.png`, `e2e-2-converted.png` |
| Backend failure | workspace, bad path | `e2e-3-backend-error.png` |

## Measurements

`[...document.querySelectorAll('main *')].filter(e => e.scrollWidth > e.clientWidth + 6 && getComputedStyle(e).overflowX === 'visible').length`

| Surface | Size | Count | Document overflow | Garage chrome strings | Gates on page |
|---|---|---|---|---|---|
| home | 1440×900 | **0** | 0 px | none | 0 |
| hero | 1440×900 | **0** | 0 px | none | 0 |
| workspace | 1440×900 | **0** | 0 px | none | **1** |
| home | 390×844 | **0** | 0 px | none | 0 |
| hero | 390×844 | **0** | 0 px | none | 0 |
| workspace | 390×844 | **0** | 0 px | none | **1** |

Garbage chrome probe: `['Tools Garage','Workspaces','Remote','ENGINE STATUS','Platform']`
matched nowhere in `document.body.innerText` on any of the six surfaces.

`data-param-key` present on the workspace: `format`, `quality`, `input_path`,
`resize` — the exact four keys in the imagemagick manifest's
`parameters_schema`, once each, no duplicates.

## Install-control visibility

The requirement is `installButton.getBoundingClientRect().bottom <= window.innerHeight`
with dependencies missing.

| Size | Dock | Gate | Install control | In viewport |
|---|---|---|---|---|
| 1440×900 | bottom **900** of 900 | bottom 886 | bottom **873** | **yes** |
| 390×844 | bottom **844** of 844 | bottom 830 | bottom **817** | **yes** |

One gate on the page, never two. It is not sticky and not fixed: it is a flex
sibling of the scrolling stage inside a `100dvh` column, so "pinned" is
structural. No page height can push it, which is how the previous build put
Install 580px below the fold.

## End-to-end run

Through the site's own controls, against the live backend:

1. Hero → `Choose an image` → uploaded a real 640×400 PNG. The page landed on
   `/workspace` with `input_path` carried in router state. Input pane rendered
   the real image (`naturalWidth×naturalHeight` = 640×400, 139 kB).
2. Dependency gate re-checked itself and reported `ready`, naming the real
   probed version string.
3. Typed `240x160` into the geometry field, picked `jpg`, set quality 60,
   pressed Convert. `useToolExecute` → `POST /api/tools/imagemagick/execute`.
4. Backend wrote `downloads/imagemagick/photo.jpg`, 1414 bytes. Verified
   independently:
   - `magick identify` → `JPEG 240x150 8-bit sRGB 1414B`
   - `file` → `JPEG image data ... 240x150, components 3`
   - `GET /api/artifacts/content?path=…` → `200`, `content-type: image/jpeg`, 1414 bytes
   - The output pane re-fetched it from the artifact index and sized it from the
     backend's own index rather than from the response.
5. Repeated as WebP: `downloads/imagemagick/photo.webp`, 846 bytes,
   `WEBP 240x150 846B`.

Note the 240×150 rather than 240×160: a geometry with no operator is a bound the
aspect ratio is fitted inside, not a pair of target dimensions. The geometry key
originally claimed the opposite — it was corrected against this run, and the
workspace now shows this exact example.

Failure path, same real backend: pointed `input_path` at a file that does not
exist and pressed Convert. The page rendered the backend's own message verbatim:
`input file not found: [path]`. The `[path]` redaction is the backend's, confirmed
by calling the endpoint directly with `curl`; the frontend passes it through
untouched. Running with an empty `input_path` surfaces `input_path is required`
the same way. Elapsed time is measured wall-clock seconds only — no invented
percentages anywhere on either site.

## What the review caught

Every item below was found by looking at a screenshot or a measurement, not by
reading the CSS. They are the reason this review was worth doing before scaling.

1. **The floating rail covered the input pane.** The rail was absolutely
   positioned over a canvas that had no reserved space, so the empty state it
   exists to serve was unreadable. The canvas now reserves a 304px column for it
   on wide viewports.
2. **The dock ate 48% of the viewport.** Stacked, gate-under-controls, the dock
   measured 431px of 900 and left the canvas 390px. Two columns — geometry and
   run left, gate right — brought it to 312px and the canvas to 536px.
3. **The rail grew down over the pinned dock.** It was bounded by `max-height:
   58vh` rather than by the stage, so on a tall viewport its bottom edge crossed
   the dock and clipped the geometry label. Now bounded by `top`/`bottom` on the
   rail, with the body flexing and scrolling inside.
4. **The phone layout was crushed.** The rail was a band above the canvas and the
   dock was 503px of an 844px screen, leaving 248px for the canvas with both
   panes stacked. The rail now floats over the canvas at every width, collapsed
   behind a disclosure header, costing one 41px strip.
5. **The cream scrollbar leaked in.** `index.css` styles `::-webkit-scrollbar`
   globally with the shell's `--brand-sage`. An olive thumb appeared on this
   site's grey board. Both sites restate it. The home index also had to become
   its own scroll container, because a document-level scrollbar belongs to no
   site and can only be styled by the shell.
6. **The panel stack reported horizontal overflow.** Each rotated corner swung
   past its own box; the stack measured `scrollWidth` 728 against `clientWidth`
   720. Fixed by giving each inset the few pixels of headroom its rotation needs
   — not by clipping, which would have hidden the measurement.
7. **The geometry key was scrambled.** It reused a flex strip, which reflowed
   `dt`/`dd` around each other so pairs interleaved. It is a real two-column
   `<dl>` now.
8. **The `800x600` description was factually wrong** — see the end-to-end note.
9. **The home index repeated one disclaimer 28 times**, which is what turned a
   strict index into a wall. Short labels, one legend.

## What the review approved

- No Tools Garage chrome on any of the six surfaces: no sidebar, no topbar, no
  Platform nav, no wordmark, no `ENGINE STATUS` plate.
- The dependency gate inherits this site's palette. Its status hues are
  *darkened* rather than reused: the app-level ones were tuned for dark
  faceplates and reach only 2.0:1 on a light ground.
- The four manifest keys each have exactly one labelled, bound control.
- Empty panes are designed and informative, with no checkerboard and no texture
  standing in for absent content. The input pane states what to do and why the
  pane is blank; the output pane reports what the next run would produce from
  the current geometry.
- The existing app is untouched: `/tools`, `/tools/imagemagick`,
  `/dependencies` all still render inside the shell. An unknown `/t/<id>`
  redirects to the index; a longer unknown path falls through to the catalog.
- Zero console errors across all three standalone surfaces.

## The pattern, for the remaining 20

1. Add the tool's accent and `availability` to `registry.ts`. `path` only where a
   site exists — a planned tool must not be able to advertise a route.
2. Add one `lazy()` entry in `src/sites/App.tsx`. That is the entire routing
   change; D7's isolation is the bundler's, not hand-maintained.
3. Root every custom property and every selector under one site root class, and
   re-skin any reused app-level component (`.dep-gate`, `ToolResultPanel`) with a
   selector specific enough to beat `index.css`.
4. Restate `::-webkit-scrollbar` and check the document does not scroll, or the
   shell's cream scrollbar will show through.
5. Put the gate in a flex sibling of the scrolling area, never inside it or
   sticky inside a tall rail. Then measure
   `installButton.getBoundingClientRect().bottom <= window.innerHeight`.
6. Screenshot it at 1440×900 and 390×844 before believing any of it.