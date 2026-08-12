# Multi-Tool Platform — Domain Model & Decomposed Architecture Specification

## 1. Core Vision & Top-Level Architecture

The platform is strictly structured into **two primary sections**:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   PLATFORM NAVBAR                                      │
│                                                                                        │
│          ┌───────────────────────────┐           ┌───────────────────────────┐         │
│          │      MASSIVE TOOLS        │           │         PROJECTS          │         │
│          │        SECTION            │           │          SECTION          │         │
│          │        (/tools)           │           │        (/projects)        │         │
│          └─────────────┬─────────────┘           └─────────────┬─────────────┘         │
└────────────────────────┼───────────────────────────────────────┼───────────────────────┘
                         │                                       │
                         ▼                                       ▼
             ┌───────────────────────┐               ┌───────────────────────┐
             │ Standalone Tool Catalog│               │ Project Workspaces    │
             │ & Dedicated Tool Pages│               │ & Category Templates  │
             └───────────┬───────────┘               └───────────┬───────────┘
                         │                                       │
                         │ Dual Execution Context                │
                         │ (Standalone vs Project)               │
                         ▼                                       ▼
             ┌───────────────────────────────────────────────────────────┐
             │                   UNIFIED BACKEND ENGINE                  │
             │                                                           │
             │  ┌─────────────────────────────────────────────────────┐  │
             │  │ Tool Registry & Modular Tool Handlers               │  │
             │  │ - yt-dlp Downloader (& Remote Control)              │  │
             │  │ - Audio Trimmer / Converter / Resampler             │  │
             │  │ - Silence VAD Chunker & Waveform Region Editor      │  │
             │  │ - Whisper AI Transcriber (Groq + Local Fallback)    │  │
             │  │ - LJSpeech Exporter & Dataset Packager              │  │
             │  └──────────────────────────┬──────────────────────────┘  │
             │                             │                             │
             │  ┌──────────────────────────▼──────────────────────────┐  │
             │  │ Async Task Queue & Real-Time SSE Streamer           │  │
             │  └──────────────────────────┬──────────────────────────┘  │
             └─────────────────────────────┼─────────────────────────────┘
                                           │
                        ┌──────────────────┴──────────────────┐
                        │                                     │
                        ▼                                     ▼
            ┌───────────────────────┐             ┌───────────────────────┐
            │  Global Downloads Dir │             │ Project Artifact Store│
            │ (downloads/ - standalone)           │(projects/<id>/artifacts)
            └───────────────────────┘             └───────────────────────┘
```

---

## 2. Decomposed TTS Codebase → 5 Standalone Modular Tools

The original monolithic TTS dataset builder codebase is fully decomposed into 5 modular, standalone tools in the Tools Section (`/tools`):

1. **yt-dlp Downloader (`tool_ytdlp`)**:
   - Audio/Video downloading with complete yt-dlp flag parity (format presets, codec selection, playlists, subtitle embedding, rate limits, audio extraction).
   - Embedded Remote Control QR feature for mobile downloads.

2. **Audio Trimmer & Processor (`tool_audio_processor`)**:
   - Trimming (SS, MM:SS, HH:MM:SS), format conversion (WAV, MP3, FLAC, OGG, M4A), sample rate standardization (e.g. 22.05kHz / 16-bit PCM for TTS).

3. **Silence Chunker & Waveform Editor (`tool_silence_chunker`)**:
   - Silence-based VAD auto-chunking (dB threshold, silence duration) + interactive Wavesurfer.js manual timeline region chunker.

4. **Whisper AI Transcriber (`tool_whisper_transcriber`)**:
   - Automated speech-to-text batch transcription using Groq API (`whisper-large-v3-turbo`) with local `faster-whisper` fallback. Inline transcript editor.

5. **LJSpeech Exporter (`tool_ljspeech_exporter`)**:
   - `metadata.txt` formatting, audio segment packaging, dataset statistics calculation, and ZIP archive export.

---

## 3. Projects Section & Data Flow

### 3.1 Project Creation & Category Templates
- Users create projects under specific categories (e.g., *TTS Dataset Creation*, *Media Processing*, *Audio Editing*).
- **TTS Dataset Template**: Selecting the "TTS Dataset" template pre-loads a workspace with all 5 modular tools attached and ready.
- **Empty Project**: Users can also start with a blank project and attach tools on-demand from the catalog.

### 3.2 Inter-Tool Artifact Selector
- Tools executed inside a project write output files directly to `projects/<project_id>/artifacts/`.
- Downstream tools render an **Artifact Dropdown Selector** populated with compatible files from prior tool executions in the same project.

---

## 4. Backend Refactoring & Endpoint Architecture

- **Deprecated Endpoints**: Old monolithic `/api/download`, `/api/chunks/*`, `/api/transcribe*`, `/api/dataset/*` routes are removed.
- **New Modular Endpoints**:
  - `GET /api/tools` — Returns list of all registered tools and metadata.
  - `GET /api/tools/{tool_id}` — Returns tool schema, parameters, and capabilities.
  - `POST /api/tools/{tool_id}/execute` — Runs a tool task (accepts optional `project_id`).
  - `GET /api/tools/{tool_id}/stream/{task_id}` — SSE endpoint for real-time progress & stdout.
  - `POST /api/projects` — Create project.
  - `GET /api/projects/{project_id}` — Get project metadata, attached tools, and artifact store listing.
  - `GET /api/projects/{project_id}/artifacts/{file_path}` — Serve/download project artifact.

---

## 5. Storage Cleanup Strategy

- Purge unneeded monolithic dataset files in `downloads/`, `dataset/`, `uploads/`, and `media/`.
- Establish clean runtime directories:
  - `downloads/` (for standalone tools)
  - `projects/<project_id>/artifacts/` (for project tasks)
