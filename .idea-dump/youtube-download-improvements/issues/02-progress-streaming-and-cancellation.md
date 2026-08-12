Status: ready-for-agent

# 02 — Progress streaming + per-task cancellation

**What to build:** Wire the new progress hooks from `downloader.py` into `DownloadManager` so SSE emits live percent/ETA; make cancellation per-task instead of using the shared `cancel_event`.

**Blocked by:** 01 — Shared downloader module

- [ ] `DownloadManager.tasks[task_id]` stores its own `asyncio.Event` as `cancel_event`
- [ ] `cancel_task(task_id)` sets the per-task event (not the shared one)
- [ ] Per-task `progress_queue` (asyncio.Queue, maxsize=50) is created at enqueue time
- [ ] Job runner (`_run_job`) passes `progress_queue` + `cancel_event` to downloaders
- [ ] A background coroutine in the job runner drains `progress_queue` and updates `task["progress"]`, `task["percent"]`, `task["eta"]`, `task["speed"]`
- [ ] `GET /api/download/stream/{task_id}` SSE emits real-time progress before "completed"/"failed"/"cancelled"
- [ ] On cancel/failure, `DownloadManager` cleans up partial `.part` files in the download dir
- [ ] **Testing:** assert SSE stream carries percent > 0 before completion; assert cancel sets task to "cancelled"; assert partial files cleaned
