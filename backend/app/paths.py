import glob
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOWNLOADS = ROOT / "downloads"
WORKSPACES = ROOT / "workspaces"
CONFIG = ROOT / "config"
UPLOADS = ROOT / "uploads"


def ensure_layout() -> None:
    for p in (DOWNLOADS, WORKSPACES, CONFIG, UPLOADS):
        p.mkdir(parents=True, exist_ok=True)


def resolve_input_file(p: str | Path | None) -> Path | None:
    """Resolve an input file path or bare filename across workspaces, downloads, and uploads."""
    if not p:
        return None
    raw = Path(p)
    # 1. Absolute path check
    if raw.is_absolute() and raw.exists():
        return raw.resolve()
    # 2. Relative to ROOT or cwd
    if (ROOT / p).exists():
        return (ROOT / p).resolve()
    if raw.exists():
        return raw.resolve()
    # 3. Search by filename across uploads, workspaces, downloads
    fname = raw.name
    escaped_fname = glob.escape(fname)
    for search_dir in (UPLOADS, WORKSPACES, DOWNLOADS):
        if search_dir.exists():
            matches = list(search_dir.glob(f"**/{escaped_fname}"))
            if matches:
                matches.sort(key=lambda m: m.stat().st_mtime, reverse=True)
                return matches[0].resolve()
    # 4. Fallback search by stem
    if raw.stem and len(raw.stem) > 3:
        escaped_stem = glob.escape(raw.stem)
        for search_dir in (UPLOADS, WORKSPACES, DOWNLOADS):
            if search_dir.exists():
                matches = list(search_dir.glob(f"**/{escaped_stem}.*"))
                if matches:
                    matches.sort(key=lambda m: m.stat().st_mtime, reverse=True)
                    return matches[0].resolve()
    return None


def tool_downloads_dir(tool_id: str) -> Path:
    d = DOWNLOADS / tool_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def workspaces_dir() -> Path:
    return WORKSPACES


def downloads_dir() -> Path:
    return DOWNLOADS


def uploads_dir() -> Path:
    return UPLOADS


def workspace_root(workspace_id: str) -> Path:
    return WORKSPACES / workspace_id


def workspace_runs_dir(workspace_id: str) -> Path:
    p = WORKSPACES / workspace_id / "runs"
    p.mkdir(parents=True, exist_ok=True)
    return p


def run_dir(workspace_id: str, run_id: str) -> Path:
    p = WORKSPACES / workspace_id / "runs" / run_id / "artifacts"
    p.mkdir(parents=True, exist_ok=True)
    return p


def workspace_media_dir(workspace_id: str, subfolder: str | None = None) -> Path:
    p = WORKSPACES / workspace_id / "media"
    if subfolder:
        clean_sub = "".join(c for c in subfolder if c.isalnum() or c in (" ", "-", "_", ".")).strip()
        if clean_sub:
            p = p / clean_sub
    p.mkdir(parents=True, exist_ok=True)
    return p


def settings_path() -> Path:
    return CONFIG / "settings.json"


def providers_path() -> Path:
    return CONFIG / "providers.json"
