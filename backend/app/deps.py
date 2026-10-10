import json
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path
from typing import Any, Callable

PINNED_DEPENDENCIES = [
    {"name": "yt-dlp", "url": "https://pypi.org/pypi/yt-dlp/json"},
    {"name": "gallery-dl", "url": "https://pypi.org/pypi/gallery-dl/json"},
    {
        "name": "faster-whisper",
        "url": "https://pypi.org/pypi/faster-whisper/json",
        "module": "faster_whisper",
    },
    {
        "name": "exiftool",
        "url": None,
    },
]

#: Pinned packages the dependency manager (app/depmgr) now provisions, and the
#: dep id it provisions them under. This module reports on them; it no longer
#: installs them.
MANAGED_BY_DEPMGR = {
    "yt-dlp": "conda.ytdlp",
    "gallery-dl": "pip.gallery_dl",
    "exiftool": "conda.exiftool",
}


def installed_version(package: str) -> str | None:
    dep = next((d for d in PINNED_DEPENDENCIES if d["name"] == package), None)
    module_or_dist = (dep and dep.get("module")) or package
    try:
        import importlib.metadata as md
        return md.version(module_or_dist)
    except Exception:
        pass

    binary_path = shutil.which(package)
    if not binary_path:
        venv_bin = Path(sys.executable).parent / package
        if venv_bin.exists():
            binary_path = str(venv_bin)

    if binary_path:
        try:
            out = subprocess.run(
                [binary_path, "--version"], capture_output=True, text=True, timeout=10
            )
            first = (out.stdout or out.stderr or "").strip().splitlines()
            if first:
                parts = first[0].split()
                return parts[-1] if parts else None
        except (FileNotFoundError, subprocess.SubprocessError):
            pass

    return None


def latest_version(package_url: str | None, timeout: float = 2.0) -> str | None:
    if not package_url:
        return None
    try:
        req = urllib.request.Request(package_url, headers={"User-Agent": "ToolsGarage/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode())
        return data.get("info", {}).get("version")
    except Exception:
        return None


def check_dependencies(index: Callable[[str | None], str | None] | None = None) -> list[dict[str, Any]]:
    if index is None:
        index = lambda url: latest_version(url)  # noqa: E731
    results = []
    for dep in PINNED_DEPENDENCIES:
        name = dep["name"]
        results.append(
            {
                "name": name,
                "installed": installed_version(name),
                "latest": index(dep["url"]),
            }
        )
    return results


def upgrade_package(package: str, channel: str = "stable") -> dict[str, Any]:
    """Upgrade one pinned package, inside this app's own virtualenv only.

    There is no privileged install here any more, and there is not meant to be
    one: every binary the app shells out to is provisioned root-free under the
    deps root by app/depmgr, and this function used to shell out to a
    system-wide installer for them, producing a second copy outside that root.
    Packages app/depmgr owns are therefore refused here and pointed at
    POST /api/deps/install, which is the only install path. ``channel`` is still
    accepted because callers pass it; nothing left here installs a pre-release.
    """
    dep_id = MANAGED_BY_DEPMGR.get(package)
    if dep_id:
        return {
            "ok": False,
            "package": package,
            "error": (
                f"{package} is installed and upgraded by the dependency manager, not here. "
                f"Install it with POST /api/deps/install using dep_id '{dep_id}', "
                f"or from the Dependencies console."
            ),
        }
    try:
        subprocess.run(
            [sys.executable, "-m", "pip", "install", "--upgrade", package],
            check=True, capture_output=True, timeout=600,
        )
    except Exception as e:
        return {"ok": False, "error": str(e)}
    return {"ok": True, "package": package, "channel": channel}

