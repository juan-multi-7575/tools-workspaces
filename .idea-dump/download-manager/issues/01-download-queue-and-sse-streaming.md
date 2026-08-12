# 01 — Download Queue & SSE Streaming

**What to build:** The backend queueing mechanism limiting concurrent downloads to 2, streaming real-time download progress via Server-Sent Events (SSE), and the corresponding frontend progress UI component displaying active items.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Implement `DownloadManager` class in backend to manage queues and concurrent task limits (2)
- [ ] Implement `GET /api/download/stream/{task_id}` SSE endpoint
- [ ] Create `DownloadManager.jsx` component to subscribe to SSE and render active downloads
