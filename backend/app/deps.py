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
        "apt_package": "libimage-exiftool-perl",
    },
]


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
    dep = next((d for d in PINNED_DEPENDENCIES if d["name"] == package), None)
    if dep and dep.get("apt_package"):
        try:
            cmd = ["apt-get", "install", "-y", dep["apt_package"]]
            if shutil.which("sudo"):
                cmd.insert(0, "sudo")
            subprocess.run(cmd, check=True, capture_output=True, timeout=600)
        except Exception as e:
            return {"ok": False, "error": str(e)}
        return {"ok": True, "package": package, "channel": channel}
    try:
        if package == "yt-dlp" and channel == "nightly":
            cmd = [sys.executable, "-m", "pip", "install", "--upgrade", "--pre", "yt-dlp"]
        else:
            cmd = [sys.executable, "-m", "pip", "install", "--upgrade", package]
        subprocess.run(
            cmd,
            check=True, capture_output=True, timeout=600,
        )
    except Exception as e:
        return {"ok": False, "error": str(e)}
    return {"ok": True, "package": package, "channel": channel}

