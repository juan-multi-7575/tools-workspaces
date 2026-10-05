# BATCH A — sox, mediainfo, streamlink, gallery-dl

Read `SHARED-PREAMBLE.md` in this directory first and follow it exactly. Then build **four**
sites. Work one tool at a time and commit each before starting the next.

Your reference images are in `tools-workspaces/docs/research/design-references/<name>/`.

---

## 1. `sox` — DSP Effect Rack

Brief **#7**. Reference: **`brutalist`** (`design-references/brutalist/`).

Ground `#241D1A` warm near-black, ink `#FFE0BD` warm cream, single amber accent `#E8A33D`.
`Space Grotesk` for labels, `JetBrains Mono` for effect tokens.

Layout: a vertical chain of effect modules with real cables drawn between them, reorderable by
drag. Each stage builds a real token; the chain joins into the single `effect` string the
backend splits on whitespace.

**Signature:** the exact command `sox <input> <effect tokens> <output>` is always visible,
because that string is the truth of the tool.

Read the manifest — the schema declares only `effect`, but `execute()` in
`backend/app/tools/mediainfo_tool.py` **also reads `input_path`**. Surface both, and explain in
the UI that `input_path` is required though the schema does not list it. Do not invent params.

**Real bug to not reproduce:** render `&lt;input&gt;` as **real angle brackets**. The template
once showed the literal text `&lt;input&gt;` because the entities sat inside a JS string literal
in an expression container, where JSX never decodes them.

**Truth contract:** a successful run must produce a real `.wav`. Show a real waveform
(`wavesurfer.js` is already a dependency) and a play control. If `sox` is not installed on this
machine, the page must say so with the backend's own message — do not fake a waveform.

---

## 2. `mediainfo` — Media Metadata & Stream Inspector

Brief **#5**. Reference: **`observable`** (`design-references/observable/`).

White ground, ink `#1B1E23`. Three-font system: `Inter Variable` UI, `Source Serif 4` for
stream descriptions, `Spline Sans Mono` for every numeric value and codec string.

Layout: a format summary band, then per-stream tables grouped by `codec_type`, each stream type
tinted from the data. Every number in tabular mono so columns align without gridlines.

**Signature:** all-numeric typography — mono for every measured value, so the page reads as
instrumentation rather than as prose.

**Truth contract — the important one:** `execute()` returns the parsed `ffprobe` JSON as `data`,
with `{ format: {...}, streams: [...] }`. Render **only keys the payload actually contains**.
Never fabricate a field, never default a missing one to a plausible value — a stream with no
`bit_rate` must not show a bitrate. If `data` is empty, say the probe returned nothing.

**Verify against a real run:** generate a tiny real fixture first
(`ffmpeg -f lavfi -i sine=frequency=440:duration=1 /tmp/tone.wav`), run the tool, and confirm
your renderer shows exactly the keys that came back.

---

## 3. `streamlink` — Live Stream Capturer

Brief **#6**. Reference: **`nasa`** (`design-references/nasa/`).

Deep institutional blue-black ground, near-white ink, `#FF4D00` off-air red as the single alarm
colour. `Archivo` UI, `Public Sans` for data. A status board: large live state, capture
controls, then the artifact list.

**Signature:** an "OFF AIR" plate that owns the screen on truthful failure.

**Truth contract — the important one:** `execute()` tries `streamlink` first and **falls back to
`yt-dlp`**, and if both fail it returns `failed` with a real error. `backend/tests/test_11_catalog.py::test_streamlink_standalone`
asserts a bad URL **must** come back failed with a truthy error. So:

- A "captured" state must be **unreachable without a real artifact path on disk**.
- On failure, say that both the capture and the fallback failed, and show the backend's own
  error verbatim. Do not invent a plausible live-stream error.

---

## 4. `gallery-dl` — Gallery Scraper

Brief **#9**. Reference: **`areana`** (`design-references/areana/`).

White ground, near-black ink, `#8A8A8A` secondary. Serif headings — `Source Serif 4` is the free
substitute for Are.na's `areal` — sans for UI. A calm block grid with generous white.

**Signature:** matted frames, like prints on a wall.

**Truth contract:** `execute()` returns a **single `gallery.zip`** containing everything the CLI
wrote. `backend/tests/test_11_catalog.py::test_gallery_dl_standalone` asserts an unsupported URL
must fail truthfully. Render that error honestly. Show the zip as a real download. **Do not
invent a thumbnail grid of images the API never returned as separate artifacts** — if you want a
grid, it must be built only from artifacts that genuinely came back.

---

## Report

Follow the shared preamble's report format, per tool. Include the measured numbers and the real
run responses. If `sox`, `ffprobe`, `streamlink` or `gallery-dl` are not installed on this
machine, say so plainly and show that your page surfaces the real failure — that is a pass, not
an excuse.
