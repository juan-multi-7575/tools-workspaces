import uuid
from typing import Any

from app.paths import run_dir
from app.registry import get
from app.tools.base import PortKind, ToolRunContext
from app.workspaces import save_run_meta


def _compatible(out_kind: PortKind, in_kind: PortKind) -> bool:
    return out_kind == in_kind or out_kind == PortKind.any or in_kind == PortKind.any


def validate_chain(tool_ids: list[str]) -> tuple[bool, str | None]:
    for i in range(len(tool_ids) - 1):
        a = get(tool_ids[i]).manifest
        b = get(tool_ids[i + 1]).manifest
        if not any(_compatible(o, ink) for o in a.output_kinds for ink in b.input_kinds):
            return False, f"Step {i + 1} ({a.id}) output incompatible with step {i + 2} ({b.id}) input"
    return True, None


async def run_pipeline(workspace_id: str, steps: list[dict[str, Any]]) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    produced: list[dict[str, Any]] = []

    for idx, step in enumerate(steps):
        tool = get(step["tool_id"])
        params = dict(step.get("params") or {})

        if idx > 0:
            for prev in reversed(produced):
                for art in prev["artifacts"]:
                    if any(_compatible(art.kind, ink) for ink in tool.manifest.input_kinds):
                        params.setdefault(tool.input_param, art.path)
                        break
                if tool.input_param in params:
                    break

        run_id = uuid.uuid4().hex[:12]
        dest = run_dir(workspace_id, run_id)
        ctx = ToolRunContext(
            kind="workspace",
            destination=str(dest),
            workspace_id=workspace_id,
            run_id=run_id,
            params=params,
        )
        result = await tool.execute(ctx)

        record = {
            "id": run_id,
            "run_id": run_id,
            "tool_id": tool.manifest.id,
            "step_index": idx,
            "status": result.status,
            "error": result.error,
            "params": params,
            "artifacts": [a.model_dump() for a in result.artifacts],
        }
        save_run_meta(workspace_id, run_id, record)
        produced.append({"step_index": idx, "artifacts": result.artifacts})
        results.append(record)

    return results
