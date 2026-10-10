# Batch E Downloader Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the independent catalogue-style downloader hero and workspace with truthful queue events and complete manifest coverage.

**Architecture:** Keep `DownloaderSite` as this tool's route owner and organize its workspace into distinct New download, Downloads, and Utilities views. The New download view guides users through identify → decide → track without showing the queue beside a long form. Use existing downloader APIs and helper manifests; no shared visual shell.

**Tech Stack:** React, TypeScript, Vite, existing `api`, `ToolForm`, downloader hooks, CSS, node:test, browser-harness.

**Spec:** `docs/superpowers/specs/2026-10-06-batch-e-independent-sites-design.md`

## Global Constraints

- Use cyan-gray, ink, hairlines, teal, system sans, 13px/1.45, tabular numerals; no webfont.
- The queue is authoritative and uses the queue APIs/SSE; do not synthesize progress.
- Probe content is only returned `getVideoInfo` data.
- All manifest parameters and all four hosted helper forms remain available.
- Keep the dependency gate pinned and show the API's measured media dependency size.

## Review Focus

- Unknown byte totals render an indeterminate rule and actual known bytes, never a percent.
- Queue SSE reconnect/list refresh leaves terminal state authoritative.
- A metadata probe with null fields does not invent a title, author, duration, or thumbnail.
- Changing format settings after a completed item does not mislabel that artifact as current.
- Mobile intake/options/queue remain navigable without horizontal page overflow.

---

### Task 1: Lock queue progress rendering

**Files:** Modify `frontend/src/sites/downloader/DownloaderSite.tsx`; test `frontend/src/tests/downloaderSite.test.tsx`.

- [ ] Add tests for real byte counts, unknown total, and absent percentage.
- [ ] Run `cd frontend && npm test`; confirm the new assertions fail before implementation.
- [ ] Render an indeterminate track unless a backend percentage is present; render actual byte text whenever fields are present. Never convert byte counts to percent.
- [ ] Run `cd frontend && npm test`; commit the component/test.

### Task 2: Rebuild the downloader workflow presentation

**Files:** Modify `frontend/src/sites/downloader/DownloaderSite.tsx`, `frontend/src/sites/downloader/downloader.css`, and `frontend/src/tests/downloaderSite.test.tsx`.

- [ ] Add/adjust tests for exactly two hero entry paths; a guided identify → decide → track workflow; home route; 26 manifest keys (1 URL hand-built + 25 ToolForm-bound); separate New download, Downloads, and Utilities views; and four hosted helper forms.
- [ ] Replace the old workspace composition as well as its brown/cream styling with the approved cyan-gray catalogue system; do not import previous tool CSS or shared theme files.
- [ ] Make the hero's URL path carry the submitted URL and real probe result into the review step; keep the empty-workspace path independent. Keep default download choices plain-language and contextual; keep all 25 manifest-bound controls accessible in collapsed, searchable, purpose-grouped Advanced options.
- [ ] Track downloads in a separate full-width view grouped by authoritative backend status; keep settings, errors, remove/cancel and real artifact download actions clearly labeled; mark displayed results stale where applicable.
- [ ] Place the four helper forms in a separate Utilities view. Do not show the long manifest, queue, and URL intake simultaneously.
- [ ] Run `cd frontend && npm run verify`; commit component, CSS, and tests.

### Task 3: Live visual and real-operation review

**Files:** Create review captures under `docs/research/batch-E/media.download.yt-dlp/`.

- [ ] Use the Batch E dedicated browser at 1440×900, 768×1024, and 390×844 for hero and workspace; inspect screenshots, overflow, pinned Install control, and contrast.
- [ ] Exercise a truthful probe and queue path if a reachable media URL and yt-dlp dependency are available. Record actual response; if unavailable, record exact blocker.
- [ ] Fix any visual defects, rerun verification, and commit review fixes separately.
