import json
import os
import shutil
import subprocess
import tempfile
import time
import zipfile
from pathlib import Path
from typing import Any

from app import paths


def create_workspace(name: str) -> dict[str, Any]:
    ws_id = _slugify(name)
    root = paths.workspace_root(ws_id)
    if (root / "meta.json").exists():
        raise ValueError(f"A workspace named '{name}' already exists.")
    root.mkdir(parents=True, exist_ok=True)
    meta = {"id": ws_id, "name": name, "templates": [], "runs": []}
    (root / "meta.json").write_text(json.dumps(meta, indent=2))
    return meta


def list_workspaces() -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    if not paths.WORKSPACES.exists():
        return out
    for p in paths.WORKSPACES.iterdir():
        if p.is_dir():
            meta_path = p / "meta.json"
            if meta_path.exists():
                entry = json.loads(meta_path.read_text())
            else:
                entry = {"id": p.name, "name": p.name, "templates": [], "runs": []}
            try:
                entry["pipeline_runs"] = len(list_pipeline_runs(p.name))
            except Exception:
                entry["pipeline_runs"] = 0
            out.append(entry)
    return out


def save_run_meta(workspace_id: str, run_id: str, record: dict[str, Any]) -> None:
    # 1. Atomic per-run manifest write
    run_folder = paths.workspace_runs_dir(workspace_id) / run_id
    run_folder.mkdir(parents=True, exist_ok=True)
    manifest_path = run_folder / "manifest.json"
    manifest_data = dict(record)
    manifest_data.setdefault("timestamp", time.time())
    manifest_path.write_text(json.dumps(manifest_data, indent=2))

    # 2. Workspace root summary update
    meta_path = paths.workspace_root(workspace_id) / "meta.json"
    if meta_path.exists():
        meta = json.loads(meta_path.read_text())
    else:
        meta = {"id": workspace_id, "name": workspace_id, "templates": [], "runs": []}
    runs = meta.setdefault("runs", [])
    for i, r in enumerate(runs):
        if r.get("id") == run_id:
            runs[i] = record
            break
    else:
        runs.append(record)
    meta_path.write_text(json.dumps(meta, indent=2))


DEFAULT_STARTER_TEMPLATES: list[dict[str, Any]] = [
    {
        "name": "🎬 Video to Subtitles (YouTube ➔ Audio Extractor ➔ Subtitles SRT)",
        "chain": ["media.download.yt-dlp", "audio_processor", "transcriber"],
    },
    {
        "name": "⚡ Direct Video to Subtitles (YouTube ➔ Subtitles SRT)",
        "chain": ["media.download.yt-dlp", "transcriber"],
    },
    {
        "name": "🎵 Video to Audio Extractor (YouTube ➔ WAV/MP3)",
        "chain": ["media.download.yt-dlp", "audio_processor"],
    },
    {
        "name": "📝 Video to Text Summary (YouTube ➔ Transcribe ➔ AI Summary)",
        "chain": ["media.download.yt-dlp", "transcriber", "text.translate.llm"],
    },
    {
        "name": "media.youtube_to_mp4",
        "preset_id": "media.youtube_to_mp4",
        "chain": [
            "media.download.resolve",
            "media.download.format_select",
            # NOTE: media.thumbnail.get is a branch alternative after format_select
            # (takes video input), not a linear step — subtitle.fetch outputs document.
            "media.subtitle.fetch",
        ],
    },
]


def list_templates(workspace_id: str, include_starters: bool = False) -> list[dict[str, Any]]:
    custom: list[dict[str, Any]] = []
    meta_path = paths.workspace_root(workspace_id) / "meta.json"
    if meta_path.exists():
        try:
            meta = json.loads(meta_path.read_text())
            custom = meta.get("templates", [])
        except Exception:
            pass
    if include_starters:
        custom_names = {t.get("name") for t in custom}
        starters = [t for t in DEFAULT_STARTER_TEMPLATES if t.get("name") not in custom_names]
        return starters + custom
    return custom


def save_template(workspace_id: str, name: str, chain: list[str]) -> dict[str, Any]:
    meta_path = paths.workspace_root(workspace_id) / "meta.json"
    if meta_path.exists():
        meta = json.loads(meta_path.read_text())
    else:
        meta = {"id": workspace_id, "name": workspace_id, "templates": [], "runs": []}
    templates = meta.setdefault("templates", [])
    template = {"name": name, "chain": chain}
    templates.append(template)
    meta_path.write_text(json.dumps(meta, indent=2))
    return template


def delete_template(workspace_id: str, name: str) -> bool:
    meta_path = paths.workspace_root(workspace_id) / "meta.json"
    if not meta_path.exists():
        return False
    meta = json.loads(meta_path.read_text())
    before = len(meta.get("templates", []))
    meta["templates"] = [t for t in meta.get("templates", []) if t.get("name") != name]
    if len(meta["templates"]) == before:
        return False
    meta_path.write_text(json.dumps(meta, indent=2))
    return True


def list_runs(workspace_id: str) -> list[dict[str, Any]]:
    runs_dir = paths.workspace_runs_dir(workspace_id)
    out: list[dict[str, Any]] = []
    if not runs_dir.exists():
        return out
    for run_path in runs_dir.iterdir():
        if run_path.is_dir():
            art_dir = run_path / "artifacts"
            target_dir = art_dir if art_dir.exists() else run_path
            artifacts = [
                {"name": p.name, "size": p.stat().st_size}
                for p in target_dir.iterdir()
                if p.is_file() and p.name != "manifest.json"
            ]
            run_item: dict[str, Any] = {
                "id": run_path.name,
                "artifacts": artifacts,
                "timestamp": run_path.stat().st_mtime,
            }
            manifest_file = run_path / "manifest.json"
            if manifest_file.exists():
                try:
                    mdata = json.loads(manifest_file.read_text())
                    run_item["tool_id"] = mdata.get("tool_id")
                    run_item["status"] = mdata.get("status")
                    run_item["error"] = mdata.get("error")
                    run_item["duration_seconds"] = mdata.get("duration_seconds")
                    run_item["pipeline_run_id"] = mdata.get("pipeline_run_id")
                    run_item["pipeline_name"] = mdata.get("pipeline_name")
                    run_item["visibility"] = mdata.get("visibility")
                    run_item["preset_id"] = mdata.get("preset_id")
                    if mdata.get("bundle_name"):
                        run_item["bundle_name"] = mdata.get("bundle_name")
                    if mdata.get("timestamp"):
                        run_item["timestamp"] = mdata.get("timestamp")
                    else:
                        run_item["timestamp"] = manifest_file.stat().st_mtime
                except Exception:
                    pass
            out.append(run_item)
    out.sort(key=lambda r: r.get("timestamp") or 0, reverse=True)
    return out


def list_artifacts(workspace_id: str, run_id: str) -> list[dict[str, Any]]:
    base = paths.run_dir(workspace_id, run_id)
    return [
        {"name": p.name, "path": str(p.relative_to(base)), "size": p.stat().st_size}
        for p in base.iterdir()
        if p.is_file() and p.name != "manifest.json"
    ]


def get_run_manifest(workspace_id: str, run_id: str) -> dict[str, Any] | None:
    run_folder = paths.workspace_runs_dir(workspace_id) / run_id
    manifest_file = run_folder / "manifest.json"
    if manifest_file.exists():
        try:
            return json.loads(manifest_file.read_text())
        except Exception:
            pass
    meta_path = paths.workspace_root(workspace_id) / "meta.json"
    if meta_path.exists():
        try:
            m = json.loads(meta_path.read_text())
            for r in m.get("runs", []):
                if r.get("id") == run_id or r.get("run_id") == run_id:
                    return r
        except Exception:
            pass
    return None


def branch_from_run(workspace_id: str, run_id: str) -> dict[str, Any]:
    manifest = get_run_manifest(workspace_id, run_id) or {}
    art_list = list_artifacts(workspace_id, run_id)
    base = paths.run_dir(workspace_id, run_id)
    full_artifacts = [
        {"name": a["name"], "path": str(base / a["name"]), "size": a["size"]}
        for a in art_list
    ]
    return {
        "run_id": run_id,
        "tool_id": manifest.get("tool_id"),
        "artifacts": full_artifacts,
        "params": manifest.get("params", {}),
    }


def get_run_logs(workspace_id: str, run_id: str) -> str:
    run_folder = paths.workspace_runs_dir(workspace_id) / run_id
    art_folder = paths.run_dir(workspace_id, run_id)
    candidates = ["execution.log", "output.log", "stdout.log"]
    for folder in (run_folder, art_folder):
        for c in candidates:
            log_file = folder / c
            if log_file.exists():
                return log_file.read_text(encoding="utf-8", errors="replace")
    return "No execution logs recorded for this run."


def artifact_path(workspace_id: str, run_id: str, artifact_name: str) -> Path | None:
    base = paths.run_dir(workspace_id, run_id).resolve()
    target = (base / artifact_name).resolve()
    if base not in target.parents or not target.is_file():
        return None
    return target


def delete_artifact(workspace_id: str, run_id: str, artifact_name: str) -> bool:
    target = artifact_path(workspace_id, run_id, artifact_name)
    if target is None:
        return False
    target.unlink()
    return True


def delete_workspace_media_file(workspace_id: str, filename: str) -> bool:
    """Deletes a file by name across the workspace's runs and media directory."""
    safe_name = Path(filename).name  # strip dirs, "*" becomes "*"
    if not safe_name or safe_name in (".", "..") or any(c in safe_name for c in "*?[]!"):
        # reject globs/traversal; only exact filename
        return False
    # reject any filename containing path separators (traversal)
    if filename != safe_name or "/" in filename or "\\" in filename:
        return False
    deleted_any = False
    ws_root = paths.workspace_root(workspace_id)

    # 1. Search in runs
    runs_dir = paths.workspace_runs_dir(workspace_id)
    if runs_dir.exists():
        for f in runs_dir.glob(f"*/artifacts/{safe_name}"):
            if f.is_file() or f.is_symlink():
                f.unlink(missing_ok=True)
                deleted_any = True

    # 2. Search in media folder
    media_dir = paths.workspace_media_dir(workspace_id)
    if media_dir.exists():
        for f in media_dir.glob(f"**/{safe_name}"):
            if f.is_file() or f.is_symlink():
                # ensure exact name match (defense against any residual glob)
                if f.name != safe_name:
                    continue
                f.unlink(missing_ok=True)
                deleted_any = True

    return deleted_any


def trim_artifact(workspace_id: str, run_id: str, artifact_name: str, regions: list[dict[str, Any]]) -> list[str] | None:
    src = artifact_path(workspace_id, run_id, artifact_name)
    if src is None:
        return None
    dest = paths.run_dir(workspace_id, run_id)
    src_path = Path(src)
    produced: list[str] = []
    for i, region in enumerate(regions):
        start = region.get("start", 0)
        end = region.get("end", 0)
        out = dest / f"{src_path.stem}_seg_{i}{src_path.suffix}"
        try:
            subprocess.run(
                ["ffmpeg", "-y", "-i", str(src_path), "-ss", str(start), "-to", str(end), str(out)],
                check=True,
                capture_output=True,
            )
        except Exception:
            continue
        produced.append(out.name)
    return produced


def _categorize_file(name: str) -> str:
    ext = Path(name).suffix.lower()
    if ext in (".mp4", ".mkv", ".webm", ".mov", ".avi", ".ts"):
        return "video"
    if ext in (".srt", ".vtt", ".sub", ".ass"):
        return "subtitle"
    if ext in (".mp3", ".wav", ".flac", ".m4a", ".ogg", ".opus", ".aac"):
        return "audio"
    if ext in (".txt", ".md", ".json", ".pdf", ".csv", ".log"):
        return "document"
    if ext in (".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"):
        return "image"
    if ext in (".zip", ".tar", ".gz", ".7z"):
        return "package"
    return "other"


def list_workspace_media(workspace_id: str) -> dict[str, Any]:
    """Return all media files in a workspace categorized by kind and grouped into media packages."""
    ws_root = paths.workspace_root(workspace_id)
    runs_dir = paths.workspace_runs_dir(workspace_id)
    media_dir = paths.workspace_media_dir(workspace_id)

    files_by_category: dict[str, list[dict[str, Any]]] = {
        "video": [],
        "subtitle": [],
        "audio": [],
        "document": [],
        "image": [],
        "package": [],
        "other": [],
    }
    all_files: list[dict[str, Any]] = []
    seen_paths: set[Path] = set()
    seen_names: dict[str, dict[str, Any]] = {}

    # 1. Scan runs artifacts — dedup by resolved path AND by filename (keep newest)
    if runs_dir.exists():
        for r_dir in sorted(runs_dir.iterdir(), key=lambda d: d.stat().st_mtime, reverse=True):
            if not r_dir.is_dir():
                continue
            run_id = r_dir.name
            art_dir = r_dir / "artifacts"
            target_dir = art_dir if art_dir.exists() else r_dir

            manifest_info = {}
            mfile = r_dir / "manifest.json"
            if mfile.exists():
                try:
                    manifest_info = json.loads(mfile.read_text(encoding="utf-8"))
                except Exception:
                    pass

            for f in sorted(target_dir.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
                if "_scratch" in f.name or f.name.startswith("scratch_"):
                    continue
                if not f.is_file() or f.name == "manifest.json" or f.suffix in (".part", ".ytd"):
                    continue
                # Skip broken symlinks or zero-byte placeholders
                try:
                    if f.stat().st_size == 0:
                        continue
                    if f.is_symlink() and not f.resolve().exists():
                        continue
                except Exception:
                    continue
                resolved = f.resolve()
                if resolved in seen_paths:
                    continue
                seen_paths.add(resolved)
                # Global dedup by filename: keep only the newest occurrence of same name
                # This prevents the duplicate subtitle cards seen when same video was run twice
                lower_name = f.name.lower()
                if lower_name in seen_names:
                    # Keep the newer (already stored is newer due to reverse mtime sort). Skip older duplicate.
                    continue
                cat = _categorize_file(f.name)
                f_item = {
                    "name": f.name,
                    "path": str(f),
                    "size": f.stat().st_size,
                    "mtime": f.stat().st_mtime,
                    "category": cat,
                    "run_id": run_id,
                    "tool_id": manifest_info.get("tool_id"),
                    "pipeline_run_id": manifest_info.get("pipeline_run_id"),
                    "bundle_name": manifest_info.get("bundle_name"),
                    "preview_url": f"/api/workspaces/{workspace_id}/runs/{run_id}/artifacts/{f.name}/preview",
                    "download_url": f"/api/workspaces/{workspace_id}/runs/{run_id}/artifacts/{f.name}/download",
                }
                seen_names[lower_name] = f_item
                files_by_category[cat].append(f_item)
                all_files.append(f_item)

    # 2. Build smart media packages (pairing video with its subtitles, transcripts, and audio)
    packages_map: dict[str, dict[str, Any]] = {}
    for f in all_files:
        # Determine base title: strip language/role suffixes repeatedly so
        # sidecars like `talk_translated.en.srt` group with `talk.mp4`.
        stem = Path(f["name"]).stem
        suffixes = [
            ".en", ".ko", ".ja", ".zh", ".es", ".fr", ".de",
            "_translated", "-translated", "_transcribed", "-transcribed",
            "_original", "-original",
            "_en_clean", "_clean", "_en_timestamped", "_timestamped",
            "_seg_0", "_seg_1",
        ]
        changed = True
        while changed:
            changed = False
            for sfx in suffixes:
                if stem.endswith(sfx) and len(stem) > len(sfx):
                    stem = stem[: -len(sfx)]
                    changed = True
                    break

        pkg = packages_map.setdefault(stem, {
            "title": stem,
            "video": None,
            "subtitles": [],
            "transcripts": [],
            "audio": [],
            "all_files": [],
        })
        pkg["all_files"].append(f)
        if f["category"] == "video" and not pkg["video"]:
            pkg["video"] = f
        elif f["category"] == "subtitle":
            pkg["subtitles"].append(f)
        elif f["category"] == "audio":
            pkg["audio"].append(f)
        elif f["category"] == "document" and f["name"].endswith((".txt", ".md")):
            pkg["transcripts"].append(f)

    packages = list(packages_map.values())
    # Sort packages with video first
    packages.sort(key=lambda p: 1 if p.get("video") else 0, reverse=True)

    return {
        "workspace_id": workspace_id,
        "total_files": len(all_files),
        "categories": files_by_category,
        "packages": packages,
        "all_files": all_files,
    }


def list_pipeline_runs(workspace_id: str) -> list[dict[str, Any]]:
    """Return workspace execution runs grouped into cohesive pipeline execution packages."""
    raw_runs = list_runs(workspace_id)
    if not raw_runs:
        return []

    groups: dict[str, dict[str, Any]] = {}
    for run in raw_runs:
        pipe_id = run.get("pipeline_run_id") or run.get("id")
        grp = groups.setdefault(pipe_id, {
            "pipeline_run_id": pipe_id,
            "pipeline_name": run.get("pipeline_name") or f"Run {run.get('tool_id') or pipe_id}",
            "bundle_name": run.get("bundle_name"),
            "status": "completed",
            "timestamp": run.get("timestamp") or 0,
            "steps": [],
            "media": {
                "video": None,
                "subtitles": [],
                "transcripts": [],
                "audio": [],
                "all_artifacts": [],
            },
        })
        grp["steps"].append(run)
        if run.get("status") in ("failed", "error"):
            grp["status"] = "failed"
        elif run.get("status") == "running" and grp["status"] != "failed":
            grp["status"] = "running"

        grp["timestamp"] = max(grp["timestamp"], run.get("timestamp") or 0)
        if run.get("pipeline_name"):
            grp["pipeline_name"] = run["pipeline_name"]

        for art in run.get("artifacts", []):
            name = art.get("name", "")
            cat = _categorize_file(name)
            art_info = {
                "name": name,
                "size": art.get("size", 0),
                "category": cat,
                "run_id": run["id"],
                "tool_id": run.get("tool_id"),
                "preview_url": f"/api/workspaces/{workspace_id}/runs/{run['id']}/artifacts/{name}/preview",
                "download_url": f"/api/workspaces/{workspace_id}/runs/{run['id']}/artifacts/{name}/download",
            }
            grp["media"]["all_artifacts"].append(art_info)
            if cat == "video" and not grp["media"]["video"]:
                grp["media"]["video"] = art_info
            elif cat == "subtitle":
                grp["media"]["subtitles"].append(art_info)
            elif cat == "audio":
                grp["media"]["audio"].append(art_info)
            elif cat == "document" and name.endswith((".txt", ".md")):
                grp["media"]["transcripts"].append(art_info)

    pipeline_list = list(groups.values())
    for grp in pipeline_list:
        grp["steps"].sort(key=lambda s: s.get("timestamp") or 0, reverse=True)
    pipeline_list.sort(key=lambda g: g.get("timestamp") or 0, reverse=True)
    return pipeline_list


def _escape_ffmpeg_subtitle(p: str) -> str:
    return p.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")


def _escape_ffmpeg_path(p: str) -> str:
    return _escape_ffmpeg_subtitle(p)


def mux_subtitles_to_video(
    workspace_id: str,
    video_path: str,
    subtitle_path: str,
    output_name: str | None = None,
    burn_in: bool = False,
) -> dict[str, Any]:
    """Embed or burn subtitles directly into video file via FFmpeg."""
    v_src = paths.resolve_input_file(video_path)
    if not v_src or not v_src.exists():
        raise FileNotFoundError(f"Video file not found: {video_path}")
    s_src = paths.resolve_input_file(subtitle_path)
    if not s_src or not s_src.exists():
        raise FileNotFoundError(f"Subtitle file not found: {subtitle_path}")

    import uuid
    run_id = uuid.uuid4().hex[:12]
    dest = paths.run_dir(workspace_id, run_id)
    dest.mkdir(parents=True, exist_ok=True)

    out_filename = output_name or f"{v_src.stem}_{'burned' if burn_in else 'subtitled'}.mp4"
    out_path = dest / out_filename

    if burn_in:
        # Hard-burn subtitles onto video frames
        escaped = _escape_ffmpeg_subtitle(str(s_src))
        cmd = [
            "ffmpeg", "-y",
            "-i", str(v_src),
            "-vf", f"subtitles='{escaped}'",
            "-c:a", "copy",
            str(out_path),
        ]
    else:
        # Fast soft-mux subtitle track into MP4 container
        cmd = [
            "ffmpeg", "-y",
            "-i", str(v_src),
            "-i", str(s_src),
            "-c:v", "copy",
            "-c:a", "copy",
            "-c:s", "mov_text",
            "-metadata:s:s:0", "language=eng",
            str(out_path),
        ]

    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0 or not out_path.exists():
        raise RuntimeError(f"FFmpeg muxing failed: {proc.stderr[:400]}")

    # Also register in media directory
    media_folder = paths.workspace_media_dir(workspace_id, v_src.stem)
    target_link = media_folder / out_filename
    if not target_link.exists():
        try:
            target_link.symlink_to(out_path)
        except Exception:
            try:
                shutil.copy2(out_path, target_link)
            except Exception:
                pass

    record = {
        "id": run_id,
        "run_id": run_id,
        "tool_id": "subtitle_muxer",
        "status": "completed",
        "error": None,
        "params": {"video": str(v_src), "subtitle": str(s_src), "burn_in": burn_in},
        "artifacts": [{"name": out_filename, "path": str(out_path), "size": out_path.stat().st_size, "kind": "video"}],
        "timestamp": time.time(),
    }
    save_run_meta(workspace_id, run_id, record)

    return {
        "run_id": run_id,
        "name": out_filename,
        "path": str(out_path),
        "size": out_path.stat().st_size,
        "preview_url": f"/api/workspaces/{workspace_id}/runs/{run_id}/artifacts/{out_filename}/preview",
        "download_url": f"/api/workspaces/{workspace_id}/runs/{run_id}/artifacts/{out_filename}/download",
    }


def delete_run(workspace_id: str, run_id: str) -> bool:
    run_path = paths.workspace_root(workspace_id) / "runs" / run_id
    if not run_path.exists():
        return False
    shutil.rmtree(run_path)

    meta_path = paths.workspace_root(workspace_id) / "meta.json"
    if meta_path.exists():
        meta = json.loads(meta_path.read_text())
        meta["runs"] = [r for r in meta.get("runs", []) if r.get("id") != run_id]
        meta_path.write_text(json.dumps(meta, indent=2))
    return True


def gc_runs(workspace_id: str, older_than_days: int = 30, keep_starred: bool = True, dry_run: bool = True) -> dict[str, Any]:
    runs = list_runs(workspace_id)
    cutoff = time.time() - older_than_days * 86400
    candidates = [r["id"] for r in runs
                  if (r.get("timestamp") or 0) < cutoff
                  and (r.get("visibility") in ("scratch", "failed")
                       or r.get("status") in ("failed", "error"))
                  and not (keep_starred and r.get("starred"))]
    deleted = []
    if not dry_run:
        for rid in candidates:
            if delete_run(workspace_id, rid):
                deleted.append(rid)
    return {"candidates": candidates, "deleted": deleted}


def delete_workspace(workspace_id: str) -> bool:
    root = paths.workspace_root(workspace_id)
    if not root.exists():
        return False
    shutil.rmtree(root)
    return True


def export_workspace_zip(workspace_id: str) -> Path:
    root = paths.workspace_root(workspace_id)
    runs_dir = root / "runs"
    fd, tmp = tempfile.mkstemp(suffix=".zip", prefix=f"{workspace_id}-")
    with os.fdopen(fd, "wb") as handle, zipfile.ZipFile(handle, "w", zipfile.ZIP_DEFLATED) as zf:
        for run_path in runs_dir.iterdir():
            for p in run_path.rglob("*"):
                if p.is_file():
                    zf.write(p, p.relative_to(root))
    return Path(tmp)


def export_pipeline_run_zip(workspace_id: str, pipeline_run_id: str) -> Path | None:
    """Zip only the artifacts for a single pipeline_run_id. Returns temp zip path or None if not found."""
    runs = list_pipeline_runs(workspace_id)
    target = next((g for g in runs if g["pipeline_run_id"] == pipeline_run_id), None)
    if not target:
        # fallback: try single run id
        single = next((r for r in list_runs(workspace_id) if r["id"] == pipeline_run_id), None)
        if not single:
            return None
        # single run zip
        fd, tmp = tempfile.mkstemp(suffix=".zip", prefix=f"{pipeline_run_id}-")
        with os.fdopen(fd, "wb") as handle, zipfile.ZipFile(handle, "w", zipfile.ZIP_DEFLATED) as zf:
            run_path = paths.workspace_root(workspace_id) / "runs" / pipeline_run_id
            for p in run_path.rglob("*"):
                if p.is_file():
                    zf.write(p, p.relative_to(run_path))
        return Path(tmp)
    fd, tmp = tempfile.mkstemp(suffix=".zip", prefix=f"{pipeline_run_id}-")
    with os.fdopen(fd, "wb") as handle, zipfile.ZipFile(handle, "w", zipfile.ZIP_DEFLATED) as zf:
        for step in target["steps"]:
            run_id = step["id"]
            run_path = paths.workspace_root(workspace_id) / "runs" / run_id
            if not run_path.exists():
                continue
            for p in run_path.rglob("*"):
                if p.is_file():
                    # store under <pipeline_run_id>/<run_id>/<file>
                    arc = Path(pipeline_run_id) / run_id / p.relative_to(run_path)
                    zf.write(p, arc)
        # also include bundle media if exists
        if target.get("bundle_name"):
            media_dir = paths.workspace_media_dir(workspace_id, target["bundle_name"])
            if media_dir.exists():
                for p in media_dir.rglob("*"):
                    if p.is_file():
                        zf.write(p, Path("bundle") / target["bundle_name"] / p.name)
    return Path(tmp)


def _slugify(value: str) -> str:
    value = value.strip().lower()
    out = []
    for ch in value:
        if ch.isalnum() or ch in {" ", "-", "_"}:
            out.append("-" if ch == " " else ch)
    slug = "".join(out).strip("-")
    return slug or "untitled"
