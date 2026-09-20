import json
import time
from pathlib import Path
from typing import Any

from app import paths

DEFAULT_CANVAS_NODES: list[dict[str, Any]] = [
    {
        "id": "downloader-1",
        "type": "toolNode",
        "position": {"x": 60, "y": 140},
        "data": {
            "label": "Media Downloader",
            "toolId": "downloader",
            "category": "video",
            "inputKinds": ["url"],
            "outputKinds": ["video", "audio"],
            "params": {},
        },
    },
    {
        "id": "transcriber-2",
        "type": "toolNode",
        "position": {"x": 420, "y": 140},
        "data": {
            "label": "Audio Transcriber",
            "toolId": "transcriber",
            "category": "speech",
            "inputKinds": ["audio", "video"],
            "outputKinds": ["subtitles", "text"],
            "params": {"model_size": "base"},
        },
    },
]

DEFAULT_CANVAS_EDGES: list[dict[str, Any]] = [
    {
        "id": "edge-downloader-1-transcriber-2",
        "source": "downloader-1",
        "target": "transcriber-2",
        "type": "deletableEdge",
        "animated": True,
        "style": {"stroke": "#9D6638", "strokeWidth": 2.5},
    }
]


def _canvas_state_file(workspace_id: str) -> Path:
    root = paths.workspace_root(workspace_id)
    root.mkdir(parents=True, exist_ok=True)
    return root / "canvas_state.json"


def get_workspace_canvas(workspace_id: str) -> dict[str, Any]:
    """Retrieve persisted canvas state for a workspace, or initialize with defaults."""
    state_file = _canvas_state_file(workspace_id)
    if state_file.exists():
        try:
            data = json.loads(state_file.read_text(encoding="utf-8"))
            if isinstance(data, dict) and "nodes" in data:
                return data
        except Exception:
            pass

    # Default starter canvas for fresh workspace
    default_state = {
        "workspace_id": workspace_id,
        "updated_at": time.time(),
        "nodes": DEFAULT_CANVAS_NODES,
        "edges": DEFAULT_CANVAS_EDGES,
        "viewport": {"x": 0, "y": 0, "zoom": 1.0},
    }
    # Save default state so it's initialized on disk
    save_workspace_canvas(workspace_id, default_state)
    return default_state


def save_workspace_canvas(workspace_id: str, state: dict[str, Any]) -> dict[str, Any]:
    """Persist canvas state atomically for a workspace."""
    state_file = _canvas_state_file(workspace_id)
    payload = dict(state)
    payload["workspace_id"] = workspace_id
    payload["updated_at"] = time.time()

    temp_file = state_file.with_suffix(".tmp")
    temp_file.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    temp_file.replace(state_file)
    return payload


def reset_workspace_canvas(workspace_id: str) -> dict[str, Any]:
    """Reset canvas state to empty or default starter layout."""
    default_state = {
        "workspace_id": workspace_id,
        "updated_at": time.time(),
        "nodes": [],
        "edges": [],
        "viewport": {"x": 0, "y": 0, "zoom": 1.0},
    }
    return save_workspace_canvas(workspace_id, default_state)
