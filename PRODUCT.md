# Multi-Tool Platform — Product Document

## Overview

**Product Name:** Multi-Tool Platform  
**Stage:** Active development  
**Primary user:** Single local user; optionally controlling downloads from a phone on the same network  
**License / Cost:** Local-first, no accounts, no cloud dependency required  
**Source of truth:** `CONTEXT.md` + `docs/adr/`

A local-first media utility platform that lets users chain standalone tools into named workspaces. Each tool runs independently or inside a workspace, and pipeline steps wire together through typed ports so output artifacts flow from one tool to the next.

---

## Problem Space

Media producers, podcasters, and audio researchers currently patch together downloads, trimming, transcription, and post-processing with ad-hoc scripts or closed SaaS pipelines. Those scripts are brittle, hard to inspect, and tied to one vendor's API. Closed pipelines also make it hard to branch an earlier step and rerun only part of the chain.

This platform solves that by making every tool inspectable on disk, chainable without vendor lock-in, and runnable standalone or inside an isolated workspace.

---

## Vision & Value Proposition

A general-purpose, filesystem-backed media-tool platform where:

- **Tools** are discoverable utilities registered in a central catalog
- **Workspaces** are isolated project containers with their own artifact store
- **Pipelines** are validated, typed chains inside workspaces
- **Everything** is local-first, single-user, and account-free
- The same backend exposes both a local UI and a LAN controller for a phone

The value is composability without configuration debt: users build pipelines visually, rerun or delete any step, and inspect every artifact directly in the filesystem.

---

## Core Domain Concepts

| Term | Definition | Avoid |
|---|---|---|
| **Tool** | A standalone media-processing utility registered in the tool catalog | module, handler, service |
| **Workspace** | A named, filesystem-backed container holding an isolated artifact store and chained tool runs | project, dataset, corpus, session |
| **Pipeline** | An ordered chain of Tool steps whose outputs feed the next step's inputs | workflow, recipe, chain |
| **Template** | A saved, reusable Pipeline arrangement; the app ships empty and users create their own | category preset, project type |
| **Model** | A specific speech-to-text model offered by a Provider | engine, provider |
| **Port** | A Tool's typed input/output slot (audio, video, text, folder, any) | field, channel, endpoint |
| **Artifact** | A file or folder produced by a Tool run, stored in a workspace or the global downloads area | output, result, source, chunk |
| **Region** | A user-marked selection on a waveform | selection, marker |
| **Segment** | A time-delimited slice of audio produced from a Region | chunk, clip |
| **Run** | A single execution of a Tool, versioned by run ID | task, job |
| **Provider** | A speech-to-text backend registered in the transcriber registry | engine, model |
| **Standalone execution** | Running a Tool outside any Workspace; output goes to the global downloads area | one-off, ad-hoc mode |
| **Workspace execution** | Running a Tool inside a Workspace; output goes to that workspace's artifact store | dataset mode, pipeline mode |
| **Downloads area** | Global directory where standalone executions write | media, uploads, dataset dir |
| **Artifact store** | Per-Workspace directory organized by run ID holding everything a workspace's runs produce | source folder, chunks folder |

---

## Product Scope

### In Scope

- Download manager with concurrent queue, progress streaming, and cancellation
- Audio processor with waveform visualization, Regions, trimming, and splitting
- Transcriber with pluggable Providers (faster-whisper local, Groq, OpenAI Whisper API)
- Tool registry with typed Ports and parameter schemas
- Workspace CRUD with isolated artifact stores
- Pipeline builder with port-compatibility validation and chained execution
- Run history per workspace with versioned, user-deletable storage
- LAN remote control from a phone via per-boot token gating
- Settings for download concurrency
- Provider/key management for cloud transcription backends

### Out of Scope

- Multi-user auth, accounts, or roles
- TTS dataset building, voice cloning, or audio training handoff
- Closed recipe-only tool catalog
- Cloud sync or hosted workspace storage
- Closed Port type enum — file kinds are intentionally open-ended

---

## Architecture

### High-Level System

```
┌─────────────────────────────┐
│         Frontend (UI)       │
│  Tools / Workspaces / Runs  │
└──────────────┬──────────────┘
               │  FastAPI REST + SSE
┌──────────────▼──────────────┐
│         Backend             │
│  ┌───────────────────────┐  │
│  │  Tool Registry        │  │
│  │  (manifest catalog)   │  │
│  └──────────┬────────────┘  │
│  ┌──────────▼────────────┐  │
│  │  Pipeline Engine      │  │
│  │  validate_chain()     │  │
│  │  run_pipeline()       │  │
│  └──────────┬────────────┘  │
│  ┌──────────▼────────────┐  │
│  │  Tool Drivers         │  │
│  │  Downloader           │  │
│  │  AudioProcessor       │  │
│  │  Transcriber          │  │
│  └──────────┬────────────┘  │
│  ┌──────────▼────────────┐  │
│  │  Workspace Manager    │  │
│  │  Filesystem-backed    │  │
│  └───────────────────────┘  │
└─────────────────────────────┘
```

### Backend Design

The backend is a single FastAPI service. On startup it ensures the filesystem layout (`downloads/`, `workspaces/`) and starts the download manager background task. Each endpoint maps directly to a filesystem operation or a tool execution.

**Tool Registry (`app/registry.py`)**  
Central catalog of manifests. Each tool driver imports itself at module load time (`import app.tools`), registering its `ToolManifest` and driver instance. The registry exposes `list_manifests()` and `get(tool_id)`.

**Pipeline Engine (`app/pipeline.py`)**  
Two operations:
- `validate_chain(tool_ids)` — checks output/input port compatibility between consecutive tools
- `run_pipeline(workspace_id, steps)` — executes steps sequentially, auto-wiring compatible artifacts from previous steps into the next step's input parameter

Port compatibility is open-ended: two kinds match if they are equal, or either side is `any`.

**Workspace Manager (`app/workspaces.py`)**  
Creates workspace folders, lists workspaces, and persists run metadata as JSON files under each workspace's `runs/` directory. Every run gets a unique `run_id` and writes into `workspaces/<id>/runs/<run_id>/`.

**Paths (`app/paths.py`)**  
Single source of truth for all filesystem roots: `downloads/`, `workspaces/`, `run_dir()`, `workspace_root()`, `workspace_runs_dir()`.

**Providers (`app/providers.py`)**  
Transcriber provider registry. Each provider declares API-key storage location and available models. Local providers (faster-whisper) are auto-detected from host caches; cloud providers require a saved key.

### Frontend (Overview)

The frontend is not yet documented in detail, but it maps to two top-level sections matching the two-section platform:

- **Tools section:** catalog browsing, standalone execution, download queue
- **Workspaces section:** workspace list, pipeline builder, run history, artifact browser

LAN remote control is surfaced as a phone-friendly subset of these endpoints, gated by a per-boot token.

---

## Directory Structure

```
tools-workspaces/
├── CONTEXT.md                         # Ubiquitous language glossary
├── AGENTS.md                          # Agent conventions
├── docs/
│   ├── agents/
│   │   ├── domain.md                  # Domain docs guide
│   │   ├── issue-tracker.md           # Issue tracker skill docs
│   │   └── triage-labels.md           # Triage label vocabulary
│   ├── adr/
│   │   ├── 0001-two-section-platform-with-dual-execution-context.md
│   │   ├── 0002-filesystem-is-the-source-of-truth-no-database.md
│   │   ├── 0003-local-first-single-user-with-lan-remote-control.md
│   │   ├── 0004-generic-multi-tool-platform-not-tts.md
│   │   ├── 0005-tools-are-a-registry-with-typed-ports-and-validated-pipelines.md
│   │   ├── 0006-versioned-user-deletable-run-storage.md
│   │   └── 0007-provider-pluggable-transcription.md
│   └── research/
│       ├── speech-transcription-providers.md
│       └── tool-catalog-ideas.md
├── backend/
│   ├── app/
│   │   ├── main.py                    # FastAPI entrypoint, all routes
│   │   ├── registry.py                # Tool manifest catalog
│   │   ├── pipeline.py                # Chain validation + execution
│   │   ├── workspaces.py              # Workspace/run CRUD
│   │   ├── paths.py                   # Filesystem root helpers
│   │   ├── providers.py               # Transcription provider registry
│   │   ├── download_manager.py        # Background download queue
│   │   └── tools/
│   │       ├── __init__.py            # Imports all tool drivers for registration
│   │       ├── base.py                # Tool, ToolManifest, Artifact, ToolRunContext
│   │       ├── downloader.py          # Download tool driver
│   │       ├── audio_processor.py     # Audio tool driver (trim/split/waveform)
│   │       └── mediainfo_tool.py      # Media inspection tool driver
│   └── tests/
│       ├── conftest.py
│       ├── test_01_skeleton.py
│       ├── test_02_audio_processor.py
│       ├── test_03_pipelines_and_runs.py
│       ├── test_04_downloader.py
│       ├── test_05_trimmer.py
│       └── test_06_transcriber.py
├── frontend/
│   └── (UI implementation — see issue tracker for current state)
├── config/
│   └── (provider keys and app config)
├── .scratch/
│   └── (local issue tracker markdown files)
└── .venv/
    └── (Python virtual environment)
```

---

## Architectural Decision Records

### ADR-0001 — Two-section platform with dual execution context

The product is split into two top-level sections: **Tools** (standalone catalog) and **Workspaces** (named containers with isolated artifact stores and chained tool runs). Every tool runs in one of two contexts: standalone (output to the global downloads area) or workspace-bound (output into the workspace's artifact store).

**Rejected:** tools-only catalog with no way to chain outputs across steps; a single monolithic pipeline with no standalone use.

### ADR-0002 — Filesystem is the source of truth; no database

All state lives in the on-disk folder tree (`downloads/`, `workspaces/<id>/runs/<run_id>/`). There is no database and no global in-memory session.

**Rejected:** SQLite metadata store — adds a second source of truth for a single-user local app and makes the workspace harder to inspect and back up.

**Consequence:** anything the UI shows must be derivable from the folder tree.

### ADR-0003 — Local-first single user with LAN remote control, no accounts

The app runs locally for a single user with no authentication. To let a phone on the same network trigger downloads, the backend binds to `0.0.0.0` and gates remote actions behind a per-boot random token.

**Rejected:** strict localhost (loses the phone controller); full multi-user auth (out of scope).

### ADR-0004 — Generic multi-tool platform, not a TTS/audio-training platform

The product is a general media-tool platform, not a TTS dataset builder or audio-training-focused application. TTS-oriented concepts (voices, model types, training handoff, corpora) are explicitly out; the five tools are positioned as generic utilities.

**Rejected:** framing the catalog as a decomposed TTS pipeline, which would lock terminology and roadmap to training-centric concerns.

### ADR-0005 — Tools are a registry with typed ports; pipelines are validated chains

Tools are registered in a central catalog; each tool declares its name, parameter schema, accepted input kinds, and produced output kinds. A Pipeline in a Workspace is an ordered chain where consecutive steps connect an output port to a compatible input port. The UI offers only compatible next tools and rejects invalid chains.

Port types follow an open file-kind model (`audio`, `video`, `text`, `folder`, `any` — subkinds included) rather than a closed enum.

**Rejected:** curated recipes only (too rigid); unconstrained free chaining (users wire incompatible tools); closed type enum (too rigid for an open catalog).

**Adding a tool** is a developer action: a manifest plus a driver, registered in the repo.

### ADR-0006 — Versioned, user-deletable run storage

Each Run writes into its own storage keyed by a clear run ID; later steps may consume any prior run's outputs, and re-running a step never overwrites an older run. Runs are not append-only: the user may delete runs, and deleting a Workspace deletes its runs.

**Rejected:** overwrite-in-place (loses history and the ability to branch from an earlier state); append-only immutability (leaks disk and frustrates cleanup).

**Consequence:** artifact references must carry run IDs, and cleanup is a user action.

### ADR-0007 — Provider-pluggable transcription

The transcriber tool is backed by a provider registry rather than a single hardcoded service. Each provider registers its own API-key slot (stored in a local config, never committed) and its model list; local providers are auto-detected from the host's model caches.

Initial providers: faster-whisper (local), Groq, and OpenAI Whisper API.

**Rejected:** hardcoding Groq (locks users into one vendor and no offline path); supporting no cloud providers (loses fast remote transcription).

---

## Product Roadmap

### Current State

- Backend API complete for workspaces, tools, pipelines, downloads, providers
- Three tool drivers implemented: Downloader, Audio Processor, Media Info
- Transcriber scaffolded; provider registry and keys API in place
- Pipeline validation and chained execution functional
- Test suite covers skeleton, audio processor, pipelines/runs, downloader, trimmer, transcriber

### Near-Term Priorities

- Frontend implementation for Tools and Workspaces sections
- Transcriber tool driver integration with provider registry
- Pipeline UI with drag-to-reorder and visual port validation
- Waveform waveform/Region interaction in the frontend
- Template save/load UX
- LAN remote controller view for phone

### Not Planned

- Multi-user auth or cloud hosting
- TTS/audio-training workflows
- Closed recipe catalog

---

## Technical Constraints

- **No database.** All state is derivable from the filesystem.
- **Single user.** No accounts, no roles, no multi-user guarantees.
- **Local-first.** Core functionality works offline; cloud providers are optional.
- **LAN remote control only.** Phone access requires being on the same network; access is gated by a per-boot token.
- **Provider keys stored locally.** API keys are saved in local config and never committed.
- **Open port kinds.** File kinds are intentionally extensible; adding a new kind does not require schema migrations.

---

## Key Files for Onboarding

| File | Purpose |
|---|---|
| `CONTEXT.md` | Ubiquitous language glossary |
| `docs/adr/0001` through `0007` | All architectural decisions |
| `backend/app/main.py` | API surface — read this to understand every route |
| `backend/app/tools/base.py` | Tool contract: manifest, context, result, port kinds |
| `backend/app/pipeline.py` | Chain validation and execution logic |
| `backend/app/workspaces.py` | Filesystem-backed workspace and run storage |
| `backend/app/providers.py` | Transcription provider registry and key management |
