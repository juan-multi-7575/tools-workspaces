# Workspace Sessions & Unified Studio Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide persistent workspace session memory (surviving reloads and restarts) and replace disparate tab navigation with a unified 3-pane Studio Workbench with instant tool palette, quick workspace switcher, real-time node inspector, and dockable artifact viewer.

**Architecture:** 
- Backend adds a canvas persistence engine (`workspaces/<id>/canvas_state.json`) with GET/PUT/RESET endpoints and automated recovery.
- Frontend delivers a unified high-density Studio Layout: persistent Topbar Workspace Switcher, Left Tool Palette with instant search, Center ReactFlow Canvas with debounced auto-save & execution streaming, Right Context Inspector for parameters and live logs, and Bottom Collapsible Media/Artifacts Dock.

**Tech Stack:** FastAPI, Python 3.12, React 19, Vite, ReactFlow (@xyflow/react), TailwindCSS, Lucide-react.

**Spec:** `docs/superpowers/specs/2026-09-19-workspace-sessions-and-workbench-ux-design.md`

## Global Constraints
- Every workspace must have complete data and canvas isolation.
- Unsaved canvas state must auto-save after 600ms of inactivity to `workspaces/<id>/canvas_state.json`.
- Restarting the backend server or reloading the browser must restore exact node positions, parameters, and in-progress/half-baked states.
- Follow the Tools Garage warm aesthetic palette (`#4E220F`, `#9D6638`, `#EDE5CD`, `#B0BA99`, `#F7F1DE`).

---

### Task 1: Backend Workspace Canvas State Persistence API

**Files:**
- Create: `backend/app/core/canvas.py`
- Modify: `backend/app/workspaces.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_23_canvas_persistence.py`

**Interfaces:**
- `get_workspace_canvas(workspace_id: str) -> dict[str, Any]`
- `save_workspace_canvas(workspace_id: str, state: dict[str, Any]) -> dict[str, Any]`
- `reset_workspace_canvas(workspace_id: str) -> dict[str, Any]`
- Endpoints:
  - `GET /api/workspaces/{workspace_id}/canvas`
  - `PUT /api/workspaces/{workspace_id}/canvas`
  - `POST /api/workspaces/{workspace_id}/canvas/reset`

- [ ] **Step 1: Write the failing tests**
Write `backend/tests/test_23_canvas_persistence.py` testing saving nodes, edges, viewport, loading them back, and verifying isolation across workspaces.

- [ ] **Step 2: Run test to verify it fails**
Run `PYTHONPATH=. ../.venv/bin/pytest tests/test_23_canvas_persistence.py` -> fails with 404 / module missing.

- [ ] **Step 3: Implement canvas persistence engine**
Create `backend/app/core/canvas.py` reading/writing `workspaces/<id>/canvas_state.json` safely with atomic write and default starter fallback. Wire endpoints into `backend/app/main.py`.

- [ ] **Step 4: Run test to verify it passes**
Run `PYTHONPATH=. ../.venv/bin/pytest tests/test_23_canvas_persistence.py` -> passes.

---

### Task 2: Frontend API Client for Canvas State & Workspace Switching

**Files:**
- Modify: `frontend/src/lib/api.ts`

**Interfaces:**
- `api.getWorkspaceCanvas(workspaceId: string): Promise<CanvasStateResponse>`
- `api.saveWorkspaceCanvas(workspaceId: string, state: CanvasState): Promise<{ ok: boolean }>`
- `api.resetWorkspaceCanvas(workspaceId: string): Promise<{ ok: boolean }>`

- [ ] **Step 1: Add Canvas types and client methods**
Add `CanvasState`, `CanvasNodeState`, and `CanvasEdgeState` interfaces, along with the API methods in `frontend/src/lib/api.ts`.

- [ ] **Step 2: Typecheck build check**
Run `npm run build` in `frontend/` to ensure typing validity.

---

### Task 3: Global Header & Instant Workspace Session Switcher

**Files:**
- Modify: `frontend/src/App.tsx`
- Create: `frontend/src/components/workspaces/WorkspaceSwitcherDropdown.tsx`

- [ ] **Step 1: Create `WorkspaceSwitcherDropdown` component**
Provides a persistent dropdown in the top navigation/header showing current workspace, list of all workspaces with run counts, a quick "➕ New Workspace" modal, and 1-click switching with zero friction.

- [ ] **Step 2: Mount into App header / workspace routes**
Ensure the workspace switcher is accessible in the header when viewing workspaces.

---

### Task 4: Unified 3-Pane "Studio Workbench" Layout

**Files:**
- Create: `frontend/src/components/studio/ToolPaletteDrawer.tsx` (Searchable tool palette categorized with 1-click add)
- Create: `frontend/src/components/studio/NodeInspectorPanel.tsx` (Parameter form, live validation, upstream inputs, output artifacts)
- Create: `frontend/src/components/studio/BottomArtifactsDock.tsx` (Collapsible bottom media/artifact explorer tray)
- Modify: `frontend/src/components/pipeline/PipelineCanvas.tsx` (Auto-save debounce, canvas state load/sync)
- Modify: `frontend/src/pages/WorkspaceDetailPage.tsx` (Assemble into unified Studio Workbench layout)

- [ ] **Step 1: Implement `ToolPaletteDrawer`**
Left collapsible panel: search bar, category pills (All, Video, Audio, Text, AI), tool cards with inputs/outputs tags, drag-and-drop or click-to-add.

- [ ] **Step 2: Implement Canvas Auto-Save & State Restore**
In `PipelineCanvas.tsx`: on mount, fetch `api.getWorkspaceCanvas(workspaceId)` to load existing nodes/edges/positions/params. On any node change, edge connect, or parameter edit, trigger a 600ms debounced `api.saveWorkspaceCanvas(workspaceId, state)` with a subtle status badge (`● Saved` / `○ Saving...`).

- [ ] **Step 3: Implement `NodeInspectorPanel` & Live Pipeline Log Stream**
Right panel: Selected node shows title, category, description, dynamic parameter input form, run single tool button, and previous output preview.

- [ ] **Step 4: Implement `BottomArtifactsDock`**
Collapsible bottom tray: Shows workspace runs and media packages directly beneath the canvas so users can inspect, preview, and download outputs without switching away from their pipeline.

---

### Task 5: End-to-End Verification & Integration Check

**Files:**
- Test all backend endpoints with pytest.
- Build frontend with Vite.
- Verify server restart persistence (verify nodes and parameters remain intact after reloading).

- [ ] **Step 1: Run full backend test suite**
Run: `cd backend && PYTHONPATH=. ../.venv/bin/pytest tests/`
Expected: 100% tests pass.

- [ ] **Step 2: Run frontend build**
Run: `cd frontend && npm run build`
Expected: zero build errors.
