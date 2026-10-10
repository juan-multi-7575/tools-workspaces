# ImageMagick Site — Workflow Audit (known issues, not yet fixed)

Audited 2026-10-05 against `src/sites/imagemagick/`. The mechanical detector is clean
(`impeccable detect` returns `[]`) — the ground/ink palette passes contrast, there is zero
horizontal overflow, and the honesty rules are respected. Everything below is **workflow**
and **data-safety**, which no detector catches.

**These are recorded as a known-issue list so the 20 remaining site builds do not inherit
them.** Decisions already taken by the user are marked ✅ — build those in from the start.

---

## P0 — data loss

### 1. A second run silently destroys the first output ✅ decided
`backend/app/tools/image_tools.py:47` writes `out_name = f"{src.stem}.{fmt}"` into a shared
`tool_downloads_dir("imagemagick")`. Convert `photo.png` → `photo.webp`, change quality, run
again: the first file is **overwritten with no warning and no history**.

**Decided:** stop overwriting. Every run writes a unique name (`photo.webp`, `photo-2.webp`,
…) and the workspace keeps a run history so earlier outputs stay downloadable.

This is backend work, but the site must render whatever the backend returns honestly — do not
build UI that assumes a single artifact.

## P1 — honest defaults

### 2. Format silently defaults to lossy WebP ✅ decided
The manifest default is `format: "webp"` (`image_tools.py:26`). A user picks a PNG, does not
touch the format control, presses Convert, and gets lossy WebP at q85. Nothing on screen says
the format is about to change; the OUTPUT badge only reveals it afterwards.

**Decided:** default to keeping the source format. "Keep source" becomes the default state and
choosing a format is an explicit act.

### 3. Stale output after changing settings
`output` is derived from `execute.state.result` (`ImageMagickWorkspace.tsx:113`). Changing
`quality` or `resize` after a run leaves the old output image on screen with nothing saying it
no longer matches the settings. The user can believe they are looking at the result of the
settings currently in the rail.

**Fix:** when params change after a completed run, mark the displayed output stale and say the
run needs repeating. Do not silently leave a mismatched image up.

## P1 — redundant / duplicated UI

### 4. The same error is rendered twice
`ToolResultPanel` renders `state.error` in its own `<pre>`, and `ImageMagickWorkspace.tsx:480-485`
renders `execute.state.error` **again** in the dock. On any failure the user reads the same
message twice, in two places.

**Fix:** one error surface. Pick the dock (nearest the action) or the report, not both.

### 5. `Clear` does not clear
`clear()` (`:124-127`) resets `input_path` and the result but leaves `format`, `quality` and
`resize`. A control labelled "Clear" that keeps half the state is a lie about what it does.

**Fix:** either clear everything, or rename it to what it actually does (`Clear image`).

## P1 — input affordance

### 6. The biggest target does not accept a drop
The rail's small `im-drop` div accepts drops (`:211-227`). The **canvas** — the large, obvious
place a user aims — accepts nothing. Dragging an image onto the empty canvas, which is what
everybody tries first, does nothing at all.

**Fix:** the canvas accepts drops and focuses a visible ring. The hero already handles this
correctly (`ImageMagickHero.tsx:57-60`); the workspace should match.

### 7. No paste support
The empty state says "or type a path this machine can read", but pasting an image from the
clipboard or an image URL does nothing.

**Fix:** accept a pasted path/URL and a pasted image blob.

### 8. Quality is slider-only
`:189-198` is an `<input type="range">` with the value shown beside the label. There is no way
to type an exact number, and the shown value is not editable.

**Fix:** let the number be typed as well as dragged. Use `tabular-nums`.

## P2 — navigation

### 9. The hero has no way home
`ImageMagickHero.tsx` deliberately has no header, matching the `image-to-pdf` reference. The
consequence: bookmark `/t/imagemagick`, and the only way out is **Open an empty workspace**,
then use the workspace's home button.

Structurally faithful to the reference, but a dead end for a bookmarked or shared hero URL.
**Open decision** — flagged in `2026-10-04-rebuild-decision-record.md`; not resolved. Every
hero inherits whatever is decided, so decide before the 20 others are built.

## P2 — stale data

### 10. The recent-artifact picker is never refreshed after a rail upload
`refreshIndex()` runs on mount (`:87-97`) and after a successful conversion (`:120`), but not
after `upload()` (`:99-111`). An image uploaded through the rail does not appear in the
"already on this machine" list until a conversion succeeds.

---

## What is already correct — do not regress

- Every manifest key is surfaced with `data-param-key` intact.
- The dependency gate is pinned; Install is in viewport by construction, not by luck.
- The geometry key is accurate against real runs, including `800x600^` and the `!` operator
  that genuinely drops the aspect ratio.
- The quality hint is correct: PNG tracks quality *backwards* (magick reads it as zlib
  strength, 103112 B at q1 → 675 B at q100).
- Empty states are designed and informative; no checkerboard texture.
- Copy does not narrate the page's own honesty.

## Carried to every site

1. **Never lose a user's output.** Unique names, real history.
2. **Never change something silently** — format, quality, geometry. A setting that alters
   output must be visible before the run, not after.
3. **Never show a stale result as if it were current.**
4. **One error, one place.**
5. **A control's label must match what it does.**
6. **The largest visible target must accept the drop.**
7. **Verify the facts you write against real runs** — two copy strings in this very site were
   factually wrong, and reading the code did not catch either.