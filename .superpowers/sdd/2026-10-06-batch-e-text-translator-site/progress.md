# Task 4.5 — Batch-E text-translator site: visual & real-operation review

Worktree: `wt-batch-E` · Site route: `/t/text.translate.llm` (hero) and `/t/text.translate.llm/workspace`
Research folder: `docs/research/batch-E/text.translate.llm/`
Status: complete — captures committed, real translation verified, `npm run verify` green, review fixes committed locally (not pushed).

## What was reviewed

Both routes and all three workflow stages (SOURCE → LANGUAGE → PROOF) at 1440×900, 768×1024, and 390×844, using `browser-harness` (CDP) against a live build.

## Methodology / environment note

The machine's default ports 8000 and 5173 are owned by an unrelated project (`/home/hruthvik9487/work/llm/`), so this review ran the Batch-E stack on private ports without disturbing them:

- Backend: `PYTHONPATH=backend python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8001`.
- Frontend: a temporary review-only Vite config proxying `/api` → `127.0.0.1:8001`, served on `:5174` and reached through a non-`localhost` LAN IP (`10.36.243.166`) so the frontend's `API_BASE` resolves to `''` (same-origin proxy). This config was untracked and has been deleted; no frontend source was modified.

## Screenshot review (findings)

Captured and inspected; saved to the research folder with the Batch-E reference naming.

| State | 1440×900 | 768×1024 | 390×844 |
|---|---|---|---|
| Hero | `hero-final-1440x900.png` | `hero-final-768x1024.png` | `hero-final-390x844.png` |
| Workspace (source) | `workspace-final-1440x900.png` | `workspace-final-768x1024.png` | `workspace-final-390x844.png` |
| Proof (result) | `result-final-1440x900.png` | `result-final-768x1024.png` | `result-final-390x844.png` |

- **Reading measure**: PASS. Galley source/translation text is capped at `72ch` (`text-translator.css` `.txt-galley__source/__translation { max-width:72ch }`), inside the 65–75ch target; the workspace editor is capped at `75ch`. No line over-measures at any width.
- **Paired layout**: PASS. ORIGINAL / TRANSLATION are aligned as matching rows at all three sizes; at 390px the pair stays side-by-side with both side labels visible (single-column stacking is reserved for source/language stages, not the proof). Each changed pair shows red (source) / blue (translation) inset marks keyed to actual text differences.
- **Overflow**: PASS. No horizontal overflow at 1440/768/390 (mobile uses `minmax(0,1fr)` galley columns and fluid padding; long code paths wrap with `overflow-wrap:anywhere`).
- **Contrast**: PASS. Ink `#111` on white; changed-source `#b32035` and changed-translation `#165a91` on white clear WCAG AA at their sizes; the pinned strip text is dark on white.
- **Pinned Install control**: PASS. The `DependencyGate` footer (`.txt-dependency`, `position:fixed; bottom:0`) is pinned and visible in hero/workspace/proof at every viewport. `/api/tools/text.translate.llm/deps` reports `ready:true`, `missing:[]`, `deps:[]`, so the pinned control renders the ready state — "No external dependencies — this tool runs on the Python already installed." — rather than an Install action. This is the accurate API-backed state, not a missing control.

## Real translation (artifact reads + response)

The environment and `~/.bashrc` both expose `GROQ_API_KEY`; the provider list reports `groq` with `has_key:true`, `source:environment`. A new UI key was not saved during review (to avoid replacing the configured credential).

Exercised two ways, both with target Spanish, provider Groq, detected `qwen/qwen3.8-27b`:

1. Direct API (`POST /api/tools/text.translate.llm/execute`, payload `{kind:"standalone",destination:"",params:{...}}`, a 40-byte uploaded source):
   - Response: `status: completed`; `data { target_lang, provider:"groq", model:"qwen/qwen3.8-27b", artifacts_count:1 }`; artifact `translator-review-source_es.txt`.
   - `GET /api/artifacts/content?path=…/uploads/translator-review-source.txt` → `"Good morning. The train leaves at noon.\n"`.
   - `GET /api/artifacts/content?path=…/downloads/text.translate.llm/translator-review-source_es.txt` → `"Buenos días. El tren sale al mediodía."`.
2. Through the live UI (hero upload → set provider Groq + target Spanish → Translate): the proof rendered the run receipt `groq / qwen/qwen3.8-27b · Target Spanish · 1 artifact`, `2 sentence pairs`, both marked changed — pair 1 `Good morning.` → `Buenos días.`, pair 2 `The train leaves at noon.` → `El tren sale al mediodía.` No translation is produced in the browser; the galley reads the two real artifacts.

## Verification output

`cd frontend && npm run verify` → **exit 0** (`node:test` 305 pass / 0 fail, `tsc -b` clean, `oxlint` warnings only). No warnings or errors in `src/sites/text-translator/`. No code change was required — the site already satisfies the review checks, so there are no test additions.

## Changes made (review fixes)

- Added the nine standardized final captures above.
- Removed six superseded captures (`hero-{desktop,mobile,tablet}.png`, `workspace-{desktop,mobile,tablet}.png`) that used the older non-matching naming; the folder now matches the sibling Batch-E final-capture pattern.
- Corrected `structure-research.md`: the prior live-review paragraph claimed screenshots "are not copied into this folder" (CUA-export limitation); they are now exported and committed, so that line and the capture list were updated, and the real-run byte count was corrected to the actual 40 bytes.

## Residual risks / limitations

- Only plain-text translation was exercised; the manifest description's "preserving markdown headings, bullet points, and paragraph structure" was not re-verified here (that copy is surfaced from the backend manifest, not authored in the site).
- Provider/model/config mutations made against a private backend instance on `:8001` (uploads/downloads/config) are gitignored and did not touch the other project on `:8000`/`:5173`.
- Red/blue marks cover sentence-level changes only (the `pairGalleyText` contract); no word-level alignment is claimed.
