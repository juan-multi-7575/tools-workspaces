Status: ready-for-agent

# Multi-Tool Platform

## Problem Statement

The user's ideas live as a raw, mixed dump in `.idea-dump/`; there is no refined, coherent plan for the product. The user wants a local-first platform where they can either run a single media tool quickly (standalone) or arrange tools into validated pipelines inside named workspaces, with nothing lost and everything configurable. It is explicitly **not** a TTS dataset builder or audio-training-focused application — earlier ideas framed the same catalog as a decomposed TTS pipeline, and that framing is rejected.

## Solution

A local-first, single-user, cross-platform (Windows/Linux/macOS) platform with two top-level sections sharing one backend engine:

- **Tools** — a catalog of registered utilities, each runnable standalone (output to a per-tool folder in the global downloads area) with no workspace context.
- **Workspaces** — named, filesystem-backed containers holding an isolated artifact store (organized by run ID). Inside a Workspace, tools are arranged into a **Pipeline**: an ordered chain where each step's output feeds the next step's input, validated by typed ports so incompatible tools cannot be wired together.

All state is the on-disk folder tree — no database, no global session. Every tool execution is a **Run** recorded under its own run ID; runs are versioned and never silently overwritten, can be browsed and continued from, and can be deleted (deleting a Workspace deletes its runs). A phone on the same network can trigger downloads through a token-gated remote page.

## User Stories

1. As a user, I want to open the app and see two sections — Tools and Workspaces — so that I can choose between a quick one-off task and a multi-step workspace.
2. As a user, I want a tools catalog listing every registered tool, so that I can discover and launch utilities.
3. As a user, I want to run any tool standalone and have its output written to the per-tool downloads area, so that I never need a workspace for a one-off task.
4. As a user, I want to download media with the full yt-dlp option set exposed through grouped sections, search, presets, and a raw-args field, so that almost every yt-dlp configuration is reachable without leaving the web UI.
5. As a user, I want to watch live download progress (percent/speed/ETA) streamed to the UI, so that I know a download is working.
6. As a user, I want to cancel a download in flight and have partial files cleaned up, so that I don't leave junk on disk.
7. As a user, I want to configure the download queue (e.g. max concurrent downloads) in Settings rather than a hardcoded default, so that I control how many downloads run at once.
8. As a user, I want a global download-manager drawer showing the queue, per-item progress, history, and cancel/retry actions, so that I can manage all downloads from one place.
9. As a user, I want to convert audio between WAV, MP3, FLAC, OGG, and M4A and resample (e.g. 22.05k/44.1k/48k), so that I can standardize files standalone.
10. As a user, I want a waveform view with a scrollable duration ruler so that I can read absolute time while marking regions.
11. As a user, I want to mark a single region on the waveform and trim to one clip, so that I can cut audio quickly.
12. As a user, I want to mark multiple regions on the waveform and have the tool split them into segment files, so that I can slice a long recording in one action.
13. As a user, I want the transcriber to accept recorded audio from my microphone, a single audio file, or a batch of audio files from one upload control, so that I can transcribe whatever I have.
14. As a user, I want to choose a transcription provider (faster-whisper local, Groq, OpenAI Whisper API) and a model per call, so that I can trade speed, cost, and privacy.
15. As a user, I want local providers auto-detected on the host and cloud API keys stored in a local config, so that keys are never committed and offline transcription works out of the box.
16. As a user, I want to package any selected set of artifacts plus an optional manifest (JSONL/CSV) into a ZIP, so that I can export deliverables generically.
17. As a user, I want mediainfo to probe media files and show their properties, so that I can inspect files before processing.
18. As a user, I want streamlink to capture live streams (e.g. Twitch, YouTube live), so that live content is reachable alongside yt-dlp.
19. As a user, I want ocrmypdf to turn scanned PDFs into searchable text locally, so that document processing works offline.
20. As a user, I want sox to apply audio effects/filter chains, so that I can manipulate audio beyond the ffmpeg wrapper.
21. As a user, I want gallery-dl to batch-download image galleries, so that I can archive many images at once.
22. As a user, I want demucs to separate stems (vocals/instruments), so that I can isolate tracks.
23. As a user, I want to create a Workspace from an empty template and arrange tools into a pipeline, so that I can build my own workflow.
24. As a user, I want the pipeline UI to only offer compatible next tools, so that I cannot wire invalid chains.
25. As a user, I want each run to write to its own storage under a run ID, so that nothing from a re-run overwrites an earlier result.
26. As a user, I want to browse previous runs and continue from any of them, so that I can branch from any earlier state.
27. As a user, I want to delete runs, and I expect deleting a Workspace to delete its runs, so that disk use stays under my control.
28. As a user, I want per-Workspace execution history (which tool ran, when, with which parameters, which artifacts it produced), so that I can audit what happened.
29. As a user, I want to save an arranged pipeline as a Template, so that I can reuse my workflows.
30. As a user, I want each artifact row to offer Preview, Download (copy), and Delete, so that I can inspect, save out, or remove files.
31. As a user, I want to export the Workspace artifact store as a ZIP, so that I can retrieve everything in one bundle.
32. As a user, I want a dedicated Settings area for advanced configs (download queue, provider keys, dependency updates) separate from each tool page's run config, so that global options live in one place.
33. As a user, I want to scan a QR code from the downloader tool and control downloads from a phone on the same network, so that I can queue downloads remotely with live progress.
34. As a user, I want the app to check pinned dependencies (yt-dlp first) on start and on demand, and upgrade only with my approval, so that downloads keep working when providers change.
35. As a developer, I want the root CLI to auto-generate subcommands from the tool registry, so that the CLI grows with the catalog.
36. As a developer, I want to add a new tool by registering a manifest plus a driver, so that extending the catalog is mechanical.
37. As a user, I want the platform to run on Windows, Linux, and macOS, so that I can use it on whichever machine I have.
38. As a user, I want standalone tool executions to never write into any Workspace, so that one-off work can never pollute a workspace.

## Implementation Decisions

- **Tool registry (ADR-0005).** A central registry where every tool declares: id, name, parameter schema, accepted input port kinds, and produced output port kinds. Adding a tool is a developer action — a manifest plus a driver registered in the repo. Ports use an open file-kind model (audio, video, text, folder, any; subkinds included), not a closed enum.
- **Dual execution context (ADR-0001).** Every tool runs standalone (output to `downloads/<tool>/`) or workspace-bound (output into the workspace's artifact store). Only the destination differs; there are no separate tool profiles.
- **Pipeline validation.** Inside a Workspace, steps connect one output port to a compatible input port; the backend validates the chain and the UI offers only compatible next tools.
- **Versioned runs (ADR-0006).** Runs write under `workspaces/<id>/runs/<run-id>/`; references to artifacts carry run IDs; re-running a step never overwrites an earlier run; runs are user-deletable; workspace deletion cascades to runs.
- **Downloader.** A single shared yt-dlp wrapper used by the web UI, the CLI, and the remote page. Near-full yt-dlp options exposed via grouped sections, search, presets, and a raw-args passthrough. A configurable queue (concurrency set in Settings), per-task cancellation with partial-file cleanup, and real-time SSE progress (percent/speed/ETA). A global download-manager drawer renders queue, history, progress, and cancel/retry.
- **Transcriber provider registry (ADR-0007).** Providers register their own API-key slot (stored in a local config, never committed) and model list; local providers are auto-detected from host model caches. Initial providers: faster-whisper (local), Groq, OpenAI Whisper API. The tool accepts recorded microphone audio, a single file, or a batch upload.
- **Audio processor.** Format conversion (WAV, MP3, FLAC, OGG, M4A) and resampling (22.05k/44.1k/48k and configurable). Trimming/splitting belongs to the separate audio trimmer tool.
- **Audio trimmer.** Wavesurfer.js waveform with a scrollable duration ruler. Single-region trim produces one clip; multi-region marking splits into segment files. Splitting is performed by the tool once the user marks regions.
- **Archive packager.** A generic exporter: select any artifacts from the workspace and bundle them with an optional JSONL/CSV manifest into a ZIP. No dataset semantics.
- **Additional catalog entries.** mediainfo (probe), streamlink (live streams), ocrmypdf (PDF OCR), sox (audio filters), gallery-dl (galleries), demucs (stem separation). The catalog is open-ended; these join the five core tools.
- **Workspaces.** Only an Empty template ships; users save their arranged pipelines as Templates. Per-Workspace execution history records tool, time, parameters, and produced artifacts. Artifact rows offer Preview / Download (copy) / Delete; the whole store exports as a ZIP.
- **Settings area.** A dedicated page/endpoint for advanced configs (download queue, provider keys, dependency updates) kept separate from per-tool run config.
- **Remote control (ADR-0003).** The backend binds to `0.0.0.0`; remote actions are gated behind a per-boot random token. A minimal phone page offers the same full downloader options plus live SSE progress.
- **Dependency updater.** A pinned list (yt-dlp first, then other pinned packages); on-start and on-demand checks; upgrades run only with explicit user approval.
- **CLI.** Subcommands auto-generated from the tool registry, so the CLI mirrors every registered tool; prints live progress and aborts cleanly on Ctrl-C.
- **Frontend.** A React SPA: top-level Tools/Workspaces navigation, tools catalog, dedicated tool pages, workspace pipeline editor with run browsing, artifact browser, waveform editor, settings page, download-manager drawer, and remote page.
- **Stack & runtime.** FastAPI (Python) backend; React SPA; Wavesurfer.js; tools (yt-dlp, ffmpeg, etc.) run as local subprocesses; cross-platform launchers.

## Testing Decisions

- **Primary seam: the FastAPI HTTP API** (confirmed with the user). The SPA, CLI, and remote page are thin clients, so all behavior is reachable through the API. Tests drive endpoints only and assert on endpoint responses **plus the resulting on-disk state** (run folders, artifacts, settings files). Network calls (yt-dlp fetches, cloud transcription providers) are monkeypatched at the seam's boundary to return predictable fixtures; local subprocesses are invoked with tiny fixture inputs.
- **What a good test asserts.** External behavior, never implementation details: a tool run returns a task that terminates in a terminal state, artifacts appear at the expected run path, invalid pipelines are rejected before execution, re-running produces a new run ID and leaves the earlier run intact, deleting a run removes only that run, workspace deletion removes its runs.
- **Modules covered:**
  - Tool registry and execution — each registered tool standalone and workspace-bound; parameter validation.
  - Pipeline validation — compatible chains accepted, incompatible chains rejected.
  - Versioned run storage — isolation between runs, no-overwrite, branch-from-prior-run, run deletion, workspace cascade.
  - Workspace CRUD and Templates — create/rename/delete, empty template, save-and-reuse pipeline.
  - Artifact operations — list, preview, download (copy), delete, ZIP export.
  - Downloader — option passthrough and raw args, configurable concurrency, SSE progress events before completion, per-task cancel with partial cleanup.
  - Transcriber — provider selection and model choice honored, local model detection, key storage (never committed), record/single/batch input handling.
  - Settings persistence — download queue config, provider keys, dependency update approvals.
  - Dependency updater — mocked package index; check flow; the approval gate is mandatory.
  - CLI — subcommands generated from the registry; mocked tool backends; Ctrl-C abort.
  - Remote control — token gate (non-token requests rejected); enqueue path.
- **Prior art.** This repo is greenfield — there is no existing test suite. The patterns established in the idea dump's historical suites (FastAPI `TestClient` with monkeypatch and `tmp_path` fixtures, asserting on-disk state) are adopted as the model, and the existing `/api/...` conventions from the dump's backend are the basis for the endpoint surface.

## Out of Scope

- Multi-user accounts, authentication, or a database.
- TTS/STT training, corpora, training handoff, model import/serving, or a voice assistant.
- Any cloud-hosted deployment; everything runs locally as subprocesses.
- whisper.cpp and audiowaveform as separate catalog entries (not selected).
- Bundled starter-chain templates (only the Empty template ships; users save their own).
- User-pluggable tools (adding tools is developer-only via manifest + driver).
- Auto silence-detection (VAD) in the audio tool — trimming and splitting are user-marked only.

## Further Notes

- The domain vocabulary used throughout is defined in `CONTEXT.md`; decisions are recorded in `docs/adr/0001–0007`.
- Provider and tool-catalog research lives in `docs/research/speech-transcription-providers.md` and `docs/research/tool-catalog-ideas.md`.
- `.idea-dump/` is not authoritative; the spec above supersedes it.
