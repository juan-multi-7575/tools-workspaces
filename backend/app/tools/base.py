from enum import Enum
from typing import Any
from pydantic import BaseModel


class PortKind(str, Enum):
    any = "any"
    audio = "audio"
    video = "video"
    text = "text"
    folder = "folder"


class ToolManifest(BaseModel):
    id: str
    name: str
    description: str
    input_kinds: list[PortKind]
    output_kinds: list[PortKind]
    parameters_schema: dict[str, Any]


class ToolRunContext(BaseModel):
    kind: str
    destination: str
    workspace_id: str | None = None
    run_id: str | None = None
    params: dict[str, Any] = {}
    run_label: str | None = None
    cancel_event: Any = None
    progress_queue: Any = None


class Artifact(BaseModel):
    path: str
    kind: PortKind
    name: str


class ToolResult(BaseModel):
    artifacts: list[Artifact]
    status: str
    error: str | None = None


class Tool:
    manifest: ToolManifest
    input_param: str = "input_path"

    async def execute(self, context: ToolRunContext) -> ToolResult:
        raise NotImplementedError
