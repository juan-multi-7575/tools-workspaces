from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError
from app.errors import public_error, unexpected_error, stream_public_data

import asyncio
import json
from pathlib import Path
from typing import Any

import app.tools  # noqa: F401 - registers tool drivers
from app.core.dag import DAGPipelineSpec, validate_dag
from app.core.scheduler import execute_dag_pipeline, stop_dag_pipeline, ACTIVE_PIPELINE_EVENTS
from app.core.cache import detect_existing_artifacts
from app.core.canvas import get_workspace_canvas, save_workspace_canvas, reset_workspace_canvas
from app.deps import check_dependencies, upgrade_package
from app.download_manager import get_manager
from app.remote import get_token, regenerate_token
from app import paths
from app.paths import ensure_layout, run_dir, workspace_runs_dir, workspace_root
from app.pipeline import run_pipeline, validate_chain
from app.registry import get, list_manifests
from app.settings_store import load_settings, save_settings
from app.tools.base import ToolRunContext
from app.workspaces import (
    artifact_path,
    create_workspace,
    delete_artifact,
    delete_workspace_media_file,
    delete_run,
    delete_workspace,
    export_workspace_zip,
    list_templates,
    save_template,
    delete_template,
    trim_artifact,
    list_artifacts as list_ws_artifacts,
    list_workspaces,
    list_runs,
    list_workspace_media,
    list_pipeline_runs,
    mux_subtitles_to_video,
    get_run_logs,
    get_run_manifest,
    branch_from_run,
)
from fastapi.responses import FileResponse, StreamingResponse


async def _background_dep_check(app: FastAPI):
    loop = asyncio.get_running_loop()
    try:
        deps = await loop.run_in_executor(None, check_dependencies)
        app.state.dep_check = deps
    except Exception:
        pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_layout()
    mgr = get_manager()
    settings = load_settings()
    mgr.set_max_concurrent(settings["download"]["max_concurrent"])
    regenerate_token()
    app.state.dep_check = check_dependencies(index=lambda u: None)
    task = asyncio.create_task(mgr.start())
    bg_dep_task = asyncio.create_task(_background_dep_check(app))
    yield
    bg_dep_task.cancel()
    task.cancel()


from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Multi-Tool Platform", version="0.1.0", lifespan=lifespan)
STREAM_HEARTBEAT_SECONDS = 15.0
ACTIVE_ROUTE_PIPELINES: set[str] = set()


def reserve_pipeline(workspace_id: str):
    # Check and reserve before yielding to another request.
    if workspace_id in ACTIVE_ROUTE_PIPELINES or workspace_id in ACTIVE_PIPELINE_EVENTS:
        raise HTTPException(status_code=409, detail=public_error("PIPELINE_ALREADY_RUNNING", "A pipeline is already running in this workspace. Reconnect to check its status or stop it."))
    ACTIVE_ROUTE_PIPELINES.add(workspace_id)


@app.get("/api/workspaces/{workspace_id}/pipeline/status")
async def pipeline_status(workspace_id: str):
    return {"active": workspace_id in ACTIVE_ROUTE_PIPELINES or workspace_id in ACTIVE_PIPELINE_EVENTS}


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": app.version}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/tools")
async def list_tools():
    return {"tools": list_manifests()}


@app.get("/api/tools/{tool_id}")
async def get_tool(tool_id: str):
    manifest = get(tool_id).manifest
    return manifest.model_dump()


@app.post("/api/workspaces")
async def create(payload: dict):
    name = (payload or {}).get("name", "Untitled")
    if not str(name or "").strip():
        raise HTTPException(status_code=422, detail="Workspace name must not be empty.")
    try:
        ws = create_workspace(name)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
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


@app.get("/api/tools/ai_model_health_check/providers")
async def get_detected_model_providers():
    from app.tools.model_health_tool import get_detected_providers_summary
    return {"providers": get_detected_providers_summary()}


@app.get("/api/tools/ai_model_health_check/models")
async def get_provider_models(provider: str = "openai", api_key: str | None = None):
    from app.tools.model_health_tool import fetch_provider_models
    return await fetch_provider_models(provider, api_key=api_key)


@app.get("/api/tools/downloader/info")
async def get_downloader_media_info(url: str):
    if not url or not url.strip():
        raise HTTPException(status_code=400, detail="URL is required")
    clean_url = url.strip()

    import urllib.request
    import urllib.parse

    # 1. Rapid oEmbed for YouTube links (<100ms)
    if "youtube.com" in clean_url or "youtu.be" in clean_url:
        oembed_url = f"https://www.youtube.com/oembed?url={urllib.parse.quote(clean_url)}&format=json"
        try:
            req = urllib.request.Request(oembed_url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=3.5) as resp:
                if resp.status == 200:
                    data = json.loads(resp.read().decode("utf-8"))
                    return {
                        "title": data.get("title"),
                        "author_name": data.get("author_name"),
                        "thumbnail_url": data.get("thumbnail_url"),
                        "provider_name": data.get("provider_name", "YouTube"),
                    }
        except Exception:
            pass

    # 2. Fallback to lightweight yt-dlp metadata extraction
    try:
        cmd = ["yt-dlp", "--dump-single-json", "--flat-playlist", "--no-download", clean_url]
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=5.0)
        if proc.returncode == 0 and stdout:
            info = json.loads(stdout.decode("utf-8"))
            return {
                "title": info.get("title"),
                "author_name": info.get("uploader") or info.get("channel"),
                "thumbnail_url": info.get("thumbnail"),
                "duration": info.get("duration"),
                "provider_name": info.get("extractor_key") or "Media",
            }
    except Exception:
        pass

    return {"title": None}


@app.post("/api/tools/{tool_id}/execute")
async def execute_tool(tool_id: str, payload: dict):
    tool = get(tool_id)
    params = payload.get("params", {})
    if isinstance(params, dict) and tool.manifest.parameters_schema:
        for k, v in tool.manifest.parameters_schema.items():
            if isinstance(v, dict) and "default" in v and (k not in params or params[k] is None or params[k] == ""):
                params[k] = v["default"]
        payload["params"] = params

    context = ToolRunContext(**payload)
    result = await tool.execute(context)
    res_dict = result.model_dump()
    if not res_dict.get("data") and not res_dict.get("output_text"):
        for art in result.artifacts:
            p = Path(art.path)
            if p.exists() and p.is_file() and p.stat().st_size < 500_000:
                if p.suffix == ".json":
                    try:
                        res_dict["data"] = json.loads(p.read_text(encoding="utf-8"))
                        break
                    except Exception:
                        pass
                elif p.suffix in (".txt", ".md", ".log", ".html"):
                    try:
                        res_dict["output_text"] = p.read_text(encoding="utf-8")
                        break
                    except Exception:
                        pass
    return stream_public_data(res_dict)


@app.get("/api/artifacts/content")
async def get_artifact_content(path: str):
    p = Path(path).resolve()
    if not p.exists() or not p.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    if p.suffix in (".json", ".txt", ".md", ".log", ".html", ".csv"):
        text = p.read_text(encoding="utf-8", errors="replace")
        return {"content": text, "name": p.name, "size": p.stat().st_size, "kind": p.suffix.replace(".", "")}
    return FileResponse(p)


@app.get("/api/artifacts/recent")
async def get_recent_artifacts():
    """List recent media, subtitles, and document artifacts across workspaces and downloads."""
    out = []
    ws_base = paths.workspaces_dir()
    if ws_base.exists():
        for f in ws_base.glob("*/runs/*/artifacts/*"):
            if f.is_file() and f.name != "manifest.json":
                out.append({
                    "name": f.name,
                    "path": str(f.resolve()),
                    "kind": f.suffix.replace(".", "").lower() or "file",
                    "size": f.stat().st_size,
                    "mtime": f.stat().st_mtime,
                })
    dl_base = paths.downloads_dir()
    if dl_base.exists():
        for f in dl_base.glob("*/*"):
            if f.is_file() and not f.name.endswith(".part"):
                out.append({
                    "name": f.name,
                    "path": str(f.resolve()),
                    "kind": f.suffix.replace(".", "").lower() or "file",
                    "size": f.stat().st_size,
                    "mtime": f.stat().st_mtime,
                })
    up_base = paths.uploads_dir()
    if up_base.exists():
        for f in up_base.glob("*"):
            if f.is_file():
                out.append({
                    "name": f.name,
                    "path": str(f.resolve()),
                    "kind": f.suffix.replace(".", "").lower() or "file",
                    "size": f.stat().st_size,
                    "mtime": f.stat().st_mtime,
                })
    out.sort(key=lambda x: x["mtime"], reverse=True)
    return {"artifacts": out[:60]}


@app.post("/api/upload")
async def upload_file(request: Request):
    """Upload any local file (e.g. subtitle, audio, video) and return its server path."""
    paths.UPLOADS.mkdir(parents=True, exist_ok=True)
    content_type = request.headers.get("content-type", "")
    filename = request.query_params.get("filename") or request.headers.get("x-filename")
    content = b""

    if "multipart/form-data" in content_type.lower():
        import email
        from email import policy
        body = await request.body()
        msg_header = f"Content-Type: {content_type}\r\n\r\n".encode("utf-8")
        msg = email.message_from_bytes(msg_header + body, policy=policy.default)
        for part in msg.walk():
            part_filename = part.get_filename()
            if part_filename:
                filename = part_filename
                payload = part.get_payload(decode=True)
                if payload is not None:
                    content = payload
                break
    else:
        content = await request.body()

    if not filename:
        import uuid
        filename = f"upload_{uuid.uuid4().hex[:8]}"

    from urllib.parse import unquote
    filename = Path(unquote(filename)).name
    dest = paths.UPLOADS / filename
    dest.write_bytes(content)

    return {
        "name": filename,
        "path": str(dest.resolve()),
        "size": len(content),
        "kind": dest.suffix.replace(".", "").lower() or "file",
    }




@app.post("/api/workspaces/{workspace_id}/pipeline/validate")
async def validate_pipeline(workspace_id: str, payload: dict):
    if "nodes" in payload:
        try:
            spec = DAGPipelineSpec(**payload)
            val = validate_dag(spec)
            return {"valid": val.valid, "error": val.error, "topological_order": val.topological_order}
        except Exception as e:
            unexpected_error(e)
            return {"valid": False, "error": "Invalid pipeline specification."}

    tool_ids = payload.get("chain", [])
    valid, error = validate_chain(tool_ids)
    return {"valid": valid, "error": error}


@app.post("/api/workspaces/{workspace_id}/pipeline/run")
async def run_workspace_pipeline(workspace_id: str, payload: dict):
    reserve_pipeline(workspace_id)
    try:
        if "nodes" in payload:
            spec = DAGPipelineSpec(**payload)
            results = await execute_dag_pipeline(workspace_id, spec)
            return {"results": stream_public_data(results)}

        steps = payload.get("steps", [])
        pipeline_name = payload.get("pipeline_name")
        visibility = payload.get("visibility", "success")
        preset_id = payload.get("preset_id")
        results = await run_pipeline(workspace_id, steps, pipeline_name=pipeline_name, visibility=visibility, preset_id=preset_id)
        return {"results": stream_public_data(results)}
    finally:
        ACTIVE_ROUTE_PIPELINES.discard(workspace_id)


@app.post("/api/workspaces/{workspace_id}/pipeline/run-stream")
async def run_workspace_pipeline_stream(workspace_id: str, payload: dict):
    """Executes DAG pipeline and streams node lifecycle events via Server-Sent Events (SSE)."""
    if "nodes" not in payload:
        raise HTTPException(status_code=400, detail="'nodes' specification required for streaming pipeline")

    try:
        spec = DAGPipelineSpec(**payload)
    except ValidationError:
        raise HTTPException(status_code=422, detail=public_error("INVALID_PIPELINE", "Invalid pipeline specification."))
    reserve_pipeline(workspace_id)
    event_queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=256)
    connected = True

    async def enqueue(evt: dict[str, Any]):
        if not connected:
            return
        if event_queue.full():
            event_queue.get_nowait()
        event_queue.put_nowait(evt)

    async def _progress_cb(evt: dict[str, Any]):
        await enqueue(stream_public_data(evt))

    async def run_task():
        try:
            results = await execute_dag_pipeline(workspace_id, spec, progress_callback=_progress_cb)
            # Check if any step failed to determine overall status
            any_failed = any(r.get("status") == "failed" for r in results)
            await enqueue({
                "type": "pipeline_finished",
                "status": "failed" if any_failed else "completed",
                "results": stream_public_data(results),
            })
        except Exception as e:
            await enqueue({
                "type": "pipeline_error",
                "status": "failed",
                "error": unexpected_error(e),
            })
        finally:
            ACTIVE_ROUTE_PIPELINES.discard(workspace_id)

    # Start background execution
    execution_task = asyncio.create_task(run_task())
    # Keep execution alive on transport loss, so reconnect/Stop can inspect it.
    tasks = getattr(app.state, "pipeline_stream_tasks", set())
    app.state.pipeline_stream_tasks = tasks
    tasks.add(execution_task)
    execution_task.add_done_callback(tasks.discard)

    async def event_generator():
        nonlocal connected
        try:
            while True:
                try:
                    msg = await asyncio.wait_for(event_queue.get(), timeout=STREAM_HEARTBEAT_SECONDS)
                except asyncio.TimeoutError:
                    yield ": heartbeat\n\n"
                    continue
                yield f"data: {json.dumps(msg)}\n\n"
                if msg.get("type") in ("pipeline_finished", "pipeline_error"):
                    break
        finally:
            connected = False

    return StreamingResponse(event_generator(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/workspaces/{workspace_id}/pipeline/check-existing")
async def check_pipeline_existing(workspace_id: str, payload: dict):
    """Inspects pipeline nodes to detect if any inputs or derived artifacts already exist in this workspace."""
    nodes = payload.get("nodes", [])
    params_by_node = payload.get("params_by_node", {})
    return detect_existing_artifacts(workspace_id, nodes, params_by_node)


@app.post("/api/workspaces/{workspace_id}/pipeline/stop")
async def stop_pipeline_route(workspace_id: str):
    """Stops and cancels the currently running DAG pipeline in this workspace."""
    stopped = stop_dag_pipeline(workspace_id)
    return {"stopped": stopped}


@app.post("/api/workspaces/{workspace_id}/pipeline/resolve-url")
async def resolve_pipeline_url(workspace_id: str, payload: dict):
    """Pre-run URL check: validate syntax and fetch title/duration metadata without downloading."""
    from app.tools.downloader import resolve_media_url

    url = (payload or {}).get("url", "")
    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(None, resolve_media_url, url)
    if result.get("error"):
        result["error"] = public_error(result.pop("error_code", "URL_RESOLUTION_FAILED"), result["error"])
    return result


@app.get("/api/workspaces/{workspace_id}/canvas")
async def get_workspace_canvas_route(workspace_id: str):
    """Get persisted canvas nodes, edges, positions and params for this workspace session."""
    return get_workspace_canvas(workspace_id)


@app.put("/api/workspaces/{workspace_id}/canvas")
async def save_workspace_canvas_route(workspace_id: str, payload: dict):
    """Persist the current canvas state (nodes, edges, parameters, viewport) for this workspace."""
    return save_workspace_canvas(workspace_id, payload)


@app.post("/api/workspaces/{workspace_id}/canvas/reset")
async def reset_workspace_canvas_route(workspace_id: str):
    """Reset the canvas state for this workspace session."""
    return reset_workspace_canvas(workspace_id)


@app.get("/api/workspaces/{workspace_id}/templates")
async def get_templates(workspace_id: str, starters: bool = False):
    return {"templates": list_templates(workspace_id, include_starters=starters)}


@app.post("/api/workspaces/{workspace_id}/templates")
async def create_template(workspace_id: str, payload: dict):
    name = payload.get("name", "template")
    chain = payload.get("chain", [])
    return save_template(workspace_id, name, chain)


@app.delete("/api/workspaces/{workspace_id}/templates/{template_name}")
async def remove_template(workspace_id: str, template_name: str):
    return {"ok": delete_template(workspace_id, template_name)}


@app.get("/api/workspaces/{workspace_id}/runs")
async def get_runs(workspace_id: str):
    return {"runs": list_runs(workspace_id)}


@app.get("/api/workspaces/{workspace_id}/pipeline-runs")
async def get_pipeline_runs(workspace_id: str):
    return {"pipeline_runs": list_pipeline_runs(workspace_id)}


@app.get("/api/workspaces/{workspace_id}/media")
async def get_workspace_media_route(workspace_id: str):
    return list_workspace_media(workspace_id)


@app.post("/api/workspaces/{workspace_id}/mux-subtitles")
async def mux_subtitles_route(workspace_id: str, payload: dict):
    video_path = payload.get("video_path")
    subtitle_path = payload.get("subtitle_path")
    if not video_path or not subtitle_path:
        raise HTTPException(status_code=400, detail="video_path and subtitle_path are required")
    burn_in = bool(payload.get("burn_in", False))
    output_name = payload.get("output_name")
    try:
        res = mux_subtitles_to_video(workspace_id, video_path, subtitle_path, output_name, burn_in)
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=unexpected_error(e))


@app.get("/api/workspaces/{workspace_id}/runs/{run_id}/manifest")
async def get_run_manifest_route(workspace_id: str, run_id: str):
    manifest = get_run_manifest(workspace_id, run_id)
    if manifest is None:
        raise HTTPException(status_code=404, detail="Run manifest not found")
    return {"manifest": manifest}


@app.get("/api/workspaces/{workspace_id}/runs/{run_id}/logs")
async def get_run_logs_route(workspace_id: str, run_id: str):
    return {"logs": get_run_logs(workspace_id, run_id)}


@app.post("/api/workspaces/{workspace_id}/runs/{run_id}/branch")
async def branch_run_route(workspace_id: str, run_id: str):
    if get_run_manifest(workspace_id, run_id) is None:
        raise HTTPException(status_code=404, detail=public_error("RUN_NOT_FOUND", "Run not found."))
    return branch_from_run(workspace_id, run_id)


@app.get("/api/workspaces/{workspace_id}/runs/{run_id}/artifacts/{artifact_name}/preview")
async def preview_artifact(workspace_id: str, run_id: str, artifact_name: str):
    target = artifact_path(workspace_id, run_id, artifact_name)
    if target is None:
        raise HTTPException(status_code=404, detail=public_error("ARTIFACT_NOT_FOUND", "Requested resource not found."))
    return FileResponse(target)


@app.get("/api/workspaces/{workspace_id}/runs/{run_id}/artifacts/{artifact_name}/download")
async def download_artifact(workspace_id: str, run_id: str, artifact_name: str):
    target = artifact_path(workspace_id, run_id, artifact_name)
    if target is None:
        raise HTTPException(status_code=404, detail=public_error("ARTIFACT_NOT_FOUND", "Requested resource not found."))
    return FileResponse(target, filename=target.name, media_type="application/octet-stream")


@app.delete("/api/workspaces/{workspace_id}/runs/{run_id}/artifacts/{artifact_name}")
async def delete_artifact_route(workspace_id: str, run_id: str, artifact_name: str):
    return {"deleted": delete_artifact(workspace_id, run_id, artifact_name)}


@app.delete("/api/workspaces/{workspace_id}/media/{filename}")
async def delete_workspace_media_route(workspace_id: str, filename: str):
    """Deletes a media item and its corresponding symlinks/artifacts across the workspace."""
    return {"deleted": delete_workspace_media_file(workspace_id, filename)}


@app.post("/api/workspaces/{workspace_id}/runs/{run_id}/artifacts/{artifact_name}/trim")
async def trim_artifact_route(workspace_id: str, run_id: str, artifact_name: str, payload: dict):
    regions = payload.get("regions", [])
    produced = trim_artifact(workspace_id, run_id, artifact_name, regions)
    if produced is None:
        raise HTTPException(status_code=404, detail=public_error("ARTIFACT_NOT_FOUND", "Requested resource not found."))
    return {"artifacts": produced}


@app.delete("/api/workspaces/{workspace_id}/runs/{run_id}")
async def remove_run(workspace_id: str, run_id: str):
    return {"deleted": delete_run(workspace_id, run_id)}


@app.get("/api/workspaces/{workspace_id}/export")
async def export_workspace(workspace_id: str):
    zip_path = export_workspace_zip(workspace_id)
    return FileResponse(zip_path, filename=f"{workspace_id}-artifacts.zip", media_type="application/zip")


@app.get("/api/workspaces/{workspace_id}/pipeline_runs/{pipeline_run_id}/download")
async def download_pipeline_run(workspace_id: str, pipeline_run_id: str):
    from app.workspaces import export_pipeline_run_zip
    zip_path = export_pipeline_run_zip(workspace_id, pipeline_run_id)
    if not zip_path or not zip_path.exists():
        raise HTTPException(status_code=404, detail="Pipeline run not found or no artifacts")
    return FileResponse(zip_path, filename=f"{pipeline_run_id}.zip", media_type="application/zip")


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
        raise HTTPException(status_code=404, detail=public_error("ARTIFACT_NOT_FOUND", "Requested resource not found."))

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


@app.delete("/api/downloads/{task_id}")
async def remove_download_task(task_id: str):
    mgr = get_manager()
    ok = mgr.remove_task(task_id)
    return {"deleted": ok}


@app.delete("/api/downloads")
async def clear_download_history():
    mgr = get_manager()
    cleared = mgr.clear_history()
    return {"cleared": cleared}


@app.get("/api/remote/info")
async def remote_info(request: Request):
    base = str(request.base_url).rstrip("/")
    return {"token": get_token(), "connect_url": f"{base}/remote", "host": base}


@app.post("/api/remote/rotate")
async def remote_rotate():
    return {"token": regenerate_token()}


@app.post("/api/remote/downloads")
async def remote_enqueue(payload: dict):
    if payload.get("token") != get_token():
        raise HTTPException(status_code=403, detail="invalid token")
    params = {k: v for k, v in payload.items() if k != "token"}
    task = get_manager().enqueue(params)
    return {"id": task.id, "status": task.status}


@app.post("/api/remote/downloads/{task_id}/cancel")
async def remote_cancel(task_id: str, payload: dict):
    if payload.get("token") != get_token():
        raise HTTPException(status_code=403, detail="invalid token")
    return {"cancelled": get_manager().cancel(task_id)}


@app.get("/api/settings/download")
async def get_download_settings():
    mgr = get_manager()
    settings = load_settings()
    return {"max_concurrent": mgr.max_concurrent, "persisted": settings["download"]["max_concurrent"]}


@app.post("/api/settings/download")
async def update_download_settings(payload: dict):
    mgr = get_manager()
    if "max_concurrent" in payload:
        mgr.set_max_concurrent(payload["max_concurrent"])
        save_settings({"download": {"max_concurrent": mgr.max_concurrent}})
    return {"max_concurrent": mgr.max_concurrent}


@app.get("/api/settings/deps")
async def get_dep_status():
    return {"dependencies": getattr(app.state, "dep_check", [])}


@app.post("/api/settings/deps/check")
async def run_dep_check():
    app.state.dep_check = check_dependencies()
    return {"dependencies": app.state.dep_check}


@app.post("/api/settings/deps/update")
async def run_dep_update(payload: dict):
    package = payload.get("package")
    approved = payload.get("approved")
    channel = payload.get("channel", "stable")
    if not package or not approved:
        return {"ok": False, "error": "approval required"}
    try:
        res = upgrade_package(package, channel=channel)
    except TypeError:
        res = upgrade_package(package)
    app.state.dep_check = check_dependencies(index=lambda u: None)
    return res


@app.get("/api/settings/ytdlp")
async def get_ytdlp_settings():
    s = load_settings()
    return s.get("ytdlp", {})


@app.post("/api/settings/ytdlp")
async def update_ytdlp_settings(payload: dict):
    saved = save_settings({"ytdlp": payload})
    return saved.get("ytdlp", {})


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
        raise HTTPException(status_code=404, detail=public_error("ARTIFACT_NOT_FOUND", "Requested resource not found."))
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


from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from app.paths import ROOT

frontend_dist = ROOT / "frontend" / "dist"

@app.exception_handler(StarletteHTTPException)
async def spa_exception_handler(request: Request, exc: StarletteHTTPException):
    if exc.status_code == 404 and not request.url.path.startswith("/api") and frontend_dist.exists():
        index_file = frontend_dist / "index.html"
        if index_file.exists():
            return FileResponse(index_file)
    detail = exc.detail
    if not isinstance(detail, dict) or "code" not in detail:
        code = {400: "INVALID_REQUEST", 403: "FORBIDDEN", 404: "NOT_FOUND", 409: "CONFLICT", 422: "VALIDATION_ERROR"}.get(exc.status_code, "HTTP_ERROR")
        detail = public_error(code, str(detail) if exc.status_code < 500 else "An unexpected server error occurred.")
    return JSONResponse(status_code=exc.status_code, content={"error": detail})

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(status_code=422, content={"error": public_error("VALIDATION_ERROR", "The request contains invalid parameters.")})


@app.exception_handler(Exception)
async def unexpected_exception_handler(request: Request, exc: Exception):
    return JSONResponse(status_code=500, content={"error": unexpected_error(exc)})


if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")


