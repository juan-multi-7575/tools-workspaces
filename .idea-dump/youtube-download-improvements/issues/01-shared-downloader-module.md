Status: ready-for-agent

# 01 — Shared downloader module with tools/dataset profiles

**What to build:** Refactor `downloader.py` into a single shared yt-dlp wrapper exposing `build_ydl_opts`, `download_with_options` (tools profile), and `download_source` (dataset profile). Both accept `progress_queue` and `cancel_event`.

**Blocked by:** None.

- [ ] `build_ydl_opts(url, profile="tools", **opts)` returns a validated ydl-opts dict
- [ ] `download_with_options` accepts `progress_queue` + `cancel_event`, emits real-time percent/speed/eta
- [ ] `download_source` (dataset profile) supports `audio_quality` option, emits progress, returns metadata (uploader, description, thumbnail_url, duration)
- [ ] `download_to_temp` delegates to `download_source` with temp outtmpl; playlist expansion handled upstream
- [ ] On cancel/failure, partial `.part` files cleaned from the output dir
- [ ] **Testing:** unit-test `build_ydl_opts` for both profiles; assert progress dict shape and cancel raises DownloadError
