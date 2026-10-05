# BATCH B — trimmer, audio_processor, transcriber, demucs

Read `SHARED-PREAMBLE.md` in this directory first and follow it exactly. Then build **four**
sites. Work one tool at a time and commit each before starting the next.

Your reference images are in `tools-workspaces/docs/research/design-references/<name>/`.

---

## 1. `trimmer` — Media & Audio Trimmer

Brief **#2**. Reference: **`type.method`** (Kern Type) — `design-references/type.method/`.

This is the most distinctive reference in the set and the closest thing here to genuinely
anti-slop design: the letterform **is** the interface. Open those screenshots and study them.

Ground `#2B313F` navy, ink `#F9FAFB`, single `#3B82F6` accent. `Archivo Black` for enormous
letterforms that encode region boundaries, `JetBrains Mono` for timecodes.

Layout: one enormous centred timeline where the selection is expressed as **oversized letterform
spacing**, not as a coloured bar. Region handles are draggable glyph-weight changes, not
generic grabber icons.

**Motion — exactly one authored moment:** the playhead easing as it scrubs. Nothing else moves.

**Truth contract — the important one:** region `start`/`end` are in **seconds**, and the media
duration must come from real data (`getVideoInfo` for URLs, or a real `mediainfo` run for files).
**Never a guessed length, never `Math.random()`.** If the duration cannot be determined, say so
and disable the scrubber rather than inventing a timeline.

The backend applies regions through `api.trimArtifact(...)` for a workspace run, or the tool's
own params standalone. Show the real returned artifact names.

---

## 2. `audio_processor` — Audio Extractor & Processor

Brief **#4**. Reference: **`arc`** (`design-references/arc/`).

Warm cream `#FFFCEC` ground, black ink. `Bricolage Grotesque` display at 32px/700/-1.6px,
`DM Sans` for controls. (These are the free substitutes for Arc's commercial Marlin/Exposure.)

Layout: a **real waveform** as the centre of gravity with a floating control rail. `wavesurfer.js`
and `@wavesurfer/react` are already dependencies — use them against a real `resolveUrl` URL.
**Never fake peaks.**

**Signature:** format and sample-rate choices as tactile pill segments with generous radius.

**Truth contract:** on completion, hand the artifact to `onOpenAudioPlayer` so the existing
audio modal opens it. Surface every manifest param — read them, do not assume format/bitrate/
channels.

**Verify against a real run:** create a real fixture
(`ffmpeg -f lavfi -i sine=frequency=440:duration=2 /tmp/tone.wav`), convert it, and confirm a
real file came back — `ffprobe` it to prove the requested sample rate was honoured.

---

## 3. `transcriber` — Speech to Text

Brief **#3**. Reference: **`practicaltype`** (Butterick) — `design-references/practicaltype/`.

Book-like ground `#FBF7F0`, ink `#1A1A18`. `Newsreader` for the transcript body,
`Libre Franklin` for UI at small sizes. A single generous column at a true 65–75ch measure, the
source audio as a slim inline transport, cues as properly set paragraphs with hanging timestamps.

**Signature:** cue numbers set as **marginalia in the left margin**, like a critical edition.

**Truth contract — the important one:** render the **actual** `.srt` / `.vtt` / `.txt` artifact
contents fetched with `api.getArtifactContent(path)`. A pure tone has no speech and will
transcribe to something like `"."` — that is an honest result and you must show it as one.
**Never fabricate a transcript, and never ship placeholder prose.**

Build the cue list by parsing the real SRT/VTT. Every cue's timestamps must be the real ones.

---

## 4. `demucs` — AI Stem Separator

Brief **#8**. Reference: **`vam`** (`design-references/vam/`).

White ground, ink `#1D1E20`. `Newsreader` headings, `Libre Franklin` metadata at small sizes.
An archival ledger of the real returned artifacts, each with a play control.

**Signature:** a catalogue-caption treatment per stem.

**Truth contract — this is the one agents get wrong most often:** `execute()` returns a **single
`stems.zip`** containing whatever the CLI wrote. It does **not** return four separate stem
artifacts. So:

- Show the zip as a real download, and say the separated stems live inside it.
- **Do not build a four-lane mixer of stems the API never returned as separate artifacts.**
- If `demucs`/`torch` is not installed, surface the backend's real error. `torch` is ~2GB and is
  flagged `heavy` in the dependency manager — its install must require a distinct, deliberate
  confirm, never a single careless click.

---

## Report

Follow the shared preamble's report format, per tool. Include measured numbers and real run
responses. State plainly if `demucs`/`torch` is unavailable and show that your page handles the
real failure honestly.
