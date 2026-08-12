# 08 — Settings & dependency updater

**What to build:** A dedicated Settings area, separate from per-tool config, where a user configures the download queue, adds transcriber provider API keys, and keeps pinned dependencies current — yt-dlp first, checked on start and on demand, upgraded only with explicit approval.

**Blocked by:** 04 — Downloader: full options, SSE progress, cancel, drawer; 06 — Transcriber with provider registry

**Status:** resolved

- [ ] A user configures download-queue settings (e.g. max concurrent downloads) in Settings and the downloader honors them
- [ ] A user adds/removes cloud provider API keys in Settings; keys persist locally and are never committed
- [ ] On start the app reports which pinned dependencies have newer versions available
- [ ] A user triggers a dependency check on demand and approves an upgrade, which then runs
- [ ] Upgrades never run without explicit user approval
- [ ] **Testing:** API-level tests assert settings persist across a restart, provider keys are stored locally and absent from repo-visible files, and the dependency check/update flow works against a mocked package index with the approval gate enforced
