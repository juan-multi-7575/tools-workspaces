# 03 — Download Manager UI Drawer & Media Uploader Integration

**What to build:** An integrated end-to-end user workflow where initiating downloads from the MediaUploader / Tools workspace seamlessly feeds into the persistent Download Manager drawer with live statuses, progress bars, history, and actions.

**Blocked by:** 02 — Download Cancellation & Partial File Cleanup

**Status:** ready-for-agent

- [ ] Integrate `DownloadManager.jsx` into the main application layout (`App.jsx`)
- [ ] Update `MediaUploader.jsx` to enqueue downloads via the manager instead of blocking UI operations
- [ ] Verify complete download lifecycle: queueing, real-time SSE progress updates, cancellation with cleanup, and completion
