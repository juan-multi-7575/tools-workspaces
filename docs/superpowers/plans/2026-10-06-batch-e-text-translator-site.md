# Batch E Text Translator Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an independent document translation site that compares the actual source and translated artifacts.

**Architecture:** Add a site-owned hero/workspace with an editable source buffer and explicit upload receipt. Translation uses the returned uploaded path; result comparison fetches both real artifacts and derives sentence-level changes.

**Tech Stack:** React, TypeScript, Vite, existing `api.uploadFile`, `api.executeTool`, provider/model/key APIs, node:test, browser-harness.

**Spec:** `docs/superpowers/specs/2026-10-06-batch-e-independent-sites-design.md`

## Global Constraints

- Use white/black editorial layout, Source Serif 4 at 65–75ch, Libre Franklin controls.
- Bind all five manifest fields, including `input_path`; there is no `text` manifest parameter.
- Do not execute unuploaded edits or create translations/diffs in the browser.
- Red/blue marks correspond only to actual text differences.
- Keep dependency gate pinned and show errors once.

## Review Focus

- Editing after upload invalidates the receipt and blocks translation until another upload succeeds.
- Upload failure preserves the editable source and shows the real error.
- Missing source/output artifact blocks diff rendering and surfaces retrieval error.
- Identical source/output strings display as identical, without red/blue marks.
- Empty or very long text remains legible and usable at mobile widths.

---

### Task 1: Independent site and artifact diff tests

**Files:** Create `frontend/src/sites/text-translator/site.ts`, `TextTranslatorSite.tsx`, `TextTranslatorHero.tsx`, `TextTranslatorWorkspace.tsx`, `text-translator.css`, and a focused `sentenceDiff.ts`; test `frontend/src/tests/textTranslatorSite.test.tsx` plus a fixture under `frontend/src/tests/fixtures/`.

**Interface:** `diffSentences(source: string, translated: string): SentenceDiffRow[]`. Match identical sentences in order; pair remaining source/target sentences by position within each unmatched run and mark full changed sentences red/blue; render unpaired remainder as deletion/insertion. Never claim word-level alignment that this algorithm did not compute.

- [ ] Add tests for ordered unchanged sentence matching, changed sentence pairs, inserted/deleted remainder, identical content, empty content, upload receipt invalidation, and block-run-until-upload behavior.
- [ ] Add static-render tests for two hero actions and all five manifest fields with `data-param-key`.
- [ ] Run `cd frontend && npm test`; confirm the new assertions fail before implementing.
- [ ] Implement explicit upload/replace using the actual return path, language/provider/model controls, UI key save, and execute lifecycle.
- [ ] Fetch the submitted source and returned translation artifacts; show an error rather than a partial/fabricated diff when either read fails.
- [ ] Run `cd frontend && npm run verify`; commit site and tests.

### Task 2: Visual and real-operation review

**Files:** Create captures under `docs/research/batch-E/text.translate.llm/`.

- [ ] Review both routes at 1440×900 and 390×844, plus 768×1024; verify the actual reading measure, paired layout, overflow, contrast, and pinned Install control.
- [ ] Exercise a small real translation using a saved/provider key if available; record artifact reads and response. Otherwise name the precise blocker.
- [ ] Fix issues, rerun verification, and commit review fixes separately.
