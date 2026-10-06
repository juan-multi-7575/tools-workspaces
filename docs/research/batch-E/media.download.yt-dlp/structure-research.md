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

## Design decision

Replace the old simultaneous intake + 25-field form + queue composition with three distinct destinations:

1. **New download** — one URL field and an Inspect action. A successful inspect advances to a review state that contains only real returned metadata; an empty workspace begins here.
2. **Choose output** — show plain-language intent choices first, then the few common controls relevant to that intent. Keep remaining parameters in a searchable, purpose-grouped Advanced options disclosure; preserve each manifest binding and `data-param-key`.
3. **Downloads** — a separate full-width activity view grouped by actual queued/running, completed, and failed/cancelled states. Show backend-reported bytes/status and state-appropriate cancel, remove, retry (only if supported), and actual artifact links. Keep New download reachable.

Put all four hosted helpers in a separate **Utilities** destination so they do not compete with the downloader's primary path. Preserve queue settings in Downloads or a compact settings disclosure. Keep the dependency gate pinned to the viewport.

## Original synthesis

The interaction model is **identify → decide → track**. It borrows the useful pacing of media catalogues and file converters without copying a brand. It intentionally avoids a universal form-first dashboard: the user first confirms which media the URL resolves to, then chooses an understandable outcome, and only then sees queue management. The 25 advanced manifest controls remain available for power users but do not block the default path.
