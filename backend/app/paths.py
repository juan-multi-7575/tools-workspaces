from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOWNLOADS = ROOT / "downloads"
WORKSPACES = ROOT / "workspaces"
CONFIG = ROOT / "config"


def ensure_layout() -> None:
    for p in (DOWNLOADS, WORKSPACES, CONFIG):
        p.mkdir(parents=True, exist_ok=True)


def tool_downloads_dir(tool_id: str) -> Path:
    d = DOWNLOADS / tool_id
    d.mkdir(parents=True, exist_ok=True)
    return d


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


def settings_path() -> Path:
    return CONFIG / "settings.json"


def providers_path() -> Path:
    return CONFIG / "providers.json"
