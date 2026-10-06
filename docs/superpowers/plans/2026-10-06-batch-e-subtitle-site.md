# Batch E Subtitle Translator Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an independent, cue-aligned subtitle translation site from actual subtitle artifacts.

**Architecture:** Add a site-owned hero/workspace and cue parser/view. Reuse translator provider controls and APIs where compatible; compare only real source and translated cues.

**Tech Stack:** React, TypeScript, Vite, `api`, existing provider model APIs, `ToolForm`, node:test, browser-harness.

**Spec:** `docs/superpowers/specs/2026-10-06-batch-e-independent-sites-design.md`

## Global Constraints

- Use white, near-black, Inter display, Source Serif 4 cue text.
- Read SRT/VTT text from the actual artifact endpoint.
- Preserve real cue indices/timestamps; changed state is strict string inequality.
- Surface six actual manifest parameters and pinned dependency/error UI.

## Review Focus

- SRT and VTT timestamps/indexes parse and display as returned.
- Malformed input shows a parse error rather than an empty cue list.
- Missing translation cues or failed batches do not look like a valid unchanged translation.
- No cues/empty files produce a clear empty state.
- Narrow screens preserve the selected cue number/time when toggling panes.

---

### Task 1: Site, cue parser, and tests

**Files:** Create `frontend/src/sites/subtitle-translator/site.ts`, `SubtitleTranslatorSite.tsx`, `SubtitleTranslatorHero.tsx`, `SubtitleTranslatorWorkspace.tsx`, `subtitle-translator.css`, and a focused `subtitleCues.ts`; test `frontend/src/tests/subtitleTranslatorSite.test.tsx` plus fixture files under `frontend/src/tests/fixtures/`.

- [ ] Add parser tests for multiline SRT, VTT cue identifiers, real timestamps, malformed blocks, and missing/extra translated cues. Preserve source IDs when present; for VTT cues without IDs use their one-based display order and do not represent it as a source timestamp/identifier.
- [ ] Add static-render tests for the hero actions and all six `data-param-key` controls.
- [ ] Run `cd frontend && npm test`; confirm the new assertions fail before implementation.
- [ ] Implement manifest-bound upload/provider/language controls, a masked key field wired to `api.saveKey`, and execution using the actual tool ID.
- [ ] Fetch real input/output artifact content and render paired panes; desktop uses synchronized two columns; mobile switches source/translation while retaining selected cue context.
- [ ] Mark changed cues only by actual text inequality; render per-batch backend failures distinctly.
- [ ] Run `cd frontend && npm run verify`; commit site and tests.

### Task 2: Visual and real-operation review

**Files:** Create captures under `docs/research/batch-E/subtitle.translate.srt/`.

- [ ] Review hero/workspace at 1440×900 and 390×844, plus 768×1024; inspect overflow, cue alignment, type, contrast, and pinned Install control.
- [ ] Run a real small fixture translation if a usable saved/provider key is available; record actual artifact and result. Otherwise record the exact unavailable condition.
- [ ] Fix issues, re-run verification, and commit review fixes separately.
