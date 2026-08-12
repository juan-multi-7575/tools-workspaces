from contextlib import asynccontextmanager

from fastapi import FastAPI

import asyncio
import json

import app.tools  # noqa: F401 - registers tool drivers
from app.download_manager import get_manager
from app.paths import ensure_layout, run_dir, workspace_runs_dir, workspace_root
from app.pipeline import run_pipeline, validate_chain
from app.registry import get, list_manifests
from app.tools.base import ToolRunContext
from app.workspaces import (
    artifact_path,
    create_workspace,
    delete_artifact,
    delete_run,
    delete_workspace,
    export_workspace_zip,
    list_artifacts as list_ws_artifacts,
    list_workspaces,
    list_runs,
)
from fastapi.responses import FileResponse, StreamingResponse


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_layout()
    mgr = get_manager()
    task = asyncio.create_task(mgr.start())
    yield
    task.cancel()


app = FastAPI(title="Multi-Tool Platform", lifespan=lifespan)


@app.get("/api/tools")
async def list_tools():
    return {"tools": list_manifests()}


@app.get("/api/tools/{tool_id}")
async def get_tool(tool_id: str):
    manifest = get(tool_id).manifest
    return manifest.model_dump()


@app.post("/api/workspaces")
async def create(payload: dict):
    name = payload.get("name", "Untitled")
    ws = create_workspace(name)
    return ws


@app.get("/api/workspaces")
async def get_workspaces():
    return {"workspaces": list_workspaces()}


@app.get("/api/workspaces/{workspace_id}")
async def get_workspace(workspace_id: str):
    return {"id": workspace_id, "path": str(workspace_root(workspace_id))}


@app.get("/api/workspaces/{workspace_id}/runs/{run_id}/artifacts")
async def list_artifacts(workspace_id: str, run_id: str):
    files = list_ws_artifacts(workspace_id, run_id)
    return {"run_id": run_id, "artifacts": files}


@app.post("/api/tools/{tool_id}/execute")
async def execute_tool(tool_id: str, payload: dict):
    tool = get(tool_id)
    context = ToolRunContext(**payload)
    result = await tool.execute(context)
    return result.model_dump()


@app.post("/api/workspaces/{workspace_id}/pipeline/validate")
async def validate_pipeline(workspace_id: str, payload: dict):
    tool_ids = payload.get("chain", [])
    valid, error = validate_chain(tool_ids)
    return {"valid": valid, "error": error}


@app.post("/api/workspaces/{workspace_id}/pipeline/run")
async def run_workspace_pipeline(workspace_id: str, payload: dict):
    steps = payload.get("steps", [])
    results = await run_pipeline(workspace_id, steps)
    return {"results": results}


@app.get("/api/workspaces/{workspace_id}/runs")
async def get_runs(workspace_id: str):
    return {"runs": list_runs(workspace_id)}


@app.get("/api/workspaces/{workspace_id}/runs/{run_id}/artifacts/{artifact_name}/preview")
async def preview_artifact(workspace_id: str, run_id: str, artifact_name: str):
    target = artifact_path(workspace_id, run_id, artifact_name)
    if target is None:
        return {"error": "not found"}
    return FileResponse(target)


@app.get("/api/workspaces/{workspace_id}/runs/{run_id}/artifacts/{artifact_name}/download")
async def download_artifact(workspace_id: str, run_id: str, artifact_name: str):
    target = artifact_path(workspace_id, run_id, artifact_name)
    if target is None:
        return {"error": "not found"}
    return FileResponse(target, filename=target.name, media_type="application/octet-stream")


@app.delete("/api/workspaces/{workspace_id}/runs/{run_id}/artifacts/{artifact_name}")
async def remove_artifact(workspace_id: str, run_id: str, artifact_name: str):
    return {"deleted": delete_artifact(workspace_id, run_id, artifact_name)}


@app.delete("/api/workspaces/{workspace_id}/runs/{run_id}")
async def remove_run(workspace_id: str, run_id: str):
    return {"deleted": delete_run(workspace_id, run_id)}


@app.get("/api/workspaces/{workspace_id}/export")
async def export_workspace(workspace_id: str):
    zip_path = export_workspace_zip(workspace_id)
    return FileResponse(zip_path, filename=f"{workspace_id}-artifacts.zip", media_type="application/zip")


@app.delete("/api/workspaces/{workspace_id}")
async def remove_workspace(workspace_id: str):
    return {"deleted": delete_workspace(workspace_id)}


@app.post("/api/downloads")
async def enqueue_download(payload: dict):
    mgr = get_manager()
    task = mgr.enqueue(payload)
    return {"id": task.id, "status": task.status}


@app.get("/api/downloads")
async def list_downloads():
    mgr = get_manager()
    return {"downloads": mgr.list_tasks()}


@app.get("/api/downloads/{task_id}/stream")
async def stream_download(task_id: str):
    mgr = get_manager()
    task = mgr.get(task_id)
    if task is None:
        return {"error": "not found"}

    async def event_stream():
        queue = task.progress_queue
        while True:
            msg = await queue.get()
            yield f"data: {json.dumps(msg)}\n\n"
            if msg.get("status") in ("completed", "failed", "cancelled"):
                break

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.post("/api/downloads/{task_id}/cancel")
async def cancel_download(task_id: str):
    mgr = get_manager()
    ok = mgr.cancel(task_id)
    return {"cancelled": ok}


@app.get("/api/settings/download")
async def get_download_settings():
    mgr = get_manager()
    return {"max_concurrent": mgr.max_concurrent}


@app.post("/api/settings/download")
async def update_download_settings(payload: dict):
    mgr = get_manager()
    if "max_concurrent" in payload:
        mgr.set_max_concurrent(payload["max_concurrent"])
    return {"max_concurrent": mgr.max_concurrent}


@app.get("/api/providers")
async def list_providers():
    from app.providers import list_providers as lp, detect_local_models

    return {"providers": lp(), "local_models": detect_local_models()}


@app.get("/api/providers/keys")
async def list_keys():
    from app.providers import list_keys as lk

    return {"providers": lk()}


@app.get("/api/providers/{provider_id}")
async def get_provider(provider_id: str):
    from app.providers import get_provider as gp

    info = gp(provider_id)
    if info is None:
        return {"error": "not found"}
    return info


@app.post("/api/providers/{provider_id}/key")
async def save_key(provider_id: str, payload: dict):
    from app.providers import save_key as sk

    key = payload.get("key", "")
    sk(provider_id, key)
    return {"saved": True}


@app.delete("/api/providers/{provider_id}/key")
async def delete_key(provider_id: str):
    from app.providers import save_key as sk

    sk(provider_id, "")
    return {"saved": True}
