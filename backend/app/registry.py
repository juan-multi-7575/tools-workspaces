from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.tools.base import Tool, ToolManifest

log = logging.getLogger(__name__)

REGISTRY: dict[str, Any] = {}
_ALIASES: dict[str, str] = {}
_SOURCES: dict[str, str] = {}


def register(tool: Any, _source: str = "<unknown>") -> None:
    tid = tool.manifest.id
    if tid in REGISTRY and REGISTRY[tid] is not tool:
        raise ValueError(f"tool id collision: {tid} from {_SOURCES.get(tid, '<unknown>')} vs {_source}")
    if "." not in tid:
        log.warning("tool id %s is not dotted domain.verb.engine form (from %s)", tid, _source)
    REGISTRY[tid] = tool
    _SOURCES[tid] = _source


def register_alias(old_id: str, tool: Any, _source: str = "<unknown>", deprecated: bool = True) -> None:
    if old_id in REGISTRY and REGISTRY[old_id] is not tool:
        raise ValueError(f"tool id collision: {old_id} from {_SOURCES.get(old_id, '<unknown>')} vs {_source}")
    _ALIASES[old_id] = tool.manifest.id
    REGISTRY[old_id] = tool
    _SOURCES[old_id] = _source
    if deprecated:
        log.warning("tool id %s is deprecated, use %s", old_id, tool.manifest.id)


def get(tool_id: str) -> Any:
    if tool_id in REGISTRY:
        return REGISTRY[tool_id]
    if tool_id in _ALIASES:
        return REGISTRY[_ALIASES[tool_id]]
    raise KeyError(tool_id)


def list_manifests() -> list[Any]:
    return [t.manifest for t in REGISTRY.values()]
