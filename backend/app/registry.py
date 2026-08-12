from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.tools.base import Tool, ToolManifest

REGISTRY: dict[str, Any] = {}


def register(tool: Any) -> None:
    REGISTRY[tool.manifest.id] = tool


def get(tool_id: str) -> Any:
    return REGISTRY[tool_id]


def list_manifests() -> list[Any]:
    return [t.manifest for t in REGISTRY.values()]
