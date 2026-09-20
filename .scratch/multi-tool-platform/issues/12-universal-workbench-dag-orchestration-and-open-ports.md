# 12 — Universal Workbench, DAG Orchestration, and Open MIME Ports

**What was built:** The platform has been expanded from initial media tools into an open-ended, unconstrained universal multi-tool workbench and DAG pipeline orchestration engine. Tools across all domains (Media, Documents, Images, Web, Networking, Cybersecurity, AI/Tutoring, Data Utilities, and Personal/Custom scripts) are registered with typed open MIME ports, executed via non-blocking async subprocess runners, and chained into topological DAG pipelines with in-app multi-format previews and checkpoint branching.

**Blocked by:** 11 — Catalog additions (six tools)

**Status:** resolved

- [x] **Open MIME Port Subsumption (`backend/app/core/ports.py`):** Open-ended MIME port typing (`*/*`, `audio/*`, `image/*`, `application/pdf`, `text/markdown`, `json`, `network/pcap`) with wildcard subsumption.
- [x] **Async Subprocess Runner (`backend/app/runners/subprocess_runner.py`):** Non-blocking `asyncio.create_subprocess_exec` runner with process group detachment (`start_new_session=True`), 3-stage cancellation escalation (SIGINT -> SIGTERM -> SIGKILL), zombie PID reaping, and chunked regex line reading.
- [x] **10-Line Declarative Base (`backend/app/tools/declarative.py`):** `CommandTool` template with argument token array templates preventing command injection and path splitting on spaces.
- [x] **Topological DAG Pipeline Engine (`backend/app/core/dag.py`, `scheduler.py`):** Cycle validation (Kahn's), topological multi-branch execution with `asyncio.TaskGroup`, artifact auto-wiring, and `fail_fast` / `branch_pruning` error policies.
- [x] **Universal Catalog Across 9 Domains (`backend/app/tools/`):** Registered Pandoc, PDF tools, ImageMagick, ExifTool scrubber, Web scraper, Port scanner, DNS lookup, Hash calculator, Secret scanner, Codec tool, AI Summarizer, Flashcard generator, Quiz builder, JSON transformer, and Custom Script runner.
- [x] **Dynamic Frontend Workbench (`frontend/src/`):**
  - `DynamicForm.tsx`: Dynamic parameter form builder for any schema.
  - `ToolsPage.tsx`: Categorized tool catalog with 10 domain filter tabs and tag search.
  - `PipelineCanvas.tsx`: React Flow visual DAG editor serializing true graph edges into DAG execution payloads.
  - `ArtifactViewerModal.tsx`: In-app multi-format viewer for text, JSON, images, audio, video, and PDF.
  - `RunDetailsModal.tsx`: Run manifest & execution log viewer with "Branch to Pipeline" checkpoint fork.
- [x] **Decentralized Run Storage & ADRs:** Added ADR-0008, ADR-0009, ADR-0010, per-run `manifest.json` generation, and run branching endpoint `POST /api/workspaces/{id}/runs/{id}/branch`.
- [x] **Testing:** 17 pytest test suites (`test_01` through `test_17`) with 88 passed tests asserting zero regressions.
