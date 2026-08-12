# yt-dlp download refinements

Status: resolved

## Request

Refine Tools-section yt-dlp downloads: format & codec control, robustness
(retries/timeouts/throttle/resume), playlist & subtitle selection, and
embedding toggles — exposed in both the web UI and the CLI. Dataset ingestion
profile stays locked (audio-only WAV). Cookies/auth skipped (public videos
only).

## Answer

Implemented via `docs/superpowers/plans/2026-08-09-yt-dlp-download-refinements.md`:

- **Backend**: `ToolsDownloadRequest.options` is now a typed, validated
  `DownloadOptions` model (`extra="forbid"` — unknown keys 422 instead of
  being silently ignored). `downloader.py` gained `FORMAT_PRESETS`
  (best/1080p/h264/vp9/av1/audio with fallback chains) and passes through
  retries, fragment_retries, socket_timeout, limit_rate,
  concurrent_fragment_downloads, overwrites, playlist_items, merge format,
  subtitles (langs/format/auto), and embed subs/thumbnail/metadata. Defaults
  mirror yt-dlp's own, so behavior is unchanged when options are omitted.
- **Web UI**: Tools page download form has a collapsible "advanced options"
  section with all knobs.
- **CLI**: `cli.py download` mirrors the options as flags.
- **Tests**: preset mapping, ydl_opts passthrough, model/API validation, CLI
  flag mapping (91 passing).
