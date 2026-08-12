# 02 — Download Cancellation & Partial File Cleanup

**What to build:** The ability to cancel active downloads from the UI, stopping the underlying yt-dlp execution and automatically removing any partial media files left behind on disk.

**Blocked by:** 01 — Download Queue & SSE Streaming

**Status:** ready-for-agent

- [ ] Implement `POST /api/download/cancel/{task_id}` endpoint in backend
- [ ] Update downloader logic to listen for cancellation events and clean up partial files from `media/` directory
- [ ] Add cancel button and interaction handler in the frontend download list
