# Batch E Independent Sites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver four independent, redesigned Batch E sites with truthful workflows and the backend contracts they need.

**Architecture:** Keep each hero and workspace at its existing tool routes, with site-owned CSS, layout, and state. Implement the narrowly scoped backend contracts first, then work tool-by-tool in prompt order, committing each independently.

**Tech Stack:** React, TypeScript, Vite, existing API/hooks and `ToolForm`; FastAPI/Python; `node:test` and pytest; Batch E browser harness and computer-use browser.

**Spec:** `docs/superpowers/specs/2026-10-06-batch-e-independent-sites-design.md`

## Global Constraints

- Each tool is its own full-viewport hero/workspace site with a home affordance.
- No shared user-facing shell, workspace route, cross-tool theme, or copied old downloader styling.
- Keep each tool's own scoped CSS and task-specific workflow.
- Use real manifests and bind every parameter control to its exact key with `data-param-key`.
- Do not fabricate metadata, progress, status, takeaways, subtitle translations, or document diffs.
- Show errors once and preserve backend text; mark results stale after output-affecting changes.
- Keep the dependency gate pinned and show dependency data reported by the API.
- Respect `prefers-reduced-motion`; do not add simulated progress or decorative loops.
- Use no new external dependency absent a reviewed need.
- Run tests, `npm run verify`, actual fixture operations, and regular browser reviews as the batch prompt specifies.

## Review Focus

- Unknown download totals: show measured bytes/indeterminate progress without deriving a percentage; pin this in the downloader progress test.
- Invalid or missing subtitle artifacts: surface the retrieval/parse failure without showing an empty or fabricated cue pair; pin this in subtitle tests.
- Failed subtitle translation batches: distinguish a failure from a valid unchanged cue; pin this in translator backend tests.
- Empty summarizer output: state that no takeaways were returned and render no example content; pin this in the summarizer test.
- Edited text translation source: do not execute until the current edited buffer has a successful upload receipt/path; pin this in text translator tests.

---

## Plan set and execution order

Each linked plan produces an independently testable commit. Run the backend contract plan first
because the sites depend on byte events, key resolution, explicit subtitle failures, and text
artifact retrieval. Then build and commit one site at a time in prompt order.

1. [Backend contracts](2026-10-06-batch-e-backend-contracts.md)
2. [Downloader site](2026-10-06-batch-e-downloader-site.md)
3. [Summarizer site](2026-10-06-batch-e-summarizer-site.md)
4. [Subtitle translator site](2026-10-06-batch-e-subtitle-site.md)
5. [Text translator site](2026-10-06-batch-e-text-translator-site.md)

The plans share no visual components. They may use existing common API/hooks/forms only where
those contracts already fit. Do not start a later site's implementation before its predecessor
has passed its test cycle and commit.

## Whole-batch review

- Review all eight hero/workspace states in the dedicated Batch E browser; repeat workspace
  reviews at mobile width and regular checkpoints while building.
- Confirm no global CSS leakage, shared shell chrome, horizontal overflow, missing manifest
  controls, or stale/fabricated result surfaces.
- Re-run `cd frontend && npm run verify` after the final site and record the exact output.
- Review backend and frontend git status and commits; leave unrelated pre-existing edits
  untouched unless they are explicitly incorporated into a site plan.

