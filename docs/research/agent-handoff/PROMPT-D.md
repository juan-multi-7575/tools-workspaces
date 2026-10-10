> **Batch D — port `5177` — worktree `../wt-batch-D`**
>
> You are one of five agents running in parallel. Do the setup in
> `SHARED-PREAMBLE.md` § *BEFORE YOU WRITE ANY CODE* first: your own git worktree,
> your own `npm install`, and your dev server on **port 5177** (not 5173 — four
> other agents have the others).

# BATCH D — exif_scrubber, codec_tool, script_runner, sys.health.check

Read `SHARED-PREAMBLE.md` in this directory first and follow it exactly. Then build **four**
sites. Work one tool at a time and commit each before starting the next.

Your reference images are in `tools-workspaces/docs/research/design-references/<name>/`.

---

## 1. `exif_scrubber` — EXIF Metadata Privacy Scrubber

Brief **#11**. Reference: **`cern1992`** (the first website) — `design-references/cern1992/`.

Deliberately plain: white `#FFFFFF` ground, black ink, hyperlink blue `#0000EE`. Honest
un-styled 1992 typography — `Liberation Serif`/Times at real sizes, no styling tricks.

Layout: a dense key/value ledger, scrollable, with a scrub/inspect switch.

**Signature:** a genuine before/after field diff computed from two **real** `inspect` payloads.

**Truth contract — the important one:**
- `action` is the manifest enum: `scrub` | `inspect`.
- `inspect` returns the real EXIF as `data` — render it as a searchable key/value table with
  GPS/camera/private fields visually flagged.
- `scrub` returns a clean file. To show a diff you must **actually run `inspect` on the scrubbed
  file**. Mark a field removed only when a real inspect proves it. **Never assume removal.**

**Wrong advice already fixed once — do not reintroduce:** the backend previously returned
`exiftool not installed (apt install libimage-exiftool-perl)`. That is now a
`EXIFTOOL_MISSING` constant pointing at the dependency manager, because `conda.exiftool` installs
root-free. If `exiftool` is not installed, show the backend's real current message.

---

## 2. `codec_tool` — Encoder & Decoder Utilities

Brief **#19**. Reference: **`fontshare`** — `design-references/fontshare/`.

Warm yellow `#FFFFE3` ground, black ink — deliberately loud and specimen-like. `Archivo Black`
for the output specimen at large size, `Space Grotesk` for controls.

Layout: input specimen left, output specimen right, the codec as a specimen label.

**Signature:** the transformed output **is** the hero, set large, in real monospace.

**Truth contract:** the `codec` enum is `base64_encode`, `base64_decode`, `hex_encode`,
`hex_decode`, `url_encode`, `url_decode` — segmented control. Render the **real** `data.output`
verbatim with the real `data.codec` and `data.length`.

**Hard rule — this is asserted by a test:** **never ship a pre-filled example payload.** Start
empty. Running empty surfaces the backend's own "Please provide text or an input file" error,
which is the honest first-run state. This tool needs no external binary, so it is the one site
where the dependency gate never appears — that is correct, not an omission.

**Trimmed:** a `<textarea>` cannot ellipsise, so do not use a long sentence as a placeholder.

---

## 3. `script_runner` — Custom Python & Shell Script Runner

Brief **#20**. Reference: **`vercel`** — `design-references/vercel/`.

Near-white `#FAFAFA` ground, `#171717` ink, hairline `#E5E5E5`. `Inter` UI, `JetBrains Mono` for
the editor and console. Swiss-precise and restrained.

Layout: a real editor with **line numbers and an active-line cue**, console beneath.

**Signature:** the trailing action bar sitting **outside** the scrolling work area.

**Truth contract — the important one:** the backend returns real `stdout`, `stderr` and
`exit_code`. **A non-zero exit code must render as a failure with the real stderr — never as
success.** This is the single most important rule in this batch.

Surface every manifest param: `language` (`python`|`bash`), `code`, `custom_args`, `timeout`.
The manifest's `code` default is a sample script (`print('Custom tool execution')`) — **start the
editor empty**, because a pre-filled sample is exactly the fabricated-data class the project
forbids. Running empty surfaces the backend's real `code is required`.

Note: a backend fix already isolated standalone runs into per-run directories, so output no
longer leaks between runs. Keep it that way — if you see leakage, report it, do not paper over it.

---

## 4. `sys.health.check` — AI Model Health & Latency Probe

Brief **#21**. Reference: **`linear`** — `design-references/linear/`.

Near-black `#08090A` ground, `#F7F8F8` ink, indigo `#5E6AD2`. `Inter Variable` +
`JetBrains Mono` (free sub for Berkeley Mono). A real telemetry board: provider/model matrix
left, real results table right, latency as a mono bar.

**Signature:** per-provider colour tokens keyed to real status only.

**Truth contract:** render the real `data.results` rows — model, provider, status, tests passed,
tests failed, latency, and the **real** error text for failures. Summary tiles computed from the
real `data.summary` only.

**Two bugs that already happened here once — do not reintroduce:**
1. **`results[].error` is a `{ code, message }` object.** Passing it to React as a child throws,
   which error-bounded the whole page on any provider without a key. Render
   `errorMessage(result.error)` or `.message` — never the raw object.
2. **Never lay the shared form out on viewport breakpoints inside a narrow rail.** The form uses
   `sm:`/`lg:` breakpoints, so in a 314px rail it assumed a full-width host and produced 14
   overflowing elements, text reading one word per line, and a button clipped off-screen. If your
   layout puts this form in a constrained column, use **container queries**.

Rows must stay compact (~50px), with the full text on `title`.

---

## Report

Follow the shared preamble's report format, per tool. Include measured numbers — especially the
**horizontal-overflow count at 1440×900, 768×1024, 390×844 and 1920×1080** for the health page,
which is the one that broke before. Include real run responses; say plainly if `exiftool` is
unavailable.
