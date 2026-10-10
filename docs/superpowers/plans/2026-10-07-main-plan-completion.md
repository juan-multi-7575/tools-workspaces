# Main Plan Completion — Side Plan (Tasks 4 & 5)

> **Parent plan:** `docs/issues/fix-work/PLAN.md`
> **Prerequisites:** Tasks 1–3 are merged complete (backend transport, canvas/workspace, forms). See `transport-report.md`, `canvas-report.md`, `forms-report.md`.
> **Worktree:** `wt-batch-E` remains active on `sites/batch-E` for Task 5 review and integration testing.

## Ruling

Tasks 4 and 5 are **coordinator-only** (design tokens + final integration/review). No subagent lane is needed for Task 4 since it requires human judgment on visual output. Task 5 runs after all edits are in.

## Task 4 — Accessibility and design tokens

- [ ] Floor information text at 12px — check all info/caption elements in `frontend/src/`
- [ ] Add metadata to info elements (aria-label or data attributes)
- [ ] Consolidate hex color values into theme tokens in `index.css` without breaking SVG/QR consumers
- [ ] Define z-index scale (document in `index.css` as CSS custom properties)
- [ ] Perform #6 focus defaults — ensure all interactive elements have visible focus rings
- [ ] Run #14 typography migration — ensure consistent font sizing across breakpoints
- [ ] Browser checks: capture before/after screenshots at 1440×900, 768×1024, 390×844
- [ ] Report limitations and findings to `docs/issues/fix-work/design-tokens-report.md`

**Test gate:** Visual inspection only (no automated test possible). Impeccable detector scan.

## Task 4.5 — Batch-E text-translator site completion (incomplete work)

The `docs/superpowers/plans/2026-10-06-batch-e-text-translator-site.md` plan has **Task 1 implemented** (committed at `b09743f2` + fix `47a10301`) but **Task 2 — Visual and real-operation review — is NOT done**. No progress.md, no `.superpowers/sdd` tracking, and no review screenshots exist (compare: `summarizer/`, `subtitle.translate.srt/`, `media.download.yt-dlp/` all have full screenshot sets; `text.translate.llm/` has only `structure-research.md`).

- [ ] Capture hero/workspace/result screenshots at 1440×900, 768×1024, 390×844 in `docs/research/batch-E/text.translate.llm/`
- [ ] Exercise a real translation using a saved LLM provider key (if available); record artifact reads and API response. Otherwise name the precise blocker.
- [ ] Run `cd frontend && npm run verify` for the text-translator tests
- [ ] Create `.superpowers/sdd/2026-10-06-batch-e-text-translator-site/progress.md` with findings
- [ ] Commit review fixes separately

**Test gate:** `frontend/src/tests/textTranslatorSite.test.tsx` (4 assertions). Browser-harness visual inspection of paired layout, overflow, contrast, and pinned controls.

## Task 5 — Integration and review

- [ ] Run `npm run verify` (frontend tests + tsc + oxlint)
- [ ] Run backend suite (`python -m pytest backend/tests/`)
- [ ] Run `npm run build` (production build check)
- [ ] Verify all acceptance criteria from `UI_UX_ARCHITECTURE_ISSUES.md` and `STATUS_REVIEW.md`
- [ ] Spin up read-only review subagent against final diff + all report files
- [ ] Address review findings, rerun relevant checks
- [ ] No push or commit requested

**Verification targets:**
- Frontend: 214 tests passing (baseline from batch-B verification)
- Backend: all test files passing
- Build: 0 warnings (excluding known >500kB chunk warning)

## Side-plan task tracking

| Task | Owner | Status | Evidence file |
|------|-------|--------|---------------|
| Task 4: Design tokens | coordinator | ⏳ pending | `docs/issues/fix-work/design-tokens-report.md` (to be created) |
| Task 4.5: Batch-E text-translator completion | coordinator | ⏳ incomplete | `docs/superpowers/plans/2026-10-06-batch-e-text-translator-site.md` |
| Task 5: Integration | coordinator | ⏳ pending | `docs/issues/fix-work/review-report.md` (existing, to be updated) |

## Constraints

- Work in the main shared checkout (`tools-workspaces`) for Task 4
- Use `wt-batch-E` worktree for Task 4.5 (text-translator review) and Task 5 integration testing (it has full backend deps installed)
- No nested subagents for Task 4; one review subagent for Task 5
- Do not push or commit to main — this is a working review state
