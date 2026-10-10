"""Filesystem layout + manifest.json for the app-owned dependency root.

Everything the dependency manager owns lives under ``deps_root()``, which is
``<app.paths.ROOT>/deps`` by default and can be overridden with the
``TOOLSGARAGE_DEPS_ROOT`` environment variable (app-owned, never system-wide).

``deps_root()`` deliberately reads ``app.paths.ROOT`` at call time rather than
binding it at import time so that tests which monkeypatch ``app.paths.ROOT``
also relocate the dependency root. That is what keeps the test suite from ever
touching the real, multi-gigabyte dependency root.

Layout::

    <deps_root>/
        micromamba/bin/micromamba      downloaded static binary, no root needed
        envs/<prefix>/                 one prefix per catalog entry
        envs/python/                   gallery-dl venv
        envs/media/                    ffmpeg conda prefix
        bin/                           convenience symlink farm -> real binaries
        mamba/                         MAMBA_ROOT_PREFIX (package cache)
        manifest.json                  authoritative install record
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path
from typing import Any

from app import paths
from app.depmgr.catalog import Dep, get as get_dep

DEPS_ROOT_ENV_VAR = "TOOLSGARAGE_DEPS_ROOT"
MANIFEST_VERSION = 1


def deps_root() -> Path:
    """The single app-owned root that holds every managed dependency."""
    override = os.environ.get(DEPS_ROOT_ENV_VAR)
    if override and override.strip():
        return Path(override).expanduser().resolve()
    return paths.ROOT / "deps"


def micromamba_dir() -> Path:
    return deps_root() / "micromamba"


def micromamba_bin() -> Path:
    name = "micromamba.exe" if sys.platform == "win32" else "micromamba"
    return micromamba_dir() / ("bin" if sys.platform != "win32" else "Scripts") / name


def mamba_root_prefix() -> Path:
    """MAMBA_ROOT_PREFIX for micromamba - keeps the package cache inside deps root."""
    return deps_root() / "mamba"


def envs_dir() -> Path:
    return deps_root() / "envs"


def prefix_for(dep: Dep) -> Path:
    return envs_dir() / dep.prefix


def prefix_for_id(dep_id: str) -> Path | None:
    dep = get_dep(dep_id)
    return prefix_for(dep) if dep else None


def bin_dir_name() -> str:
    return "Scripts" if sys.platform == "win32" else "bin"


def bin_dirs_for(dep: Dep) -> list[Path]:
    """Executable directories a dep contributes to a subprocess PATH."""
    prefix = prefix_for(dep)
    return [prefix / bin_dir_name()]


def bin_dirs_for_id(dep_id: str) -> list[Path]:
    dep = get_dep(dep_id)
    return bin_dirs_for(dep) if dep else []


def symlink_farm() -> Path:
    return deps_root() / "bin"


def manifest_path() -> Path:
    return deps_root() / "manifest.json"


def certifi_bundle() -> Path | None:
    """CA bundle from certifi, if any managed venv has it.

    conda-forge's ffmpeg builds frequently fail HTTPS without an explicit CA
    bundle, so ``environ.env_for`` points SSL_CERT_FILE here when available.
    """
    candidates: list[Path] = []
    deps_root_certs = deps_root() / "certifi" / "cacert.pem"
    candidates.append(deps_root_certs)
    try:
        from app.depmgr.catalog import all_deps

        for dep in all_deps():
            if dep.kind != "pip":
                continue
            lib = prefix_for(dep) / "lib"
            if not lib.is_dir():
                continue
            for site in sorted(lib.glob("python*/site-packages")):
                candidates.append(site / "certifi" / "cacert.pem")
    except Exception:
        return None
    for c in candidates:
        if c.is_file():
            return c
    return None


# --------------------------------------------------------------------------
# du-style size accounting
# --------------------------------------------------------------------------

def du_bytes(path: str | Path) -> int:
    """Apparent size of a tree in bytes, counting each hardlinked file once.

    Micromamba hardlinks packages out of its cache into every prefix, so a naive
    ``sum(st_size)`` would double-count the same bytes once per prefix. Walking
    with a seen-inode set gives the honest on-disk figure for the tree.
    """
    root = Path(path)
    if not root.exists():
        return 0
    if root.is_file() or root.is_symlink():
        try:
            return root.lstat().st_size
        except OSError:
            return 0

    total = 0
    seen: set[tuple[int, int]] = set()
    stack = [root]
    while stack:
        current = stack.pop()
        try:
            entries = list(os.scandir(current))
        except OSError:
            continue
        for entry in entries:
            try:
                if entry.is_dir(follow_symlinks=False):
                    stack.append(Path(entry.path))
                    continue
                st = entry.stat(follow_symlinks=False)
            except OSError:
                continue
            key = (st.st_dev, st.st_ino)
            if st.st_nlink > 1:
                if key in seen:
                    continue
                seen.add(key)
            total += st.st_size
    return total


# --------------------------------------------------------------------------
# manifest
# --------------------------------------------------------------------------

def empty_manifest() -> dict[str, Any]:
    return {"version": MANIFEST_VERSION, "deps": {}}


def load_manifest() -> dict[str, Any]:
    """Read manifest.json. A missing or corrupt file reads as 'nothing installed'."""
    path = manifest_path()
    if not path.is_file():
        return empty_manifest()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return empty_manifest()
    if not isinstance(data, dict):
        return empty_manifest()
    deps = data.get("deps")
    if not isinstance(deps, dict):
        data["deps"] = {}
    data.setdefault("version", MANIFEST_VERSION)
    return data


def save_manifest(manifest: dict[str, Any]) -> Path:
    """Atomically persist manifest.json (tmp file in the same dir + os.replace)."""
    root = deps_root()
    root.mkdir(parents=True, exist_ok=True)
    target = manifest_path()
    fd, tmp_name = tempfile.mkstemp(dir=str(root), prefix=".manifest-", suffix=".json.tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(manifest, handle, indent=2, sort_keys=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp_name, target)
    except BaseException:
        try:
            os.unlink(tmp_name)
        except OSError:
            pass
        raise
    return target


def record_install(dep: Dep, version: str | None, installer: str) -> None:
    """Merge one install result into the manifest and persist it."""
    from datetime import datetime, timezone

    manifest = load_manifest()
    entries = manifest.setdefault("deps", {})
    entries[dep.id] = {
        "dep_id": dep.id,
        "kind": dep.kind,
        "prefix": dep.prefix,
        "packages": list(dep.packages),
        "provides": list(dep.provides),
        "version": version,
        "installer": installer,
        "installed_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "bytes": du_bytes(prefix_for(dep)),
    }
    save_manifest(manifest)


def record_removal(dep_id: str) -> bool:
    manifest = load_manifest()
    entries = manifest.get("deps", {})
    existed = dep_id in entries
    entries.pop(dep_id, None)
    save_manifest(manifest)
    return existed


def installed_records() -> dict[str, dict[str, Any]]:
    records = load_manifest().get("deps", {})
    return records if isinstance(records, dict) else {}