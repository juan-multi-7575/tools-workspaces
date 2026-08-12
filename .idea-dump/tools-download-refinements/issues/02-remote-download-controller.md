# Remote download controller (QR + mobile)

Status: resolved

## Request

Control yt-dlp downloads from a phone on the same WiFi/hotspot: the Tools page
shows a QR code; scanning it opens a mobile page where the user pastes a video
URL; the download runs on the system (phone is only a controller), with live
progress on the phone. As part of the feature, introduce a strict per-tool
downloads organization.

## Answer

Implemented via `docs/superpowers/plans/2026-08-09-remote-download-controller.md`:

- **Downloads layout**: tools downloads moved under `downloads/` with one subdir
  per tool — `downloads/yt-dlp/` (new default outdir for Tools page, cli.py, and
  the phone) and `downloads/audio/` (trim/convert outputs, was root `tools/`).
  Dataset section keeps `media/`. `downloads/` added to .gitignore.
- **Backend** (`app/tools/remote.py`): LAN-IP detection (UDP-connect trick),
  per-boot random token (`app.state.remote_token`, regenerates each start),
  `GET /api/tools/remote/info` and `/api/tools/remote/qr` (SVG, qrcode lib),
  token-gated `POST /api/tools/remote/download` (enqueues into
  `downloads/yt-dlp/`), and a minimal mobile page at `GET /remote` with paste-
  URL + live SSE progress. Token checks use `hmac.compare_digest`.
- **Frontend**: `RemoteControl` section on the Tools page (QR image + plain URL
  + refresh).
- **Reachability**: `start.bat` and README manual-start bind uvicorn to
  `0.0.0.0:8000`; README documents the Windows firewall step and the
  token-regenerates-per-start caveat.
- **Tests**: 6 new (lan_ip, info shape, QR SVG, token gate, enqueue path with
  stubbed manager to avoid task pollution); conftest `client` fixture now runs
  the lifespan via context manager. 97 passing.
