# Design Research Index & Per-Tool Design Briefs

Compiled 2026-10-04. Captured with browser-harness: each site has 4 scrolled screenshots
(`00`–`03`, at 0% / 28% / 55% / 80% of page height) plus `meta.json` (computed
background, foreground, h1 typeface/size/weight/tracking, and the font stack actually used).

Every reference was validated as a real page load — not a DNS error, 502, or JS-gate —
by asserting `document.body.innerText.length` and testing for error-page text.
Three candidates (`fw.major`, `crt.sh`, `thesfmono.com`) failed validation and were deleted
rather than left in as false references.

## Captured references

| slug | reference | measured ground | design language |
|---|---|---|---|
| `linear` | Linear | bg `rgb(8,9,10)`, Inter Variable 64px/510/-1.4px, Berkeley Mono | Product UI, real telemetry, indigo accent, layered dark surfaces |
| `vercel` | Vercel | bg `rgb(250,250,250)`, GeistSans 64px/400/-3.84px, Geist Mono | Swiss-precise, hairline grids, near-white, restrained |
| `notion` | Notion | NotionInter 96px/600/-4.6px, pure white | Document-first, enormous tight display, quiet chrome |
| `figma` | Figma | figmaSans 56px/400/-1.25px + figmaMono | Canvas-first, geometry, playful-but-precise |
| `areana` | Are.na | serif body, pure white | Calm block grid, research/archive, generous white |
| `pudding` | The Pudding | Signifier 40px/500 + Founders-grotesk | Editorial data-journalism, serif voice, annotated |
| `observable` | Observable | Inter Variable + Source Serif 4 + Spline Sans Mono | Three-font data system, chart-forward, technical-editorial |
| `arc` | Arc | bg `rgb(255,252,236)` cream, Marlin/Exposure, 32px/700/-1.6px | Warm cream, soft, consumer-browser warmth |
| `vam` | V&A | Spiller, pure white | Museum archival, image-led, institutional restraint |
| `bandcamp` | Bandcamp | bg `rgb(236,243,244)`, Helvetica Neue 32px/500 | Pale cyan-grey, dense metadata, utilitarian marketplace |
| `pitchfork` | Pitchfork | PTSerif 34px/700 + Inter | Music print editorial, rules and lists, black/white |
| `nealfun` | Neal.fun | low-fi, playful | Warm low-fi, personality, anti-corporate |
| `recast` | Recast Studio | Archivo Black 89.76px/900/-2.24px | Loud display type, single accent, video-first |
| `brutalist` | Motherfucking Website | Times New Roman, no CSS | 2012 brutalism, zero chrome, honest |
| `nasa` | NASA | deep institutional blue | Mission control, authority, wide imagery |
| `moma` | MoMA | heavy geometric wordmark, cyan accent | Institutional confidence, full-bleed art, high contrast |
| `rsms` | rsms.me | type foundry minimal | Inter specimen, generous space, type-first |
| `practicaltype` | Butterick | book-like serif | Reading, teaching, long measure, book typography |
| `eyemag` | Eye Magazine | Georgia 14px + Helvetica | Magazine grid, small type, many columns |
| `fontshare` | Fontshare | bg `rgb(255,255,227)` warm yellow, Passenger-Sans | Type specimen sheet, loud, specimen-as-layout |
| `cern1992` | info.cern.ch | Times New Roman, unstyled | 1992 plain, forensic, honest, hyperlink-blue |
| `type.method` | Kern Type | bg `rgb(43,49,63)` navy, Georgia 100px/+16px | The letterform IS the interface, one accent dot |

## Font availability constraint

Several references use commercial faces that cannot be shipped: Signifier, Founders-grotesk
(Pudding), Spiller (V&A), PTSerif / Walfork (Pitchfork), Marlin / Exposure (Arc), figmaSans,
figmaMono, areal (Are.na), Passenger-Sans (Fontshare), Berkeley Mono (Linear).

Every brief below therefore names a **free substitute** from Google Fonts (SIL OFL) unless the
brief explicitly says the face is decorative-only. Do not hotlink a commercial font.

---

# Per-tool design briefs

Each tool becomes a **standalone site**: zero Tools Garage chrome, two states — a
full-viewport **hero**, then the **workspace** — with a **home** affordance back to the home
site (D1–D4). Design is chosen for quality and uniqueness, not matched to function, but every
concept is additionally held to: *does this make the task clear and completable?* A concept
that fights its function gets flagged, not shipped.

Shared rules for every brief:
- Full-viewport states. No sidebar, no topbar, no Platform nav.
- Own scoped CSS custom properties; nothing leaks between tools (D7).
- Home affordance present in the workspace state, styled per this concept.
- Dependency gate inherits the tool's own palette, pinned so Install is always on screen.
- No fabricated status/size/version. Backend errors verbatim. No invented percentages.
- Every manifest parameter surfaced as a labelled control bound to that exact key.
- `data-param-key` preserved per parameter (tests assert on it).

---

## 1. `media.download.yt-dlp` — Media Downloader
**Reference:** `bandcamp`. **Concept:** a pale cyan-grey record-store catalogue.
- Ground `#ECF3F4`, ink `#222`. Near-white surface, hairline `rgba(0,0,0,.08)` rules.
- Type: system grotesque only — no webfont. 13px/1.45 body, tabular numerals on every size.
- Layout: left intake column, right live queue table, dense rows.
- Signature: each queued task is a catalogue row with a real byte-progress rule beneath it.
- Accent: single `#0a7c7c`. Heavy deps get a bordered notice, not a colour change.
- Free: no webfont needed — deliberately.

## 2. `trimmer` — Media Trimmer
**Reference:** `type.method` (Kern Type). **Concept:** the timeline is the typography.
- Ground `#2B313F` navy, ink `#F9FAFB`, single `#3B82F6` accent dot.
- Type: a heavy display face for enormous numerals/letterforms that encode region
  boundaries — `Archivo Black` (free) — plus `JetBrains Mono` for timecodes.
- Layout: one enormous centred timeline where the selection is expressed as oversized
  letterform spacing, not as a coloured bar.
- Signature: region handles are draggable glyph-weight changes, not generic grabber icons.
- Motion: one authored moment — the playhead easing as it scrubs.

## 3. `transcriber` — Speech to Text
**Reference:** `practicaltype` (Butterick). **Concept:** a typeset transcript.
- Ground `#FBF7F0`, ink `#1A1A18`. Book-like, long measure (65–75ch).
- Type: `Newsreader` for the transcript body, `Libre Franklin` for UI at small sizes.
- Layout: a single generous column, source audio as a slim inline transport, cues as
  properly set paragraphs with hanging timestamps.
- Signature: cue numbers set as marginalia in the left margin, like a critical edition.

## 4. `audio_processor` — Audio Extractor & Processor
**Reference:** `arc`. **Concept:** warm consumer audio.
- Ground `#FFFCEC` cream, ink `#000`. Warm, soft, untechnical.
- Type: `Bricolage Grotesque` display at 32px/700/-1.6px, `DM Sans` for controls.
- Layout: a real waveform as the page's centre of gravity, with a floating control rail.
- Signature: format/sample-rate choices as tactile pill segments with generous radius.
- Free substitutes noted for Marlin/Exposure.

## 5. `mediainfo` — Media Metadata Inspector
**Reference:** `observable`. **Concept:** a three-font data system.
- Ground white, ink `#1B1E23`. Chart- and table-forward.
- Type: `Inter Variable` UI, `Source Serif 4` for stream descriptions,
  `Spline Sans Mono` for every numeric value and codec string.
- Layout: format summary band, then per-stream tables grouped by `codec_type`, each with
  a colour token drawn only from the data.
- Signature: every number in tabular mono so columns align without gridlines.
- Rule: render only keys the payload actually contains. Never fabricate a field.

## 6. `streamlink` — Live Stream Capturer
**Reference:** `nasa`. **Concept:** mission control for a live feed.
- Ground deep institutional blue-black, ink near-white, `#FF4D00` off-air red as the
  single alarm colour.
- Type: `Archivo` for UI, `Public Sans` for data, wide authority.
- Layout: a status board — big live state, capture controls, then the artifact list.
- Signature: an "OFF AIR" plate that owns the screen on truthful failure. The backend
  falls back streamlink → yt-dlp; when both fail, say exactly that, verbatim.
- Rule: a captured state is unreachable without a real artifact on disk.

## 7. `sox` — DSP Effect Rack
**Reference:** `brutalist`. **Concept:** an honest signal rack, no chrome.
- Ground `#241D1A` warm near-black, ink `#FFE0BD` warm cream, single amber accent.
- Type: `Space Grotesk` for labels; effect tokens in `JetBrains Mono`.
- Layout: a vertical chain of effect modules with real cables between them, reorderable.
- Signature: the exact `sox <input> <effect tokens> <output>` command line is always
  visible, because that string is the truth of the tool.
- Rule: `&lt;`/`&gt;` must render as real angle brackets (this was a real prior bug).

## 8. `demucs` — Stem Separator
**Reference:** `vam`. **Concept:** a museum archive of separated stems.
- Ground white, ink `#1D1E20`. Image-led, institutional restraint.
- Type: `Newsreader` for headings, `Libre Franklin` for metadata at small sizes.
- Layout: archival ledger of the real returned artifacts, each with a play control.
- Signature: a catalogue-caption treatment per stem.
- Rule: the backend returns a single `stems.zip` — show that honestly. Do not invent a
  four-lane mixer of stems the API never returned as separate artifacts.

## 9. `gallery-dl` — Gallery Scraper
**Reference:** `areana`. **Concept:** a calm collection wall.
- Ground `#FFFFFF`, ink near-black with `#8A8A8A` secondary.
- Type: a serif for headings — `Source Serif 4` (free sub for `areal`) — sans for UI.
- Layout: a block grid with generous white, images as the only content.
- Signature: matted frames, like prints on a wall.
- Rule: images shown must come from real returned artifacts.

## 10. `imagemagick` — Image Converter
**Reference:** `figma`. **Concept:** canvas-first.
- Ground `#F5F5F5`, ink `#000`, blue accent `#0D99FF`.
- Type: `Inter` UI, `JetBrains Mono` for geometry/format strings.
- Layout: a broad before/after canvas with a floating tool rail.
- Signature: the geometry string is the hero, editable in place.
- Rule: **no checkerboard transparency pattern.** Empty state must be a designed,
  informative state — never a category-cliché texture standing in for absent content.

## 11. `exif_scrubber` — Metadata Privacy Scrubber
**Reference:** `cern1992`. **Concept:** a forensic ledger, 1992 honesty.
- Ground `#FFFFFF`, ink `#000`, hyperlink blue `#0000EE`. Deliberately plain.
- Type: `Times New Roman` / `Liberation Serif` at honest sizes. No styling tricks.
- Layout: a dense key/value ledger, scrollable, with a scrub/inspect switch.
- Signature: a genuine before/after field diff computed from two real `inspect` payloads.
  Mark a field removed only when an inspect actually proves it.
- Rule: never advise `apt install` — point at the dependency manager.

## 12. `pandoc` — Document Converter
**Reference:** `pudding`. **Concept:** an annotated editorial spread.
- Ground `#FFFFFF`, ink `#212529`.
- Type: `Fraunces` display (free sub for Signifier) + `Public Sans` (sub for
  Founders-grotesk).
- Layout: a two-pane spread — source left, rendered output right, with marginal notes.
- Signature: marginalia carrying the real conversion parameters.

## 13. `pdf_tools` — PDF Text & Info
**Reference:** `pitchfork`. **Concept:** print editorial, rules and lists.
- Ground `#FFFFFF`, ink `#000`, one red accent.
- Type: `Source Serif 4` (free sub for PTSerif) + `Inter`.
- Layout: ruled sections, an action switch, then dense real output — full extracted text
  searchable, or a `pdfinfo` table containing only keys the backend returned.
- Signature: hairline rules doing the structural work instead of boxes.

## 14. `ocrmypdf` — OCR Scanner
**Reference:** `moma`. **Concept:** institutional, page-forward.
- Ground white, ink `#000`, cyan `#00A0E9` accent, heavy wordmark presence.
- Layout: page thumbnails in a left column, recognised text in a right reading column.
- Signature: each page is treated as an exhibit with its real text layer beside it.
- Rule: a missing input must surface the backend's own
  `input file not found` message verbatim.

## 15. `packager` — ZIP Packager
**Reference:** `neal.fun`. **Concept:** warm low-fi, plain-spoken.
- Ground `#FFF8EE`, ink `#2B2118`. Unfussy, friendly.
- Type: `Gabarito` or `Familjen Grotesk`, rounded, informal.
- Layout: a file tree plus a manifest builder — honest and unglamorous.
- Signature: a rubber-stamp "ZIP READY" on success, drawn as a stamp not a badge.
- Rule: never fabricate archive entries; show what was really zipped.

## 16. `summarizer` — Summariser
**Reference:** `practicaltype` (Butterick). **Concept:** a reading desk.
- Ground `#FBF7F0`, ink `#1A1A18`.
- Type: `Newsreader` throughout for reading comfort; `Libre Franklin` for controls only.
- Layout: source text as a proper column beside a numbered key-points column.
- Signature: takeaways set as numbered marginalia.
- Rule: render the real `takeaways` and real `bullet_count`. If none, say so. Never
  write a placeholder summary.

## 17. `subtitle.translate.srt` — Subtitle Translator
**Reference:** `notion`. **Concept:** a clean document surface.
- Ground white, ink `rgba(0,0,0,.95)`.
- Type: `Inter` at display scale for headings, `Source Serif 4` for cue text.
- Layout: synced dual-pane cue comparison — original left, translated right, index-matched.
- Signature: changed cues marked only where the strings actually differ.
- Rule: build both panes from real `.srt`/`.vtt` contents fetched via `api.getArtifactContent`.

## 18. `text.translate.llm` — Document Translator
**Reference:** `eyemag`. **Concept:** a magazine grid.
- Ground white, ink `#000`, multi-column.
- Type: `Source Serif 4` body at a true 65–75ch measure, `Libre Franklin` chrome.
- Layout: multi-column editorial grid; a real sentence-level diff between the two real
  strings.
- Signature: the diff set as a marked-up galley, red/blue paired.
- Rule: this tool returns no translated text in `data` — the diff must come from two real
  artifact reads, never from an assumption.

## 19. `codec_tool` — Encoder / Decoder
**Reference:** `fontshare`. **Concept:** a type specimen sheet.
- Ground `#FFFFE3` warm yellow, ink `#000`.
- Type: `Archivo Black` for the output specimen at large size; `Space Grotesk` controls.
- Layout: input specimen left, output specimen right, with the codec as a specimen label.
- Signature: the transformed output IS the hero, set large, in real monospace.
- Rule: **never ship a pre-filled example payload.** Start empty; running empty surfaces
  the backend's own error, which is the honest first-run state.

## 20. `script_runner` — Script Runner
**Reference:** `vercel`. **Concept:** a precise code surface.
- Ground `#FAFAFA`, ink `#171717`, hairline `#E5E5E5`.
- Type: `Inter` UI, `JetBrains Mono` editor and console.
- Layout: a real editor with line numbers and an active-line cue, console beneath.
- Signature: the trailing action bar outside the scrolling work area.
- Rule: a non-zero exit code must render as failure with real stderr — never as success.
  Also: no cross-run output leakage (fixed on the backend, keep it fixed).

## 21. `sys.health.check` — Model Health Probe
**Reference:** `linear`. **Concept:** a real telemetry board.
- Ground `#08090A`, ink `#F7F8F8`, indigo accent.
- Type: `Inter Variable` + `JetBrains Mono` (free sub for Berkeley Mono).
- Layout: provider/model matrix left, real results table right, latency as a mono bar.
- Signature: per-provider colour tokens keyed to real status only.
- Rules: **the form must never be laid out on viewport breakpoints inside a narrow rail** —
  this caused the previous 14-element overflow collapse. Use container queries. And
  `results[].error` is a `{code,message}` object that must be rendered, never passed
  to React as a child.

---

## Home site

Needs its own concept — it lists every tool and is the entry point (D4). Recommend a
`vercel`-class Swiss-precise index: a strict grid of tool entries, each showing its own
accent so the variety is visible before you enter. Its own brief to follow.

## Status

- Research: **22 references captured and validated.**
- Briefs: **21 of 21 written** (home site pending).
- Built: **0.** Next step is the template tool (D12) — see the open question in
  `2026-10-04-rebuild-decision-record.md` about which tool goes first.