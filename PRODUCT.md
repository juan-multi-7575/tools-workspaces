# Multi-Tool Platform — Product Document

## Overview

**Product Name:** Multi-Tool Platform  
**Stage:** Active development  
**Primary user:** Single local user; developers, tinkerers, researchers, power users, and creators who build, test, and chain tools; optionally controlling tasks via LAN remote control  
**License / Cost:** Local-first, open-source, no accounts, no cloud dependency required  
**Source of truth:** `CONTEXT.md` + `docs/adr/`

The Multi-Tool Platform is an extensible, local-first **universal workbench, empty shell, and pipeline orchestration engine**. It provides an unconstrained runtime environment where **any tool of any type, domain, quality, quantity, or maturity**—from quick personal bash/python scripts, custom-built experimental frameworks, and ad-hoc test utilities to full-featured open-source binaries and API clients—can be registered into a central catalog, executed standalone, and chained into automated, validated pipelines inside isolated, filesystem-backed workspaces.

---

## Problem Space

Developers and power users constantly experiment with, build, and utilize a wide array of tools and frameworks across countless domains (media processing, web scraping, document scanning, image manipulation, network diagnostics, security auditing, AI research, interactive tutoring, reverse engineering, custom data wrangling, and beyond).

Currently, this workflow is hampered by:
1. **Scattered, Ad-Hoc Tooling:** Custom scripts, experimental binaries, and one-off tools live scattered across arbitrary folders, lacking a unified launcher, parameter interface, or logging.
2. **Glue-Script Friction:** Connecting the output of one tool (whether a battle-tested binary or a half-finished custom script) into another requires writing disposable, brittle wrapper scripts over and over.
3. **Lost Intermediates & Zero Traceability:** Ad-hoc executions overwrite files in `/tmp` or cluttered directories, making it difficult to inspect, debug, branch, or rerun individual steps in an experimental pipeline.
4. **Tool Gatekeeping in Existing Platforms:** Traditional workflow engines impose rigid plugin architectures, heavy abstractions, or closed domain-specific silos that discourage dropping in quick personal scripts, hacky test utilities, or new frameworks under evaluation.

This platform solves this by offering an **open, opinion-free workbench shell**: any tool you write, test, or install can be immediately dropped in, executed standalone, or wired into a multi-step workspace pipeline with full artifact inspection and versioned run history.

---

## Core Philosophy & Value Proposition

### 1. Unconstrained Tool Horizon (Zero Gatekeeping)
The platform is intentionally domain-agnostic and agnostic to tool pedigree:
- **Any Tool, Any Origin:** Personal one-off scripts, experimental AI frameworks under test, internal developer utilities, hacky prototype parsers, or production CLI binaries all receive first-class support.
- **No Quality or Quantity Limits:** Register 5 tools or 500 tools; run polished tools or rough, WIP developer experiments.
- **Tinkering-Friendly:** If you are testing a new library, CLI, or custom-built framework today, you can wrap it in a manifest and have it immediately available in your UI catalog, CLI, and pipelines.

### 2. The Platform is an Empty Shell & Runtime
The core platform provides runtime scaffolding—a tool catalog, pipeline validator, background job queue, parameter forms, SSE live streaming, and filesystem workspace storage. What tools are installed and what domain they serve is entirely up to the user.

### 3. Isolated Workspaces & Versioned Runs
- **Workspaces** are isolated project containers with their own disk space.
- **Pipelines** wire tools together via typed input/output ports.
- **Runs** are non-destructive and versioned by run ID. Every intermediate artifact is preserved on disk for instant inspection, debugging, or branching.

### 4. Dual Execution Context
- **Standalone Execution:** Quick one-off execution writing directly to global tool download folders.
- **Workspace Execution:** Multi-step pipeline execution saving versioned artifacts inside a project's artifact store.

### 5. Local-First & Account-Free
- 100% offline capability, zero database dependencies, plain filesystem storage, and optional LAN remote control.

---

## Core Domain Concepts

| Term | Definition | Avoid |
|---|---|---|
| **Tool** | Any executable utility, script, binary, custom framework, or API wrapper registered in the catalog with declared ports and parameters | module, handler, service |
| **Workspace** | A named, filesystem-backed container holding an isolated artifact store and chained tool runs | project, dataset, corpus, session |
| **Pipeline** | An ordered chain of Tool steps inside a Workspace where each step's output feeds the next step's input | workflow, recipe, chain |
| **Template** | A saved, reusable Pipeline configuration; the app ships empty and users save custom arrangements | category preset, project type |
| **Port** | A Tool's typed input or output slot (`audio`, `video`, `text`, `image`, `document`, `code`, `binary`, `folder`, `any`, or custom user types) | field, channel, endpoint |
| **Artifact** | Any file, folder, or structured data produced by a Tool run, stored on disk and available as input to downstream steps | output, result, source, chunk |
| **Run** | A single execution of a Tool (standalone or workspace-bound), versioned by a unique run ID | task, job |
| **Category** | An open, user-defined tag or grouping for organizing tools in the catalog (e.g., Media, Docs, Web, Network, Security, AI/Tutoring, Custom/Experimental) | genre, section |
| **Provider** | A pluggable backend engine, model, or service variant for a tool (e.g., local subprocess vs. cloud API) | engine, model |
| **Standalone execution** | Running a Tool outside any Workspace; output writes to the global tool downloads area | one-off, ad-hoc mode |
| **Workspace execution** | Running a Tool inside a Workspace; output is versioned into that workspace's artifact store | pipeline mode, batch mode |
| **Downloads area** | The global directory where standalone tool executions write outputs | media, uploads, scratch dir |
| **Artifact store** | The per-Workspace directory organized by run ID holding all artifacts produced by workspace runs | source folder, runs folder |

---

## Open Tool Taxonomy & Example Domains

The platform supports an infinite variety of tools. Categories and examples below are purely illustrative:

- **Media & Audio/Video:** yt-dlp, FFmpeg, HandBrake, audio processors, waveform editors, Whisper/STT, Demucs stem splitters, Streamlink live capturers.
- **Documents, PDF & OCR:** Doc scanners, Tesseract OCR, OCRmyPDF, Pandoc converters, Poppler utilities (`pdftotext`, `pdfimages`), Typst/LaTeX compilers, Calibre converters.
- **Image Processing & Computer Vision:** ImageMagick, libvips, Real-ESRGAN upscalers, ExifTool metadata scrubbers, format converters, background removers.
- **Web, Browser & Scraping:** Headless Chrome scrapers, DOM snapshotters, `gallery-dl`, `aria2` parallel downloaders, custom web crawlers, API extractors.
- **Computer Networking & Diagnostics:** Port scanners (nmap), ping/traceroute testers, DNS diagnostics (`dig`), curl/HTTP probes, bandwidth and packet analysis scripts.
- **Cybersecurity, Forensics & Audit:** File hashers/checksum verifiers (SHA-256, BLAKE3), secret/credential scanners, SSL/TLS cert analyzers, encoding/decoding utilities (Base64, Hex, JWT), vulnerability check scripts.
- **AI, Knowledge & Tutoring:** Flashcard & quiz generators, document/code summarizers, automated tutoring assistants, concept explainers, knowledge graph builders.
- **Developer, Code & Data Engineering:** JSON/CSV/YAML/SQL transformers (`jq`, `yq`), code formatters/linters, diff generators, 7-Zip/zstd archivers, build artifact packagers.
- **Personal Scripts & Experimental Frameworks:** Custom in-house scripts, machine learning models under test, prototype scrapers, or arbitrary CLI binaries being evaluated.

---

## Architecture

### System Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    Web UI / CLI / Remote                │
│         Tools Catalog  │  Workspaces  │  Pipelines      │
└────────────────────────────┬────────────────────────────┘
                             │ FastAPI REST + SSE
┌────────────────────────────▼────────────────────────────┐
│                  Universal Platform Shell               │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Open Tool Registry (Manifests, Ports & Schemas)   │  │
│  │ (Any tool, script, binary, framework, or API)     │  │
│  └─────────────────────────┬─────────────────────────┘  │
│  ┌─────────────────────────▼─────────────────────────┐  │
│  │ Pipeline Engine (Compatibility & Artifact Wiring) │  │
│  └─────────────────────────┬─────────────────────────┘  │
│  ┌─────────────────────────▼─────────────────────────┐  │
│  │ Universal Subprocess & Driver Execution Engine    │  │
│  │ (Async execution, live SSE progress, cancel hooks)│  │
│  └─────────────────────────┬─────────────────────────┘  │
│  ┌─────────────────────────▼─────────────────────────┐  │
│  │ Filesystem Workspace & Artifact Manager           │  │
│  │ (Versioned runs, zero database, on-disk state)    │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Key Technical Pillars

1. **Universal Tool Driver Interface (`app/tools/base.py`)**
   - Any executable is wrapped with a simple `Tool` class and a `ToolManifest`.
   - Manifests declare ID, display name, description, category, accepted input `PortKind`s, produced output `PortKind`s, and a JSON parameter schema.
   - Built-in support for async subprocess execution, stdout/stderr parsing, progress streaming, and cancellation.

2. **Open Port Compatibility & Auto-Wiring (`app/pipeline.py`)**
   - Ports carry typed Artifacts (`audio`, `video`, `text`, `image`, `document`, `folder`, `any`, etc.).
   - Custom port kinds are first-class strings.
   - Pipeline engine automatically matches compatible output artifacts from prior steps to downstream tool inputs.

3. **Filesystem as the Sole Source of Truth (`app/workspaces.py` & `app/paths.py`)**
   - No SQL/NoSQL database required.
   - State is stored in clear directory hierarchies:
     - `downloads/<tool_id>/` for standalone runs.
     - `workspaces/<workspace_id>/runs/<run_id>/` for workspace pipeline runs.
   - Every run stores its parameters, artifacts, and metadata in `meta.json`.

4. **Background Task Queue & SSE Streaming (`app/download_manager.py`)**
   - Concurrency-managed task runner for long-running processes (downloads, transcode jobs, scans, batch conversions).
   - Real-time Server-Sent Events stream progress percentage, speed, status, and cancellation events to the UI.

---

## Directory Structure

```
tools-workspaces/
├── CONTEXT.md                         # Ubiquitous language glossary
├── AGENTS.md                          # Agent conventions & guidelines
├── PRODUCT.md                         # Product specification (this document)
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
│       ├── tool-catalog-ideas.md
│       └── speech-transcription-providers.md
├── backend/
│   ├── app/
│   │   ├── main.py                    # FastAPI entrypoint, HTTP API & SSE routes
│   │   ├── registry.py                # Universal Tool manifest catalog
│   │   ├── pipeline.py                # Pipeline validation & chained execution
│   │   ├── workspaces.py              # Workspace and run filesystem CRUD
│   │   ├── paths.py                   # Filesystem paths single source of truth
│   │   ├── deps.py                    # System dependencies checker & updater
│   │   ├── cli.py                     # Auto-generated CLI interface
│   │   ├── providers.py               # Pluggable provider registry
│   │   ├── download_manager.py        # Background task queue & progress manager
│   │   └── tools/                     # Modular tool drivers
│   │       ├── __init__.py            # Manifest loader & auto-registration
│   │       ├── base.py                # Base Tool, Manifest, PortKind, Artifact definitions
│   │       ├── downloader.py          # yt-dlp media downloader driver
│   │       ├── audio_processor.py     # Audio convert, resample & process driver
│   │       └── mediainfo_tool.py      # Media inspection & probe driver
│   └── tests/                         # Full automated test suite
├── workspaces/                        # Workspace directories & versioned runs
└── downloads/                         # Global downloads area for standalone executions
```

---

## Architectural Decision Records Summary

- **ADR-0001: Two-section platform with dual execution context**  
  Clean separation between standalone tool execution (quick one-off jobs to global downloads) and workspace pipeline execution (isolated multi-step project artifact stores).
- **ADR-0002: Filesystem is the source of truth; no database**  
  All state is plain files and JSON metadata in the folder tree. Fully portable, human-readable, backup-friendly.
- **ADR-0003: Local-first single user with LAN remote control**  
  No accounts or cloud logins. LAN remote access gated by a per-boot token.
- **ADR-0004: Universal multi-tool platform shell**  
  Domain-agnostic pipeline engine supporting any tool, framework, script, or binary across arbitrary domains with zero gatekeeping on quality or quantity.
- **ADR-0005: Tools are a registry with typed ports; pipelines are validated chains**  
  Open port type system prevents invalid wiring while allowing flexible inter-tool connections.
- **ADR-0006: Versioned, user-deletable run storage**  
  Every run creates a distinct run directory. Runs can be branched from, audited, or deleted.
- **ADR-0007: Pluggable provider registries**  
  Tools supporting multiple engines (e.g. speech-to-text, OCR, AI models) use a pluggable provider abstraction with local-first precedence.

---

## Technical Constraints & Design Principles

1. **Zero Database Dependency:** State must always be reconstructible from the filesystem.
2. **Infinite Horizon Extensibility:** Adding a new tool (whether a 5-line script or complex framework) requires only declaring a `ToolManifest` and implementing the `Tool` runner.
3. **Robust Subprocess Execution:** CLI tools run via async subprocesses with clean stdout/stderr streaming, timeout handling, and cancellation signals.
4. **Open Port Extensibility:** Port kinds are open strings allowing any data format (`audio`, `video`, `text`, `image`, `document`, `code`, `binary`, `folder`, `any`, etc.).
5. **Cross-Platform:** Runs on Linux, macOS, and Windows.
