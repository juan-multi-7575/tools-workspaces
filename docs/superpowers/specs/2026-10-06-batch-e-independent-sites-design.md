# Batch E Independent Tool Sites — Design Spec

Date: 2026-10-06  
Status: approved in conversation for spec authoring; awaiting review of this written spec.

## Intent and success

Redesign all four Batch E tools as independent, full-viewport sites with distinct visual
systems and task-specific workflows. Preserve the two-state hero/workspace route pattern and
the return-home affordance. Keep the existing workspaces canvas feature separate from each
tool's own working page. Do not reuse the current downloader's old cream/brown styling or
create a common user-facing shell.

The prompt's real-data contracts remain binding: every surfaced parameter is bound to its
manifest key; status, metadata, progress, takeaways, cues, and translations come from the
backend or actual artifact contents; errors remain visible; and the dependency gate stays
pinned and reports the API's actual size. Each site must work at desktop and mobile widths.

## Design choices

Three architecture choices were considered:

1. **One common tool shell.** Rejected because it would flatten the queue, reading, cue, and
   document-proof workflows and reintroduce the uniform look the user asked to replace.
2. **Four entirely duplicated implementations.** Rejected because file uploads, manifest
   controls, provider setup, artifact reads, and error states would drift unnecessarily.
3. **Four independent sites with thin technical primitives.** Selected. Every tool owns its
   page composition, visual tokens, routes, and state journey. Existing API/hooks/components
   may be reused where they fit; any shared helper remains invisible to users and must not
   impose a common layout or theme. Add no shared workspace route or visual shell.

The prompt's four named sites are starting references, not templates. Additional research and
design judgment inform the interactions: catalogue metadata and queue rhythm for downloads,
reading marginalia for summaries, cue navigation for subtitles, and file-first translation
with a marked-up proof for documents. No external brand identity is copied.

## Per-site experience

### 1. `media.download.yt-dlp` — catalogue dispatch desk

- Visual system: `#ECF3F4` ground, `#222` ink, near-white surfaces, hairline rules, one teal
  accent (`#0a7c7c`), system grotesque only, 13px/1.45 body, tabular numerals.
- Workspace: asymmetrical URL intake and queue. A real probe result appears as a catalogue
  entry. A compact download-mode selector precedes a grouped parameter ledger. The queue uses
  dense catalogue rows with returned metadata, actual state, and a byte-progress rule.
- Workflow: probe URL → configure → enqueue → monitor, cancel, remove, or download.
- Preserve the four hosted helpers as sections inside this site, each with its own manifest
  form and real execution. They do not get independent pages.
- Render all downloader manifest parameters. Keep the special `download_mode` control and
  compute/report the exact hand-built versus `<ToolForm>` coverage split.
- Queue state must use `enqueueDownload`, `listDownloads`, `downloadStreamUrl` (SSE),
  `cancelDownload`, `removeDownload`, and the download-settings APIs. Probe metadata must come
  from `getVideoInfo`; null values remain unavailable rather than filled with invented copy.
- The dependency surface displays the API's measured `conda.media` size (currently
  662,987,855 bytes; query the API during implementation rather than hardcoding this value).

### 2. `summarizer` — annotated reading desk

- Visual system: `#FBF7F0` paper, `#1A1A18` ink, Newsreader for reading, Libre Franklin for
  controls.
- Workspace: source text in a comfortable reading column; the real numbered takeaways form
  an aligned outer column/marginalia. Controls for maximum bullets and output format remain
  compact and visible.
- Workflow: enter or upload source → choose output settings → run → read takeaways and inspect
  the returned artifact.
- Surface the real `text`, `input_path`, `max_bullets`, and `format` manifest parameters.
  Render actual `data.takeaways` and `data.bullet_count`; if absent, state that no takeaways
  were returned. Never create a browser-side summary or placeholder result.

### 3. `subtitle.translate.srt` — cue ledger

- Visual system: white ground, `rgba(0,0,0,.95)` ink, Inter display headings, Source Serif 4
  cue text.
- Workspace: original and translated panes align by actual cue index, each with the actual
  timestamp. Mark changed cues only when the source and translated strings differ. On narrow
  screens, show a single cue at a time with a source/translation switch while retaining index
  and timestamp context.
- Workflow: upload/select subtitle → configure language/provider/model/batch size → translate
  → inspect aligned cue pairs and navigate to a cue.
- Build the view from actual `.srt`/`.vtt` content retrieved via `api.getArtifactContent`.
  Parse actual cues; do not synthesize timestamps or align by guessed content. Surface all
  inherited manifest keys: `input_path`, `target_lang`, `source_lang`, `provider`, `model`,
  and `batch_size`.
- If translation batches fail, show that failure distinctly from a legitimate unchanged cue.

### 4. `text.translate.llm` — marked-up translation galley

- Visual system: white ground, black ink, multi-column editorial composition, Source Serif 4
  text at a 65–75ch measure, Libre Franklin controls. Red and blue identify only actual
  changed spans.
- Workspace: an editable source buffer must be explicitly uploaded before translation; show
  the real returned source path/receipt. After execution, retrieve both the submitted source
  and translated output artifacts and render a sentence-aligned comparison. No client-side
  translation or fabricated diff.
- Workflow: edit source → upload/replace → choose language/provider/model → translate → review
  the real artifact pair.
- Surface all actual manifest parameters: `input_path`, `target_lang`, `source_lang`,
  `provider`, and `model`. Provider/model choices use detected providers and provider models;
  inline key entry calls `api.saveKey`.

## Architecture and API contracts

- Keep `/t/:toolId` and `/t/:toolId/workspace` as the hero and working page for each tool.
  Do not route tool work into `/workspaces/:id` and do not change the canvas contract.
- Each site remains in its own `frontend/src/sites/<tool>/` directory with scoped classes and
  tool-owned styling. Only the normal per-site registration file outside that directory is
  allowed by the shared preamble. Do not edit shared app shell, route registry, `src/lib/`,
  or `src/hooks/` as part of frontend implementation unless a concrete existing API defect
  requires a separately reviewed narrow change.
- User explicitly authorized backend contract fixes for this redesign. Add only the following
  necessary changes:
  1. Include actual downloaded and total byte counts in downloader progress events, sourced
     from yt-dlp's real progress hook/event values. Unknown totals remain unknown; never derive
     an estimated percent in the UI.
  2. Resolve translator provider credentials from keys saved through the UI, for both
     translation tools. Preserve environment-key compatibility and document a deterministic
     precedence rule. Never expose secret values in responses or logs.
  3. Make subtitle batch/cue translation failures explicit when a failed LLM batch would
     otherwise fall back to original source text and report the overall tool as successful.
- Fix the artifact-content contract so frontend `api.getArtifactContent(path)` can retrieve
  real `.srt`/`.vtt` contents, without weakening existing JSON artifact behavior. Select the
  smallest backward-compatible change after inspecting callers.
- The UI may share existing low-level helpers for manifests, uploads, execution, dependencies,
  provider models/keys, and artifact access. Do not introduce a shared visual component system
  for these four designs.

## Workflow safeguards

- A failed run or upload has one visible error location and retains actionable backend text.
- Changing output-affecting settings after a result marks that result stale until rerun.
- Clearing or replacing input does not silently discard a returned artifact; any destructive
  action must have accurate labeling and preserve available output access.
- The largest obvious input target accepts drag/drop where the input type supports it; paste
  works for URLs/paths where applicable.
- Every factual claim in site copy is verified against a live API response or a real small
  fixture run. Do not add self-narrating honesty copy.
- Motion is restrained and functional: short state transitions and focused feedback only;
  respect `prefers-reduced-motion`. No looping decoration or fabricated progress animation.

## Verification and delivery

Implement and commit one tool at a time, in prompt order. Each tool gets its own explicit-path
commit; backend contract changes are committed separately with the relevant tests. For every
site:

- Add the required `node:test`/`renderToStaticMarkup` coverage for hero actions, every
  manifest-bound `data-param-key`, and absence of Tools Garage chrome.
- Run `npm run verify` and retain its actual output.
- Run a real small fixture/API operation and report the actual response. If an external model,
  downloader binary, live queue, or provider key is unavailable, identify the exact unverified
  behavior rather than simulating it.
- Review hero and workspace at 1440×900 and 390×844 (and 768×1024 for multi-column layouts)
  in Batch E's dedicated computer-use browser. Check horizontal overflow, pinned dependency
  control, contrast, responsive behavior, and visual hierarchy. Save and inspect screenshots.
- Revisit the running local UI regularly during implementation after meaningful workflow/layout
  changes, not only at the end.
- Per tool, report changed files, commit, research/reference divergence, viewport measurements,
  real run response, screenshot review, verification output, and limitations.

## Research references

Prompt references: [Bandcamp](https://bandcamp.com/), [Practical Typography](https://practicaltypography.com/),
[Notion](https://www.notion.com/), and [Eye Magazine](https://www.eyemagazine.com/).

Additional interaction research: [Readwise Reader annotation patterns](https://docs.readwise.io/reader/docs/faqs/highlights-tags-notes),
[Subtitle Edit cue navigation](https://subtitleedit.github.io/subtitleedit/features/main-window.html),
and [DeepL document translation](https://www.deepl.com/en/features/document-translation).
These inform interaction ergonomics only; their products, brand styling, and features are not
being copied.

## Scope exclusions

- No unified workspace or app-wide redesign.
- No new shared shell/theme, new service, or external product dependency unless later evidence
  proves one is necessary and the user reviews the scope change.
- No changes to other batches, the home catalog, Workspaces canvas, or unrelated backend
  behavior.
- No fake media metadata, percentages, takeaways, subtitle translations, or document diffs.
