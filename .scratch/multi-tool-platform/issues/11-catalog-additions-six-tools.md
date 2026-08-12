# 11 — Catalog additions (six tools)

**What to build:** Six new tools join the registry with their own pages, runnable standalone and inside Workspace pipelines: mediainfo (probe media files), streamlink (live-stream capture), ocrmypdf (local PDF OCR), sox (audio effect/filter chains), gallery-dl (image-gallery batch downloads), and demucs (stem separation).

**Blocked by:** 03 — Workspace pipelines & versioned runs

**Status:** resolved

- [x] Each of the six tools is registered with its id, name, parameter schema, and input/output port kinds
- [x] A user runs each tool standalone and receives output in the downloads area
- [x] A user runs each tool inside a Workspace and its output lands in the artifact store and can feed later pipeline steps
- [x] Each tool has a dedicated page exposing its options
- [x] **Testing:** API-level tests execute each tool standalone and workspace-bound against tiny fixture inputs and assert the produced artifacts and destinations on disk
