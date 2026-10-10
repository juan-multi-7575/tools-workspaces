# Batch E Backend Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose real downloader byte progress, make saved translator keys usable, distinguish failed subtitle batches, and return subtitle artifacts through the existing content API.

**Architecture:** Make narrow changes at the existing tool and artifact boundaries. Preserve current event/result contracts except for additive progress/failure metadata and an artifact JSON envelope for subtitle text.

**Tech Stack:** Python, FastAPI, pytest, existing yt-dlp subprocess runner and provider store.

**Spec:** `docs/superpowers/specs/2026-10-06-batch-e-independent-sites-design.md`

## Global Constraints

- Progress numbers must be backend-reported, with unknown totals remaining unknown.
- Saved keys must never be returned or logged; document explicit saved-key/environment precedence.
- Existing JSON/text artifact behavior remains compatible.
- Subtitle batch failures cannot be reported as successful translations.

## Review Focus

- A progress line with unknown total must not emit a guessed total or percent.
- A persisted key and environment key conflict must resolve deterministically.
- A malformed/partial LLM subtitle batch must not silently pass through original cue text as success.
- `.srt`/`.vtt` content must use the existing `{content,name,size,kind}` JSON shape; binary artifacts must remain downloadable.
- Missing artifact remains 404.

---

### Task 1: Downloader byte events

**Files:** Modify `backend/app/tools/downloader.py`; test `backend/tests/test_04_downloader.py`.

**Interfaces:** Extend `_parse_progress(line)` and queue events emitted by `execute_ydl`; retain `status`, `percent` only when yt-dlp actually reports it, `speed`, and `eta`. Add `downloaded_bytes` and `total_bytes` only when actual progress values can be parsed.

- [ ] Add `test_parse_progress_reports_actual_downloaded_and_total_bytes` for a progress-template/event line with both values.
- [ ] Add `test_parse_progress_keeps_unknown_total_unknown` for a fragment/live stream event with no total.
- [ ] Run `pytest backend/tests/test_04_downloader.py -q`; confirm the new assertions fail first.
- [ ] Implement the smallest yt-dlp-supported progress output change and parser; do not estimate bytes from rounded percent.
- [ ] Re-run that test module and commit `backend/app/tools/downloader.py backend/tests/test_04_downloader.py`.

### Task 2: Artifact content envelope

**Files:** Modify `backend/app/main.py`; test `backend/tests/test_07_artifacts.py`.

**Interfaces:** `GET /api/artifacts/content?path=...` returns `{content: string, name: string, size: number, kind: string}` for `.srt` and `.vtt`, as it does for text formats.

- [ ] Add tests for `.srt` and `.vtt` response JSON/content and for existing JSON artifact behavior.
- [ ] Run `pytest backend/tests/test_07_artifacts.py -q`; confirm the new subtitle tests fail against `FileResponse`.
- [ ] Add `.srt` and `.vtt` to the existing text-envelope suffix set; leave binary formats on `FileResponse`.
- [ ] Run `pytest backend/tests/test_07_artifacts.py -q` and commit the route and tests.

### Task 3: Translator credentials and subtitle failure results

**Files:** Modify `backend/app/tools/text/llm_translator.py`, `backend/app/tools/translator_tool.py`, and, only if needed, `backend/app/providers.py`; test `backend/tests/test_19_translator.py` and `backend/tests/test_28_translator_split.py`.

**Interfaces:** Both translator tools resolve credentials from explicit saved provider keys plus existing environment/bashrc sources; saved UI key takes precedence for that provider, then environment, then bashrc. Change `_translate_cues(...) -> tuple[list[SubtitleCue], list[int]]`, where the second item contains cue indexes from failed batches or omitted IDs. `SubtitleTranslatorTool.execute` returns status `failed`, `data.failed_cue_indices`, and an explanatory error when that list is nonempty; retain any partial artifact for inspection.

- [ ] Add tests proving saved keys are passed to both text and subtitle translation while secrets are absent from API results.
- [ ] Add tests proving environment/bashrc fallback remains compatible and saved key precedence is deterministic.
- [ ] Add tests where one subtitle batch raises or omits a cue ID; assert the result status is `failed`, `data.failed_cue_indices` contains affected cue indexes, and an available partial artifact is retained.
- [ ] Run `pytest backend/tests/test_19_translator.py backend/tests/test_28_translator_split.py -q`; confirm the new credential/failure tests fail before implementation.
- [ ] Implement provider resolution through the existing provider store and surface failures without logging keys or translating fallback text as a successful result.
- [ ] Run `pytest backend/tests/test_19_translator.py backend/tests/test_28_translator_split.py -q` and commit those backend files/tests.

### Task 4: Backend regression pass

**Files:** No new files; validate Tasks 1–3.

- [ ] Run `pytest backend/tests/test_04_downloader.py backend/tests/test_07_artifacts.py backend/tests/test_19_translator.py backend/tests/test_28_translator_split.py -q`.
- [ ] Review JSON envelopes, secret handling, and all progress fields against the spec; report unavailable live-provider/yt-dlp conditions without simulating them.
