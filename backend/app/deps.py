import json
import subprocess
import urllib.request
from typing import Any, Callable

PINNED_DEPENDENCIES = [
    {"name": "yt-dlp", "url": "https://pypi.org/pypi/yt-dlp/json"},
    {"name": "gallery-dl", "url": "https://pypi.org/pypi/gallery-dl/json"},
]


def installed_version(package: str) -> str | None:
    try:
        out = subprocess.run(
            [package, "--version"], capture_output=True, text=True, timeout=10
        )
    except (FileNotFoundError, subprocess.SubprocessError):
        return None
    first = (out.stdout or "").strip().splitlines()
    return first[0].split()[-1] if first else None


def latest_version(package_url: str) -> str | None:
    try:
        with urllib.request.urlopen(package_url, timeout=10) as resp:
            data = json.loads(resp.read().decode())
        return data.get("info", {}).get("version")
    except Exception:
        return None


def check_dependencies(index: Callable[[str], str | None] | None = None) -> list[dict[str, Any]]:
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


def upgrade_package(package: str) -> dict[str, Any]:
    try:
        subprocess.run(["pip", "install", "--upgrade", package], check=True, capture_output=True, timeout=600)
    except Exception as e:
        return {"ok": False, "error": str(e)}
    return {"ok": True, "package": package}
