"""Remove managed dependencies, and report who breaks when you do.

Every catalog entry owns its prefix exclusively, so ``remove(dep_id)`` is a
single ``rmtree`` plus a manifest edit. There is no package-manager step that
could half-succeed and leave ffmpeg half-present in a prefix that sox also uses.

``dependents(dep_id)`` is what lets the UI say "removing ffmpeg breaks: 6 tools"
with the actual tool list rather than a scary guess.
"""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any

from app.depmgr.catalog import get as get_dep
from app.depmgr.store import deps_root, prefix_for_id, record_removal
from app.tools.deps_map import tools_for_dep


class RemovalError(Exception):
    """Removal failed; the message is safe to show in the UI."""


def dependents(dep_id: str) -> list[str]:
    """Registered tool ids that stop working if ``dep_id`` is removed."""
    return tools_for_dep(dep_id)


def _remove_tree(path: Path) -> int:
    """Delete a prefix and report how many bytes it held. Never follows symlinks out."""
    if not path.exists() and not path.is_symlink():
        return 0
    if path.is_symlink():
        path.unlink()
        return 0
    from app.depmgr.store import du_bytes

    freed = du_bytes(path)
    shutil.rmtree(path)
    return freed


def remove(dep_id: str) -> dict[str, Any]:
    """Remove one dep's prefix and manifest record. Leaves every other dep alone."""
    dep = get_dep(dep_id)
    if dep is None:
        raise RemovalError(f"unknown dependency id: {dep_id}")

    prefix = prefix_for_id(dep_id)
    affected = dependents(dep_id)
    was_installed = record_removal(dep_id)

    freed = 0
    if prefix is not None:
        try:
            freed = _remove_tree(prefix)
        except OSError as exc:
            raise RemovalError(f"could not delete {prefix}: {exc}") from exc

    _refresh_symlink_farm()

    return {
        "ok": True,
        "dep_id": dep_id,
        "removed_prefix": str(prefix) if prefix else None,
        "prefix_existed": was_installed or bool(prefix and prefix.exists()),
        "freed_bytes": freed,
        "breaks_tools": affected,
    }


def nuke() -> dict[str, Any]:
    """Delete the entire deps root: micromamba, every prefix, the cache and manifest."""
    root = deps_root()
    from app.depmgr.store import du_bytes

    freed = du_bytes(root)
    existed = root.exists()
    errors: list[str] = []
    if existed:
        try:
            shutil.rmtree(root)
        except OSError as exc:
            errors.append(str(exc))
    return {
        "ok": not errors,
        "deps_root": str(root),
        "existed": existed,
        "freed_bytes": freed,
        "errors": errors,
    }


def _refresh_symlink_farm() -> None:
    try:
        from app.depmgr.installer import rebuild_symlink_farm

        rebuild_symlink_farm()
    except Exception:
        # A stale convenience symlink must never fail a removal that already
        # deleted the real bytes.
        pass