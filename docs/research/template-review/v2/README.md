# Template review v2 — the four open defects

Date: 2026-10-05. Supersedes `../README.md` only on the four defects that
document listed; everything it recorded about the working states still holds.
Same setup as v1: Chrome 154.0.8037.97 on a dedicated CDP instance
(`--user-data-dir=/tmp/opencode/chrome-audit`, port 9222) driven with
`browser-harness`, backend on `:8000`, Vite dev server on `:5173`.

## Surfaces

| Surface | Route | Screenshots |
|---|---|---|
| Home index | `/` | `home-1440x900.png`, `home-390x844.png` |
| Image Converter intro | `/t/imagemagick` | `hero-1440x900.png`, `hero-390x844.png` |
| Image Converter workspace | `/t/imagemagick/workspace` | `workspace-1440x900.png`, `workspace-390x844.png`, `workspace-1440x900-rail-geometries-open.png`, `workspace-390x844-rail-open.png`, `workspace-390x844-rail-geometries-open.png` |
| Real conversion | workspace, after a real run | `e2e-1-source-loaded.png`, `e2e-2-converted.png` |

Numbers in `measurements.json`. The probe opens the geometry disclosure before
measuring, which is the worst case for the rail's height — the defect was
reported in that state.

## The four defects

### 1. Copy had regressed into self-narration — fixed

The five sentences from the review are gone, and so is one more of the same
family that the review had not listed:

| Was | Now |
|---|---|
| *(the pane-is-empty paragraph)* | `No image chosen yet.` / `Choose a file with **Choose an image** on the intro page, drop one on this rail, or type a path this machine can read.` |
| `Ignored by PNG, honoured by JPEG and WebP — that is the encoder's own rule, not this page's.` | `JPEG and WebP: higher is a bigger file. PNG: higher is a smaller one.` |
| `A geometry with no operator is a bound, not a target: …` | `With no operator the geometry is a box the image fits inside, so 240x160 on a 640x400 source comes back 240x150.` |
| `Passed to the backend as the target extension. One of the 3 values the manifest declares.` | `The output file is written in this format.` |
| `resize is empty, so the output keeps the source dimensions. Type a geometry below to change that.` | `No geometry set, so the output keeps the source dimensions.` |
| `Nothing on this page is a placeholder: a tool without a site says so.` *(home index)* | removed |

The original quality sentence was also **false**, not just self-narrating — see
the next section. The one useful correction is kept, and it is the copy the
brief asked to keep.

### 2. The floating rail clipped its own content — fixed

v1: `What the geometry string means` and its table ran past the rail's bottom
edge, with `800x600^` cut through the middle of the row.

Two changes, both measured:

1. The table is a `<details>` disclosure, collapsed by default. The default
   state therefore has nothing to cut.
2. The rail is 320px wide with a 360px canvas column and 10px rows, so all
   seven entries fit on one line each. Before, four of them wrapped.

| 1440×900, disclosure open | v1 | v2 |
|---|---|---|
| Rail body client height | 616 px | 616 px |
| Rail body scroll height | 696 px — scrolled, `800x600^` half-cut | **616 px — no scroll** |
| Last key row bottom | 796 px, 67 px past the edge | **707 px, 21 px clear** |

At 390×844 the rail is a control sheet with its own scroll, as v1 already had
it: 490 px client, 601 px content, and the last row reaches 567 px against a
590 px edge after scrolling. That is "scrollable to its end", and the thumb is
visible.

**Dock proportions.** The 48%-of-viewport figure in the v1 review was already
fixed by the previous build and is unchanged by this work: the dock measures
**151 px of 900 (17%)** at 1440×900 and **246 px of 844 (29%)** at 390×844.
The canvas keeps 77% and 65%.

### 3. Raw build strings surfaced to users — fixed

`Ready — conda.imagemagick Version: ImageMagick 7.1.2-31 Q16-HDRI x86_64
8309dc92:20260903 https://imagemagick.org` is now

```
Ready — conda.imagemagick 7.1.2-31
```

`shortDepVersion()` extracts the first version token from whatever the probe
printed and returns `null` when there is not one, so the string on screen is
always a substring of the real probe output. The full banner is still the
element's `title`.

### 4. Raw manifest keys leaked as label suffixes — fixed

`Target Format`, `Quality (1-100)`, `Input Image File`, `Resize Geometry` are
the visible labels. The bare key moved to the label's `title` attribute, and
`data-param-key` is unchanged — all four keys, once each.

## Two factual errors found while verifying defect 1

Both strings were wrong, which is worse than being wordy. Everything below was
read off the live `POST /api/tools/imagemagick/execute` endpoint against the
640×400 PNG in `uploads/`, not recalled.

**Geometry.** `800x600 — fit inside 800×600; may be smaller` is not what the
backend does:

| geometry | output from 640×400 |
|---|---|
| `800x600` | **800×500** — it scales up as well as down |
| `240x160` | 240×150 |
| `800x600>` | 640×400 — shrink only, source untouched |
| `800x600^` | 960×600 — covers; not exactly the box |
| `800x600!` | 800×600 — exact size, ratio dropped |
| `1200x` | 1200×750 |
| `x1200` | 1920×1200 |
| `50%` | 320×200 |
| *(empty)* | 640×400 — source size kept |

`800x600!` was missing from a key that claims to explain the string, and it is
the one operator that drops the aspect ratio. It is listed now, and the field
accepts it.

**Quality.** `Applies to JPEG and WebP; PNG ignores it` is also false. The tool
always passes `-quality`, and for PNG `magick` reads it as zlib strength, so
PNG tracks it backwards:

| format | q1 | q50 | q85 | q100 |
|---|---|---|---|---|
| png | 103 112 B | 796 B | 883 B | 675 B |
| jpg | 561 B | 1 335 B | 2 021 B | 18 378 B |
| webp | 358 B | 554 B | 846 B | 140 B |

A test now asserts the `800x600` entry cannot go back to being wrong.

## The hero, against the real reference

`../image-to-pdf-standalone/src/components/HeroPage.tsx` does exist — it is at
`../../image-to-pdf-standalone/`, one level above the repo root, not inside it.
It is 25 lines: a full-viewport shell, one `h1`, a two-line description, and
exactly two actions. Its CSS centres the content and scrolls on overflow.

This hero already had the four structural pieces, so reconciliation was about
what sat around them:

- the description ran four lines and ended in `writes the converted file to the
  artifact index`; it is now two lines with no backend plumbing
- the panel stack printed `(empty)` twice, once at display size
- `Default settings` became `Out of the box`, listing only the keys the manifest
  really presets, with a plain foot for the other two
- `Resize geometry / (empty)` became `Geometry string` carrying the site's
  signature at display size — `240x160`, and what a 640×400 source returns
- the identity strip's `All tools` button is gone, so the hero has exactly two
  actions, as the reference does. **The home affordance now lives only in the
  workspace**, which is where D3 and the shared brief rules put it. The cost is
  that a visitor who lands on `/t/imagemagick` from a bookmark has to enter the
  workspace to get back to the index. The reference behaves the same way.

The palette, the type and the rotated panel stack are untouched.

## Accessibility found while measuring

Not one of the four defects, so it is its own commit.

`--im-ink-40` measured **2.85:1** and `--im-ink-52` **4.27:1** on this ground.
Both carry body copy at 10–12 px — the rail hints, the geometry key, the format
chips, the pane footers, the dependency id in the bar — so all of it missed AA's
4.5:1. They are now `--im-ink-58` (**5.20:1**) and `--im-ink-62` (**5.86:1**),
renamed for the alpha they actually have.

On the accent panel the de-emphasised ink has to darken rather than lighten:
0.62 black over `#0D99FF` is 3.93:1, so the hero's panel label and foot go to
0.82 (5.82:1).

Measured after the change, every painted text node at 10 px or above:

| surface | lowest |
|---|---|
| hero | 5.32:1 |
| workspace | 5.20:1 |
| home | **2.67:1** — not fixed |

## Still open

1. **The home index fails AA** at four rules: `.hs-mark__note` (114 nodes),
   `.hs-lede em`, `.hs-legend li`, `.hs-row__state`, all at 2.67–2.87:1. Left
   alone deliberately: D15 marks the home concept as an interim placeholder
   pending the D14 research, so patching its palette now is likely wasted work.
2. **The hero has no way home** (above). Reachable from the workspace; not from
   the hero. Flagging rather than assuming.
3. **Pre-existing dead CSS**, untouched because it predates this work:
   `.im-field__key` and `.im-rail__title--plain` have no users anywhere in
   `src/`.

## The pattern, restated for the remaining 20

1. Say what to do, not what the page is doing. A page that behaves honestly
   does not get to say so. Tests grep for the phrasings that actually shipped,
   not for the ones that were caught.
2. Never print a placeholder for a value the user supplies. `(empty)` is the
   defect; "a 640×400 source comes back 240×150" is the content.
3. Every string that describes what the tool *does* gets checked against a real
   run before it ships. Two of this build's four copy strings were wrong.
4. A rail with a finite height gets sized by its tallest content, or that
   content becomes a disclosure. Measure the last row's bottom against the
   container's bottom with the content open; "it scrolls" is not the same as
   "nothing is cut in half".
5. Extract a version, never restate one — and return `null` when there is
   nothing to extract.
6. The manifest's human title is the label. The bare key is a `title` and a
   `data-*`, never visible text.