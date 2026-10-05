# BATCH E — media.download.yt-dlp, summarizer, subtitle.translate.srt, text.translate.llm

Read `SHARED-PREAMBLE.md` in this directory first and follow it exactly. Then build **four**
sites. Work one tool at a time and commit each before starting the next.

This is the **hardest batch**: the downloader has ~26 parameters, a live queue and four hosted
sub-tools. Budget your effort accordingly.

Your reference images are in `tools-workspaces/docs/research/design-references/<name>/`.

---

## 1. `media.download.yt-dlp` — Video & Media Downloader

Brief **#1**. Reference: **`bandcamp`** — `design-references/bandcamp/`.

Pale cyan-grey `#ECF3F4` ground, `#222` ink, hairline `rgba(0,0,0,.08)` rules. System grotesque
only — **deliberately no webfont**. 13px/1.45 body, tabular numerals on every size. Left intake
column, right live queue table, dense rows.

**Signature:** each queued task is a catalogue row with a real byte-progress rule beneath it.

**Truth contract — the important one:** this tool's real progress source is the **download
queue**, not the execute endpoint. Use `api.enqueueDownload`, `api.listDownloads`,
`api.downloadStreamUrl` (SSE), `api.cancelDownload`, `api.removeDownload`, and
`api.getDownloadSettings` / `api.updateDownloadSettings`.

**Never synthesise a percentage.** Render only the status and byte fields the payload actually
sends. If no percentage is present, show bytes downloaded and total — not a made-up percentage.

Also provide a metadata probe: `api.getVideoInfo(url)` returns real `title`, `author_name`,
`duration`, `thumbnail_url` — or nulls. Render only what came back; when they are null say
"metadata unavailable", never invent a title.

**Parameter coverage:** the schema has ~26 keys. `DynamicForm` (in `src/components/common/`)
renders them all and emits `data-param-key`, and `DownloaderForm` exists but is tuned to the old
cream shell. **Compute the complement** of keys you hand-build and render the rest through
`<ToolForm>` from `src/lib/toolForms.tsx`, so nothing is dropped. Report the total key count and
your coverage split. Note `download_mode` is a special control the manifest declares.

**Four hosted helpers — do NOT give these their own pages.** They are rendered as sections inside
this site:
`media.download.resolve` · `media.download.format_select` · `media.subtitle.fetch` · `media.thumbnail.get`

Each gets its own real execute via `useToolExecute(<helperId>)` and its own form built from
`api.getTool(<helperId>)`'s schema. `registry.ts` already marks these `hosted` — leave it alone.

**Size honesty:** this tool needs `conda.media` (ffmpeg), which is genuinely **~663 MB** — the
largest single dep, because conda-forge's ffmpeg ships av1/vp9/dav1d/x264/x265. Show the real
number the API returns. Do not round it down to something plausible.

---

## 2. `summarizer` — AI Document & Transcript Summarizer

Brief **#16**. Reference: **`practicaltype`** (Butterick) — `design-references/practicaltype/`.

Ground `#FBF7F0`, ink `#1A1A18`. `Newsreader` throughout for reading comfort, `Libre Franklin`
for controls only. Source text as a proper column beside a numbered key-points column.

**Signature:** takeaways set as numbered marginalia.

**Truth contract — the important one:** render the **real** `data.takeaways` array as a numbered
column, with the real `data.bullet_count`. **If the backend returns no takeaways, say so plainly.
Never write a placeholder summary, and never summarise client-side** — that would be inventing
the tool's entire output.

Surface every manifest param: `text` (textarea), `input_path`, `max_bullets`, `format`
(`markdown`|`plain`).

---

## 3. `subtitle.translate.srt` — Subtitle & Document Translator

Brief **#17**. Reference: **`notion`** — `design-references/notion/`.

White ground, `rgba(0,0,0,.95)` ink. `Inter` at display scale for headings, `Source Serif 4` for
cue text.

Layout: synced dual-pane cue comparison — original left, translated right, index-matched.

**Signature:** changed cues marked **only where the strings actually differ**.

**Truth contract — the important one:** build both panes from the **real** `.srt` / `.vtt`
artifact contents fetched with `api.getArtifactContent(path)`. Parse the real cues; every
timestamp must be the real one, on both sides, and index alignment must be genuine.

The manifest is `parameters_schema=SrtTranslatorTool.manifest.parameters_schema`
(`backend/app/tools/translator_tool.py:48`) — read the actual inherited keys (`input_path`,
`target_lang`, `source_lang`, `provider`, `model`, `batch_size`) rather than assuming. `TranslatorForm`
exists but is tuned to the old shell; compute the complement of what you hand-build and render the
rest through `<ToolForm>`.

---

## 4. `text.translate.llm` — LLM Document & Text Translator

Brief **#18**. Reference: **`eyemag`** (Eye Magazine) — `design-references/eyemag/`.

White ground, black ink, multi-column magazine grid. `Source Serif 4` body at a true 65–75ch
measure, `Libre Franklin` chrome.

**Signature:** the diff set as a marked-up galley, red/blue paired.

**Truth contract — the one agents get wrong here:** this tool **returns no translated text in
`data`**. It returns only `{ target_lang, provider, model, artifacts_count }`. So the diff must
be computed from **two real artifact reads** — the submitted `input_path` and the returned
artifact — never from an assumption, and never by translating in the browser.

Also note this tool has **no `text` param**, only `input_path`. So an editable source pane must
round-trip through the real `api.uploadFile` endpoint to produce a genuine `input_path` — not a
control that silently does nothing.

Surface `target_lang` and `source_lang` enums, a provider/model picker fed by
`api.getDetectedModelProviders()` and `api.getProviderModels(provider, apiKey)`, and an inline
key field wired to `api.saveKey`.

---

## Report

Follow the shared preamble's report format, per tool. Include:
- for the downloader: the **total manifest key count** and your coverage split
- measured numbers and real run responses
- a plain statement of anything you could not do truthfully — especially if a live download, an
  LLM call, or a queue stream could not be exercised for real
