# Spec: Workspace Session Isolation, Canvas Persistence & Unified High-Efficiency Workbench UX

## 1. Overview & Problem Statement
Currently, each workspace has separate files on disk, but:
1. Canvas layout, node positions, parameters, and in-progress pipelines are held in temporary React state. Reloading the page or switching workspaces resets the canvas.
2. Incomplete, half-configured, or in-flight pipelines are lost on server/browser restart.
3. The UI separates Tools, Canvas, Runs, and File Explorer into clunky tab switches, making inspecting parameters, checking execution logs, or browsing artifacts high-friction.
4. Switching workspaces requires returning to `/workspaces`.

## 2. Architecture & Data Model

### 2.1 Backend Persistence (`workspaces/<workspace_id>/canvas_state.json`)
Each workspace directory maintains its own session persistence file:
```json
{
  "updated_at": 1726743120.45,
  "nodes": [
    {
      "id": "downloader-1",
      "tool_id": "downloader",
      "position": { "x": 100, "y": 150 },
      "params": { "url": "https://youtu.be/..." },
      "status": "idle"
    }
  ],
  "edges": [
    { "id": "e-1-2", "source": "downloader-1", "target": "transcriber-2" }
  ],
  "viewport": { "x": 0, "y": 0, "zoom": 1.0 },
  "active_run_id": null
}
```

### 2.2 Backend API Endpoints
- `GET /api/workspaces/{workspace_id}/canvas`: Loads the persisted canvas state. Returns default starter nodes if no file exists yet.
- `PUT /api/workspaces/{workspace_id}/canvas`: Debounced auto-save of current nodes, edges, positions, node params, and viewport.
- `POST /api/workspaces/{workspace_id}/canvas/reset`: Resets canvas to clean slate or template.

### 2.3 Frontend Unified Workbench ("Studio Layout")
Instead of disparate, isolated tabs, `WorkspaceDetailPage` becomes a high-density, cohesive 3-pane workbench:

1. **Global Header with Instant Workspace Switcher**:
   - Quick workspace dropdown with active badge, run counts, and 1-click "New Session / Workspace".
   - Switch workspaces instantly with 0 page reloads.

2. **Left Panel: Searchable Tool Catalog & Quick Palette**:
   - Filterable tool drawer (All, Video, Audio, Speech, Text, AI, Custom).
   - 1-click "Add to Canvas" or drag-and-drop.
   - Shows input/output port tags at a glance.

3. **Center Panel: The Infinite Canvas & Live Status Bar**:
   - React Flow canvas with automatic debounced auto-save to the backend (`● Saved` indicator).
   - Node badges: `Pending`, `Running`, `Completed`, `Failed`, `Skipped`, and `⚡ Cached`.
   - Action bar: 1-Click Starter Templates, Auto-Arrange, Run Pipeline, Stop Pipeline, Clear, Validate.

4. **Right Context Inspector (Collapsible / Slide-over)**:
   - When a node is clicked:
     - Detailed Parameter Form with type validation and clear tool documentation.
     - Direct access to node inputs, upstream connections, and last-run outputs.
     - Run single step test directly on that node.
   - When pipeline is executing:
     - Real-time live log stream, duration timers, and fail-fast step breakdowns.

5. **Bottom Collapsible Dock: Artifacts & Media Drawer**:
   - Expandable bottom tray showing workspace artifacts and media packages.
   - Quick preview (waveform player for audio, video preview, subtitle reader, text summary viewer).
   - Fast action buttons: Download, Delete, and "Send to Tool".

## 3. Error Handling & Edge Cases
- **Server restart / browser reload**: Canvas immediately recovers exact positions, parameters, and nodes from `canvas_state.json`.
- **Concurrent edits**: Saved with timestamp check; debounce (500ms) on frontend prevents network thrashing.
- **Corrupted state recovery**: If `canvas_state.json` contains invalid JSON, fallback to starter template and preserve backup in `canvas_state.json.bak`.

## 4. Verification Plan
- **Backend Tests**:
  - Test canvas state save and load API endpoints for any workspace.
  - Test session isolation (modifying workspace A's canvas does not touch workspace B).
- **Frontend Build**:
  - TypeScript compilation and Vite production build.
  - Test live auto-save, workspace switching, parameter updates, and pipeline execution.
