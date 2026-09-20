from __future__ import annotations

import asyncio
import uuid
from typing import Any, Callable, Awaitable
from pathlib import Path

from app.core.dag import DAGPipelineSpec, validate_dag
from app.core.cache import find_cached_artifacts_for_node
from app import paths
from app.paths import run_dir
from app.registry import get
from app.tools.base import Artifact, ToolResult, ToolRunContext
from app.workspaces import save_run_meta


# Global registry of active pipeline execution events per workspace
ACTIVE_PIPELINE_EVENTS: dict[str, asyncio.Event] = {}


def stop_dag_pipeline(workspace_id: str) -> bool:
    """Signals cancellation to any currently running DAG pipeline in the workspace."""
    event = ACTIVE_PIPELINE_EVENTS.get(workspace_id)
    if event and not event.is_set():
        event.set()
        return True
    return False


async def execute_dag_pipeline(
    workspace_id: str,
    spec: DAGPipelineSpec,
    max_concurrency: int = 4,
    progress_callback: Callable[[dict[str, Any]], Awaitable[None]] | None = None,
) -> list[dict[str, Any]]:
    """Executes a validated DAG pipeline with concurrent branch scheduling,
    artifact routing, real-time event streaming, cancellation support,
    and smart input reuse / caching.
    """
    val = validate_dag(spec)
    if not val.valid:
        raise ValueError(val.error or "Invalid DAG pipeline")

    node_map = {n.id: n for n in spec.nodes}
    edges_from: dict[str, list[str]] = {n.id: [] for n in spec.nodes}
    edges_to: dict[str, list[str]] = {n.id: [] for n in spec.nodes}

    for edge in spec.edges:
        edges_from[edge.source_node].append(edge.target_node)
        edges_to[edge.target_node].append(edge.source_node)

    in_degrees: dict[str, int] = {n.id: len(edges_to[n.id]) for n in spec.nodes}
    results: dict[str, dict[str, Any]] = {}
    artifacts_by_node: dict[str, list[Artifact]] = {}
    node_status: dict[str, str] = {n.id: "pending" for n in spec.nodes}

    pipeline_run_id = f"pipe-{uuid.uuid4().hex[:8]}"
    try:
        tool_names = [get(node_map[nid].tool_id).manifest.name.split(" (")[0] for nid in val.topological_order]
        pipeline_name = " ➔ ".join(tool_names)
    except Exception:
        pipeline_name = "Custom Pipeline"

    bundle_context: dict[str, Any] = {"name": None}

    semaphore = asyncio.Semaphore(max_concurrency)
    cancel_all_event = asyncio.Event()
    ACTIVE_PIPELINE_EVENTS[workspace_id] = cancel_all_event

    async def _emit_event(event_type: str, data: dict[str, Any]) -> None:
        if progress_callback:
            try:
                await progress_callback({"type": event_type, "pipeline_run_id": pipeline_run_id, **data})
            except Exception:
                pass

    async def _execute_node(node_id: str) -> bool:
        if cancel_all_event.is_set():
            node_status[node_id] = "cancelled"
            await _emit_event("node_skipped", {
                "node_id": node_id,
                "tool_id": node_map[node_id].tool_id,
                "reason": "Pipeline stopped or cancelled",
            })
            return False

        node = node_map[node_id]
        tool = get(node.tool_id)
        params = dict(node.params or {})

        # Wire inputs from upstream dependencies
        for upstream_id in edges_to[node_id]:
            upstream_arts = artifacts_by_node.get(upstream_id, [])
            for art in upstream_arts:
                params.setdefault(tool.input_param, art.path)
                break

        run_id = uuid.uuid4().hex[:12]
        dest = run_dir(workspace_id, run_id)
        node_status[node_id] = "running"
        await _emit_event("node_started", {
            "node_id": node_id,
            "tool_id": tool.manifest.id,
            "tool_name": tool.manifest.name,
        })

        # 1. Smart Cache / Reuse Check (if enabled)
        cached_arts = None
        if getattr(spec, "cache_policy", "recompute") == "reuse":
            try:
                cached_arts = find_cached_artifacts_for_node(workspace_id, tool.manifest.id, params)
            except Exception:
                cached_arts = None

        if cached_arts:
            # Skip heavy execution and reuse existing artifacts directly
            res = ToolResult(artifacts=cached_arts, status="completed", duration_seconds=0.0)
            is_cached = True
        else:
            is_cached = False
            ctx = ToolRunContext(
                kind="workspace",
                destination=str(dest),
                workspace_id=workspace_id,
                run_id=run_id,
                params=params,
                cancel_event=cancel_all_event,
            )

            async with semaphore:
                if cancel_all_event.is_set():
                    node_status[node_id] = "cancelled"
                    await _emit_event("node_skipped", {
                        "node_id": node_id,
                        "tool_id": tool.manifest.id,
                        "reason": "Pipeline stopped or cancelled",
                    })
                    return False
                try:
                    res = await tool.execute(ctx)
                except Exception as e:
                    res = ToolResult(artifacts=[], status="failed", error=str(e))

        # Auto-group related outputs into clean project/video folder on disk
        if res.artifacts:
            if not bundle_context["name"]:
                for a in res.artifacts:
                    art_path = Path(a.path)
                    if art_path.suffix.lower() in (".mp4", ".mkv", ".webm", ".mov", ".wav", ".mp3"):
                        bundle_context["name"] = art_path.stem
                        break
                if not bundle_context["name"]:
                    bundle_context["name"] = Path(res.artifacts[0].path).stem

            if bundle_context["name"]:
                media_folder = paths.workspace_media_dir(workspace_id, bundle_context["name"])
                for a in res.artifacts:
                    src_art = Path(a.path)
                    target_file = media_folder / src_art.name
                    if src_art.exists() and not target_file.exists():
                        try:
                            target_file.symlink_to(src_art)
                        except Exception:
                            try:
                                import shutil
                                shutil.copy2(src_art, target_file)
                            except Exception:
                                pass

        record = {
            "id": run_id,
            "run_id": run_id,
            "pipeline_run_id": pipeline_run_id,
            "pipeline_name": pipeline_name,
            "bundle_name": bundle_context["name"],
            "node_id": node_id,
            "tool_id": tool.manifest.id,
            "status": res.status,
            "error": res.error,
            "params": params,
            "artifacts": [a.model_dump() for a in res.artifacts],
            "duration_seconds": res.duration_seconds,
            "cached": is_cached,
        }

        save_run_meta(workspace_id, run_id, record)
        results[node_id] = record
        artifacts_by_node[node_id] = res.artifacts
        node_status[node_id] = res.status

        if res.status != "completed":
            await _emit_event("node_failed", {
                "node_id": node_id,
                "tool_id": tool.manifest.id,
                "error": res.error or "Tool execution failed",
                "duration": res.duration_seconds,
            })
            if spec.error_policy == "fail_fast":
                cancel_all_event.set()
            return False

        await _emit_event("node_completed", {
            "node_id": node_id,
            "tool_id": tool.manifest.id,
            "duration": res.duration_seconds,
            "artifacts": [a.model_dump() for a in res.artifacts],
            "cached": is_cached,
        })
        return True

    running_tasks: dict[str, asyncio.Task[bool]] = {}
    ready_queue: list[str] = [n_id for n_id, deg in in_degrees.items() if deg == 0]

    def _mark_downstream_skipped(failed_id: str):
        queue = list(edges_from[failed_id])
        while queue:
            curr = queue.pop(0)
            if node_status[curr] == "pending":
                node_status[curr] = "skipped"
                results[curr] = {
                    "id": f"skipped-{curr}",
                    "run_id": f"skipped-{curr}",
                    "node_id": curr,
                    "tool_id": node_map[curr].tool_id,
                    "status": "skipped",
                    "error": f"Skipped due to upstream failure in '{failed_id}'",
                    "params": node_map[curr].params,
                    "artifacts": [],
                }
                queue.extend(edges_from[curr])

    try:
        while ready_queue or running_tasks:
            while ready_queue:
                next_id = ready_queue.pop(0)
                if node_status[next_id] == "pending":
                    if cancel_all_event.is_set():
                        node_status[next_id] = "cancelled"
                        results[next_id] = {
                            "id": f"skipped-{next_id}",
                            "run_id": f"skipped-{next_id}",
                            "node_id": next_id,
                            "tool_id": node_map[next_id].tool_id,
                            "status": "cancelled",
                            "error": "Pipeline stopped by user or halted due to error",
                            "params": node_map[next_id].params,
                            "artifacts": [],
                        }
                        await _emit_event("node_skipped", {
                            "node_id": next_id,
                            "tool_id": node_map[next_id].tool_id,
                            "reason": "Pipeline stopped or cancelled",
                        })
                        continue
                    task = asyncio.create_task(_execute_node(next_id))
                    running_tasks[next_id] = task

            if not running_tasks:
                break

            done, _ = await asyncio.wait(
                running_tasks.values(),
                return_when=asyncio.FIRST_COMPLETED,
            )

            completed_ids = [nid for nid, t in running_tasks.items() if t in done]
            for cid in completed_ids:
                task = running_tasks.pop(cid)
                success = task.result()

                if success:
                    for downstream in edges_from[cid]:
                        in_degrees[downstream] -= 1
                        if in_degrees[downstream] == 0 and node_status[downstream] == "pending":
                            ready_queue.append(downstream)
                else:
                    if spec.error_policy == "fail_fast":
                        for rem_id in spec.nodes:
                            nid = rem_id.id
                            if node_status[nid] == "pending":
                                node_status[nid] = "skipped"
                                results[nid] = {
                                    "id": f"skipped-{nid}",
                                    "run_id": f"skipped-{nid}",
                                    "node_id": nid,
                                    "tool_id": node_map[nid].tool_id,
                                    "status": "skipped",
                                    "error": f"Pipeline halted due to failure in '{cid}'",
                                    "params": node_map[nid].params,
                                    "artifacts": [],
                                }
                                await _emit_event("node_skipped", {
                                    "node_id": nid,
                                    "tool_id": node_map[nid].tool_id,
                                    "reason": f"Pipeline halted due to failure in '{cid}'",
                                })
                    elif spec.error_policy == "branch_pruning":
                        _mark_downstream_skipped(cid)
    finally:
        ACTIVE_PIPELINE_EVENTS.pop(workspace_id, None)

    ordered_results: list[dict[str, Any]] = []
    for node_id in val.topological_order:
        if node_id in results:
            ordered_results.append(results[node_id])
        else:
            fallback_rec = {
                "id": f"skipped-{node_id}",
                "run_id": f"skipped-{node_id}",
                "node_id": node_id,
                "tool_id": node_map[node_id].tool_id,
                "status": "cancelled" if cancel_all_event.is_set() else "skipped",
                "error": "Pipeline halted before node execution",
                "params": node_map[node_id].params,
                "artifacts": [],
            }
            results[node_id] = fallback_rec
            ordered_results.append(fallback_rec)

    return ordered_results
