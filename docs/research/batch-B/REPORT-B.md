# Batch B — Per-Tool Report

## Summary

| # | Tool | Commit | Tests | Real run | Overflow | Contrast | Gate |
|---|------|--------|-------|----------|----------|----------|------|
| 1 | trimmer | `f81c5b9` | 125/125+ | — | 0 @3 | ≥4.5 | viewport |
| 2 | audio_processor | `0565e301` | 155/155 | real waveform | 0 @3 | ≥4.5 | viewport |
| 3 | transcriber | `e3ce1221` | 186/186 | jfk3.wav, tone8.wav | 0 @3 | ≥4.83 | viewport |
| 4 | demucs | `5ce63019` | 214/214 | torch failure | 0 @3 | 17/17 ≥4.5 | viewport |

## transcriber (e3ce1221)

- Files: src/sites/transcriber/{TranscriberSite,Hero,Workspace,TranscriptView,transcriberModel,transcriber.css,site}.ts{x,tsx,css,ts}, src/tests/transcriberSite.test.tsx, docs/research/batch-B/transcriber/*.png
- Design maps to the "typed transcript on book ground" reference: cue timecodes set as marginalia in the left gutter. Diverged from a player-style scroll: the full transcript is read back from the parsed .srt and word-wrapped in the margin rather than following playback.
- Real run: jfk3.wav -> real cues with marginalia; tone8.wav -> single honest cue ".".
- Measured: 0 overflow at 1440x900/768x1024/390x844; contrast min 4.83; dependency gate pinned in viewport; no Tools Garage chrome; 9 screenshots taken.
- npm run verify: 214/214 pass (was 186 before — the full suite now includes both new sites).

## demucs (5ce63019)  — built around the real failure

- Files: src/sites/demucs/{DemucsSite,DemucsHero,DemucsWorkspace,demucsModel,site}.ts{x,tsx,ts}, src/sites/demucs/demucs.css, src/tests/demucsSite.test.tsx, docs/research/batch-B/demucs/*.png
- Design maps to "a tool that names what it cannot do": the page shows what the backend returns and nothing more.
- Real run: heavy confirm button converts to "Install 1 dependency" on first click (two-step), then a real run fails with the verbatim traceback `ModuleNotFoundError: No module named 'torch'`. The page shows the traceback exactly and reports "Nothing was separated" with zero artifacts. No four-lane stem mixer of artifacts the API never returned — the separated stems are described only as what the tool does in general (from the backend's own manifest text).
- Measured: 0 overflow at all 3 viewports; 17/17 rendered selectors ≥4.5; dependency gate in viewport and pinned ("This tool needs 1 dependency | pip.demucs | PIP | LARGE DOWNLOAD | about 2.50 GB | demucs splits"); no Tools Garage chrome; 6 screenshots taken.
- npm run verify: 214/214; npm run build: 0 (chunk warning is pre-existing, unrelated).

## Orchestration note (not a tool result)

Two child subagents were launched in parallel lanes — transcriber-finish (commit) and demucs-build (no commit). Both were steered mid-flight to cap open tabs at 5 and reuse a single tab per lane, after the shared Chrome reached 11 tabs and the parent's cleanup of surplus tabs broke the transcriber lane's WebSocket (a parent action, recovered).

Status: both children **timed out at the 1800s cap without committing**, but had produced finished files. The parent agent re-ran `npm run verify` (214/214) and `npm run build` (0), re-took and re-checked every screenshot itself, and committed both with explicit `git add` paths (no `git add -A`).

## Things that could not be verified truthfully

- Real audio playback end-to-end in headless Chrome: no audio device is attached (AudioContext stays `suspended`). The transcriber uses the playback-probe instrumentation hook (`HTMLMediaElement.prototype.play` via `Page.addScriptToEvaluateOnNewDocument`) to confirm play registration, not audible output. Documented, not claimed.
- The demucs lane timed out before it could self-commit or self-verify; the parent completed both and committed on the demucs lane's behalf. No tool code differs from what the lane produced.
