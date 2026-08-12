Status: resolved

# 04 — Root CLI unification

**What to build:** Replace `yt-dlp.py` root CLI to use the shared backend downloader module instead of duplicating yt-dlp logic.

**Blocked by:** 01 — Shared downloader module

- [ ] Import `download_with_options` from `tts_dataset_app.backend.app.downloader` (or equivalent path) instead of calling `yt_dlp` directly
- [ ] CLI exposes: `--audio-only`, `--format`, `--playlist`, `--subtitles`, `--output-template`, `--audio-quality`
- [ ] CLI prints live progress (percent/speed/ETA) and respects Ctrl-C for clean abort with partial-file cleanup
- [ ] CLI supports multiple URLs in one run
- [ ] **Testing:** smoke-test CLI invocation with mocked downloader (monkeypatch download_with_options)

## Answer

Implemented in docs/superpowers/plans/2026-08-07-codebase-reorganization.md Task 4:
root `cli.py` (subcommands `download | trim | convert`) delegates to
`app.tools.downloader` / `app.tools.audio_processor`; the legacy root scripts
(`yt-dlp.py`, `audio-converter.py`, `audio-trimmer.py`, `test_dl.py`) were
removed. `download` exposes `--audio-only`, `--format`, `--playlist`,
`--subtitles`, `--output-template`, `--audio-quality`, prints live
percent/speed/ETA, and aborts cleanly on Ctrl-C.
