# Batch E Summarizer Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an independent annotated-reading site for the real summarizer tool.

**Architecture:** Add a lazy-registered site with its own hero, workspace, scoped CSS, manifest-driven settings, and artifact-backed result view. Reuse execution/upload/dependency primitives without a shared shell.

**Tech Stack:** React, TypeScript, Vite, `useToolExecute`, `useToolDeps`, `api`, `ToolForm`, node:test, browser-harness.

**Spec:** `docs/superpowers/specs/2026-10-06-batch-e-independent-sites-design.md`

## Global Constraints

- Use paper `#FBF7F0`, ink `#1A1A18`, Newsreader reading type, Libre Franklin controls.
- Render real takeaways/count only; no client-side summary or example result.
- Surface `text`, `input_path`, `max_bullets`, and `format` as exact manifest controls.
- Keep dependency gate pinned and errors singular/actionable.

## Review Focus

- Empty takeaways render explicit empty result without fabricated list entries.
- Text and uploaded-path input modes both bind the actual manifest fields.
- Output becomes stale when a relevant setting changes after a run.
- Long source and long takeaway strings wrap without clipping at mobile width.
- Upload/execute error does not clear entered source.

---

### Task 1: Site registration, hero, and workflow tests

**Files:** Create `frontend/src/sites/summarizer/site.ts`, `SummarizerSite.tsx`, `SummarizerHero.tsx`, `SummarizerWorkspace.tsx`, `summarizer.css`; test `frontend/src/tests/summarizerSite.test.tsx` and a manifest fixture under `frontend/src/tests/fixtures/`.

- [ ] Add static-render tests for two hero actions, no platform chrome, all four manifest keys with `data-param-key`, and empty takeaways.
- [ ] Run `cd frontend && npm test`; confirm the new assertions fail before implementation.
- [ ] Build hero and workspace with own scoped classes; load actual manifest; provide source text/file upload, compact output controls, execute, and actual numbered takeaway column.
- [ ] Implement stale result handling, accessible errors, drag/drop and applicable paste behavior without losing the current output.
- [ ] Run `cd frontend && npm run verify`; commit the site files and tests.

### Task 2: Live browser and real fixture review

**Files:** Create captures under `docs/research/batch-E/summarizer/`.

- [ ] Review both routes at 1440×900 and 390×844; check 768×1024 if both columns remain visible. Inspect type, wrapping, contrast, overflow, and pinned Install control.
- [ ] Execute with a small real text fixture; record actual result and limitations (the backend's extraction strategy is not to be described as an LLM unless the run proves it).
- [ ] Fix visual/workflow issues, rerun verification, and commit fixes separately.
