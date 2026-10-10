# Downloader workspace structure research

Date: 2026-10-06

## Research question

How can the downloader make the first successful save obvious while preserving yt-dlp's larger control surface and an honest live queue?

## Live computer-use observations

- **Stacher** — The public page's current screenshot shows the desktop product organized around one URL entry strip, with a compact toolbar and a separate work/list region. The single high-salience entry action lowers the cost of starting; advanced controls belong in secondary navigation. The site describes Pro Mode, settings, configurations, subscriptions, and log viewer as separate advanced surfaces rather than the default task.
  - https://www.stacher.io/
- **JDownloader / LinkGrabber** — The live public homepage is visibly dated and was not treated as a design model. The official LinkGrabber help explains a staging step: links are collected, inspected/selected, then passed to Downloads. That makes selection and active downloading distinct states. It can support playlists, but multiple entry methods and context-menu options add complexity.
  - https://support.jdownloader.org/en/knowledgebase/article/linkgrabber-how-to-add-links
  - https://jdownloader.org/knowledge/wiki/glossary/linkgrabber
- **Cobalt** — Computer-use opened the live page. Behind its Cloudflare Turnstile interstitial, the visible composition has one URL field, a small set of output intents (auto/audio/mute), and a separate queue affordance. The interstitial was not bypassed. This supports one clear first task and a distinct task-tracking view; it does not support copying its exact interface.
  - https://cobalt.tools/
- **CloudConvert** — The live homepage shows an explicit source-to-destination transformation, then a file selection zone. The user sees what will happen before choosing a file. In this downloader, the equivalent is showing media identity before asking which output they want.
  - https://cloudconvert.com/
- **WeTransfer** — The live homepage did not finish rendering in the computer-use session. The official help page documents a simple sequence: add files, choose transfer mode, then send; optional title/message details stay secondary. Only the documented flow is used as evidence.
  - https://wetransfer.com/help-center/how-to/send-a-transfer
- **Bandcamp** — Prior browser research showed the item itself (artist/album/track identity and context) leads the page. The useful transfer is to foreground verified media identity during review, rather than making a first-time user parse format names first.
  - https://bandcamp.com/

## Implemented design decision

The new download path is a **one-stage-at-a-time workflow** inside an independent Downloader site:

1. **Inspect** — one URL field and one Inspect media action. A successful response moves to a separate screen; empty workspaces start here.
2. **Review** — show the real title, thumbnail, publisher, duration, provider, and URL returned by the probe. Back to URL preserves the source and allows edits; continuing advances to output selection.
3. **Choose output** — ask in plain language whether the saved file should contain video and audio, audio only, or video only. Show only common settings for that choice, with the remaining manifest controls searchable inside purpose-grouped Advanced settings.
4. **Downloads** — a distinct activity screen for actual task states, byte progress, cancellation/removal and returned artifact links. Queue concurrency is managed here.
5. **Utilities** — keep the four hosted helper tools out of the primary download path.

The shared manifest form adapter is intentionally given a non-canonical manifest identifier by `DownloaderParameterControls`, so it falls back to `DynamicForm` and cannot render the legacy DownloaderForm (which contains its own URL and mode controls). Downloader-scoped CSS tokens recolor that generic renderer to the new mist-and-teal palette. This retains the manifest schema bindings while replacing both the former structure and the inherited cream/brown appearance.

## Synthesis and original ideation

The reference products informed pacing, not a copied visual system: one obvious intake like Stacher/Cobalt, an explicit inspect-and-select transition like JDownloader's LinkGrabber, and a visible source-to-result decision like CloudConvert. Bandcamp's identity-forward media presentation informed the review screen. The resulting product-specific pattern is **inspect → verify → choose → track**: a single focused task per screen with a persistent site navigation for New download, Downloads, and Utilities. The result uses an editorial catalog header, quiet mist background, teal action color, plain-language options, and a sticky installation gate. This deliberately gives a first-time user less simultaneous information while leaving the full manifest power surface available on demand.

## Live implementation review

- Successful computer-use probe: `https://www.youtube.com/watch?v=aqz-KE-bpKQ` returned “Big Buck Bunny 60fps 4K - Official Blender Foundation Short Film”, publisher `Blender`, provider `YouTube`, and a real thumbnail. Review displays those backend values.
- 390×844: inspect and review stages have no horizontal overflow; output remains operable with a sticky add action and install gate.
- 768×1024: output controls use the available width and remain in a two-column common-settings layout; no horizontal overflow.
- Enqueue/download was not run because the backend advertises two missing dependencies (`conda.media`, 660,000,000-byte catalog estimate). The install gate is live and blocks the download path until installed; no download byte event was claimed.
