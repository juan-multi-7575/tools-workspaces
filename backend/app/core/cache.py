from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app import paths
from app.registry import get
from app.tools.base import Artifact, PortKind


def _significant_params(params: dict[str, Any]) -> dict[str, Any]:
    """Extract params that affect output identity; ignore transient paths/urls that are handled separately."""
    ignore = {"url", "link", "input_path", "file", "input_file", "video_path", "audio_path", "file_path", "path", "input_pdf"}
    return {k: v for k, v in params.items() if k not in ignore and v not in (None, "", [])}


def _params_compatible(cached_params: dict[str, Any], current_params: dict[str, Any]) -> bool:
    """Require all significant current params to equal cached params. Allows cached to have extra defaults, but not mismatched core settings."""
    if not current_params:
        return True
    sig_current = _significant_params(current_params)
    if not sig_current:
        return True
    sig_cached = _significant_params(cached_params)
    for k, v in sig_current.items():
        # Strict equality; if cached missing or differs, not a valid reuse
        if sig_cached.get(k) != v:
            return False
    return True


def detect_existing_artifacts(workspace_id: str, nodes: list[dict[str, Any]], params_by_node: dict[str, dict[str, Any]]) -> dict[str, Any]:
    """Inspects workspace runs and media to find existing matching outputs for input nodes.
    Supports:
    - URL inputs (YouTube / media downloads): checks if same URL or media title already downloaded.
    - File inputs (audio, video, subtitles, documents): checks if downstream derived files already exist.
    Now filesystem-verified and param-sensitive: only completed artifacts whose files still exist on disk
    AND whose significant params (task, target_lang, provider, output_format, etc.) match are considered.
    """
    matches: list[dict[str, Any]] = []
    has_existing = False

    runs_dir = paths.workspace_runs_dir(workspace_id)

    # 1. Collect all completed runs and existing artifacts in this workspace — verified on disk
    workspace_artifacts: list[dict[str, Any]] = []
    if runs_dir.exists():
        for r_path in runs_dir.iterdir():
            if not r_path.is_dir():
                continue
            mfile = r_path / "manifest.json"
            if not mfile.exists():
                continue
            try:
                mdata = json.loads(mfile.read_text(encoding="utf-8"))
            except Exception:
                continue
            if mdata.get("status") != "completed":
                continue

            art_dir = r_path / "artifacts"
            target_dir = art_dir if art_dir.exists() else r_path
            for f in target_dir.iterdir():
                if f.is_file() and f.name != "manifest.json" and not f.name.endswith((".part", ".ytd")):
                    # Verify file actually exists and has content (guards manual rm)
                    try:
                        if not f.exists() or f.stat().st_size == 0:
                            continue
                        # Resolve symlink target existence as well
                        if f.is_symlink() and not f.resolve().exists():
                            continue
                    except Exception:
                        continue
                    workspace_artifacts.append({
                        "name": f.name,
                        "path": str(f),
                        "size": f.stat().st_size,
                        "run_id": r_path.name,
                        "tool_id": mdata.get("tool_id"),
                        "params": mdata.get("params", {}),
                        "status": mdata.get("status"),
                    })

    # 2. Match each node's inputs against existing artifacts
    for node in nodes:
        node_id = node.get("id") or ""
        tool_id = node.get("tool_id") or ""
        node_params = {**node.get("params", {}), **params_by_node.get(node_id, {})}

        matched_items: list[dict[str, Any]] = []

        # Case A: Tool takes a URL (e.g. downloader, streamlink, web scraper)
        url = node_params.get("url") or node_params.get("link")
        if url:
            for art in workspace_artifacts:
                # Re-verify file still exists (handles race between scan and check)
                p = Path(art["path"])
                if not p.exists() or p.stat().st_size == 0:
                    continue
                art_url = art.get("params", {}).get("url") or art.get("params", {}).get("link")
                if art_url and str(art_url).strip() == str(url).strip() and art.get("status") == "completed":
                    # For downloader, param match is lenient (different format_preset intentionally creates different artifacts via separate runs, but we still allow reuse for same url)
                    # For translatable steps, enforce strict match — handled in Case B/tool-specific cache
                    if art.get("tool_id") == tool_id and not _params_compatible(art.get("params", {}), node_params):
                        continue
                    matched_items.append(art)

        # Case B: Tool takes an input_path or file (e.g. audio_processor, transcriber, translator)
        input_path = node_params.get("input_path") or node_params.get("file") or node_params.get("input_file")
        if input_path:
            input_stem = Path(str(input_path)).stem.lower()
            for art in workspace_artifacts:
                p = Path(art["path"])
                if not p.exists() or p.stat().st_size == 0:
                    continue
                art_input = (
                    art.get("params", {}).get("input_path")
                    or art.get("params", {}).get("file")
                    or art.get("params", {}).get("input_file")
                )
                matched = False
                if art_input and str(art_input).strip() == str(input_path).strip() and art.get("status") == "completed":
                    matched = True
                elif input_stem and Path(art["name"]).stem.lower() == input_stem and art.get("tool_id") == tool_id and art.get("status") == "completed":
                    matched = True
                if matched:
                    if not _params_compatible(art.get("params", {}), node_params):
                        continue
                    matched_items.append(art)

        if matched_items:
            has_existing = True
            unique_matches = {}
            for item in matched_items:
                unique_matches[item["name"]] = item
            matches.append({
                "node_id": node_id,
                "tool_id": tool_id,
                "artifacts": list(unique_matches.values()),
                "summary": f"{len(unique_matches)} existing artifact(s) found for {tool_id}",
            })

    return {
        "has_existing": has_existing,
        "matches": matches,
    }


def find_cached_artifacts_for_node(
    workspace_id: str,
    tool_id: str,
    params: dict[str, Any],
) -> list[Artifact] | None:
    """Check if valid cached artifacts exist for a given tool execution."""
    res = detect_existing_artifacts(workspace_id, [{"id": "check", "tool_id": tool_id, "params": params}], {"check": params})
    if not res["has_existing"] or not res["matches"]:
        return None

    artifacts_info = res["matches"][0].get("artifacts", [])
    if not artifacts_info:
        return None

    cached_artifacts: list[Artifact] = []
    for info in artifacts_info:
        p = Path(info["path"])
        if p.exists() and p.is_file() and p.stat().st_size > 0:
            cached_artifacts.append(Artifact(path=str(p), name=p.name, kind=PortKind.any))

    return cached_artifacts if cached_artifacts else None
