Status: ready-for-agent

# Multi-Tool Platform Specification

## Problem Statement

Users need a local-first workbench shell to run and compose arbitrary tools, scripts, binaries, and custom experimental frameworks without restriction across diverse technical disciplines (Media, Documents, Images, Web, Networking, Cybersecurity, AI/Tutoring, Data Utilities, and Personal Prototyping). The platform provides runtime scaffolding—a central tool catalog, DAG pipeline validator, non-blocking async execution, Server-Sent Events (SSE) progress streaming, in-app multi-format previews, and isolated filesystem workspaces with versioned run storage.

## Solution

A local-first, single-user, cross-platform (Windows/Linux/macOS) workbench with two top-level sections sharing one backend engine:

- **Tools** — an unconstrained catalog of registered utilities across 9+ domains, each runnable standalone (outputting to a per-tool downloads directory) with zero workspace overhead.
- **Workspaces** — named, filesystem-backed containers holding an isolated artifact store. Inside a Workspace, tools are arranged into a **Topological DAG Pipeline**: an ordered graph where output ports feed compatible input ports of downstream steps, validated by open MIME subsumption so incompatible tools cannot be wired together.

All state is the on-disk folder tree — no database, no global session. Every tool execution is a **Run** recorded under its own run ID with an atomic `manifest.json`, logs, and artifacts; runs are versioned and never silently overwritten, can be inspected, branched from, and deleted. A phone on the same network can trigger downloads through a token-gated remote page.

## Key Architecture & Implementation Invariants

1. **Open MIME Port Subsumption (ADR-0008):**
   - Extensible MIME taxonomy (`*/*`, `audio/*`, `image/*`, `application/pdf`, `text/markdown`, `json`, `network/pcap`, `stream/*`).
   - `is_assignable` handles wildcard subsumption and subtype matching.

2. **Async Subprocess Runners & 10-Line Declarative Tools (ADR-0009):**
   - `AsyncSubprocessRunner` runs non-blocking async processes with process group detachment (`start_new_session=True`), 3-stage cancellation (SIGINT -> SIGTERM -> SIGKILL), PID reaping, and chunked regex reading preventing pipe deadlocks.
   - `CommandTool` template allows dropping any CLI/bash tool in 10 lines with automatic parameter validation, destination path resolution, and artifact harvesting.

3. **Directed Acyclic Graph (DAG) Pipeline Engine:**
   - Cycle detection and topological execution with `asyncio.TaskGroup`.
   - Dynamic multi-branch dispatching with `fail_fast` and `branch_pruning` fault tolerance.
   - API accepts both legacy 1D sequential steps and full multi-branch DAG payloads.

4. **Universal Catalog Across 9 Domains:**
   - **Media:** yt-dlp, FFmpeg, SoX, Demucs, HandBrake, Streamlink, Transcriber.
   - **Documents:** Pandoc, PDF tools, OCRmyPDF.
   - **Images:** ImageMagick, ExifTool metadata scrubber.
   - **Web:** Web fetcher & DOM scraper, gallery-dl.
   - **Networking:** Port scanner, DNS diagnostics, ping latency probe.
   - **Cybersecurity:** Hash calculator (SHA-256, BLAKE3, MD5), secret scanner, Codec tool (Base64/Hex/URL).
   - **AI & Tutoring:** Document summarizer, Anki flashcard generator, interactive quiz builder.
   - **Data Utilities:** JSON data transformer, archive packager.
   - **Custom Scripts:** Generic Python and Bash script runner for user-built tools and prototypes.

5. **Dynamic Frontend Workbench:**
   - `DynamicForm.tsx`: Dynamic parameter form builder for any schema.
   - `ToolsPage.tsx`: Categorized tool catalog with 10 domain filter tabs and tag search.
   - `PipelineCanvas.tsx`: React Flow visual DAG editor serializing true graph edges into DAG execution payloads.
   - `ArtifactViewerModal.tsx`: In-app multi-format viewer for text, JSON, images, audio, video, and PDF.
   - `RunDetailsModal.tsx`: Run manifest & execution log viewer with "Branch to Pipeline" checkpoint fork.

6. **Filesystem Truth & Checkpoint Branching (ADR-0002, ADR-0006, ADR-0010):**
   - Self-contained per-run directories (`workspaces/<ws_id>/runs/<run_id>/manifest.json`).
   - Run branching endpoint `POST /api/workspaces/{id}/runs/{id}/branch` to fork from any historical checkpoint.

## Testing Decisions

- **Seam: FastAPI HTTP API & Filesystem State.** Tests drive endpoints only and assert on responses plus on-disk filesystem state.
- **Coverage:** 17 comprehensive pytest suites (`test_01` through `test_17`) covering skeleton, tools, pipelines, DAGs, runners, open ports, artifacts, settings, CLI, remote control, and run branching.
