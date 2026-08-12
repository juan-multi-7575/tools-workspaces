import json
from typing import Any

from app import paths


def create_workspace(name: str) -> dict[str, Any]:
    ws_id = _slugify(name)
    root = paths.workspace_root(ws_id)
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
                out.append(json.loads(meta_path.read_text()))
            else:
                out.append({"id": p.name, "name": p.name, "templates": [], "runs": []})
    return out


def save_run_meta(workspace_id: str, run_id: str, record: dict[str, Any]) -> None:
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


def list_runs(workspace_id: str) -> list[dict[str, Any]]:
    runs_dir = paths.workspace_runs_dir(workspace_id)
    out: list[dict[str, Any]] = []
    if not runs_dir.exists():
        return out
    for run_path in runs_dir.iterdir():
        if run_path.is_dir():
            artifacts = [
                {"name": p.name, "size": p.stat().st_size}
                for p in (run_path / "artifacts").iterdir()
                if p.is_file()
            ]
            out.append({"id": run_path.name, "artifacts": artifacts})
    return out


def _slugify(value: str) -> str:
    value = value.strip().lower()
    out = []
    for ch in value:
        if ch.isalnum() or ch in {" ", "-", "_"}:
            out.append("-" if ch == " " else ch)
    slug = "".join(out).strip("-")
    return slug or "untitled"
