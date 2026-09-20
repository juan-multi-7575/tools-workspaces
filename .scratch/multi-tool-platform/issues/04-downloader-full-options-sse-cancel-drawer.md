# 04 — Downloader: full options, SSE progress, cancel, drawer

**What to build:** The yt-dlp downloader tool exposes near-all of yt-dlp's options through grouped sections, search, presets, and a raw-args passthrough. Downloads stream live SSE progress (percent/speed/ETA), can be cancelled with partial-file cleanup, run through a user-configurable queue, and are surfaced in a global download-manager drawer.

**Blocked by:** 02 — Audio processor tool end-to-end

**Status:** resolved

- [x] A user downloads media using grouped option sections, search, preset chips, and a raw-yt-dlp-args field — the raw args are validated and passed through
- [x] A user sees live percent/speed/ETA progress streamed while a download runs
- [x] A user cancels an in-flight download and partial files are removed
- [x] The queue limit (max concurrent downloads) is user-configurable, not hardcoded
- [x] A global download-manager drawer shows the queue, per-item progress, history, and cancel/retry actions across all download-triggering tools
- [x] **Testing:** API-level tests assert option passthrough and raw-args validation, SSE events carry progress before a terminal state, cancel marks the task cancelled and removes partial files, and the concurrency limit is honored
