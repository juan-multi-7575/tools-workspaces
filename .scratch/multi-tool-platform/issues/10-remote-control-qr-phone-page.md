# 10 — Remote control (QR + phone page)

**What to build:** A user scans a QR code shown on the downloader tool page and controls downloads from a phone on the same network: the phone page exposes the same full downloader options and live SSE progress, and remote actions are gated behind a per-boot token.

**Blocked by:** 04 — Downloader: full options, SSE progress, cancel, drawer

**Status:** ready-for-agent

- [ ] The downloader page shows a QR code and plain URL for the remote page
- [ ] Scanning the QR opens a minimal mobile page where the user pastes a URL and chooses download options
- [ ] The download runs on the host and the phone shows live SSE progress
- [ ] Remote actions without a valid token are rejected
- [ ] The token is regenerated on each boot
- [ ] **Testing:** API-level tests assert the token gate (non-token requests rejected), the enqueue path with a stubbed manager, and the QR/info endpoint shape
