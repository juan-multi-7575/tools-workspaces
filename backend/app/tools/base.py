from __future__ import annotations

import asyncio
from typing import Any
from pydantic import BaseModel, ConfigDict, Field

from app.core.ports import PortKind, PortSpec, is_assignable, normalize_port_type


class ToolManifest(BaseModel):
    id: str
    name: str
    description: str
    category: str = "General"
    tags: list[str] = Field(default_factory=list)
    input_kinds: list[PortKind] = Field(default_factory=list)
    output_kinds: list[PortKind] = Field(default_factory=list)
    input_ports: list[PortSpec] | None = None
    output_ports: list[PortSpec] | None = None
    parameters_schema: dict[str, Any] = Field(default_factory=dict)


class ToolRunContext(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    kind: str
    destination: str
    workspace_id: str | None = None
    run_id: str | None = None
    params: dict[str, Any] = Field(default_factory=dict)
    run_label: str | None = None
    cancel_event: asyncio.Event | None = None
    progress_queue: asyncio.Queue[dict[str, Any]] | None = None


class Artifact(BaseModel):
    path: str
    kind: PortKind = PortKind.any
    name: str
    mime_type: str | None = None


class ToolResult(BaseModel):
    artifacts: list[Artifact] = Field(default_factory=list)
    status: str
    error: str | None = None
    duration_seconds: float | None = None
    data: dict[str, Any] | None = None
    output_text: str | None = None


class Tool:
    manifest: ToolManifest
    input_param: str = "input_path"

    async def execute(self, context: ToolRunContext) -> ToolResult:
        raise NotImplementedError
