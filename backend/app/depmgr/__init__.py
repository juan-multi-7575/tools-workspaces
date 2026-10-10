"""App-owned, root-free dependency manager for the tool fleet.

Every external binary a tool shells out to (ffmpeg, magick, exiftool, pandoc,
sox, pdftotext, yt-dlp, gallery-dl, ocrmypdf, demucs, streamlink) is installed
into a single app-owned root. No root, no sudo, no apt/brew, no global PATH
change, no write outside the root.

Quick start::

    from app.depmgr import check, install, env_for

    state = check("trimmer")          # probe the real filesystem
    if not state["ready"]:
        await install(state["missing"], on_progress=emit)

    env = env_for("trimmer")          # subprocess-scoped; os.environ untouched

Layout and public API are documented in ``store.py`` / ``catalog.py``.
"""

from __future__ import annotations

from app.depmgr.catalog import (
    KIND_CONDA,
    KIND_PIP,
    Dep,
    all_deps,
    get as get_dep,
)
from app.depmgr.environ import bin_dirs_for_tool, env_for, preview
from app.depmgr.installer import (
    InstallCancelled,
    InstallError,
    ensure_micromamba,
    install,
    install_one,
    micromamba_platform,
    micromamba_url,
    micromamba_version,
    rebuild_symlink_farm,
)
from app.depmgr.resolver import (
    STATUS_INSTALLED,
    STATUS_MISSING,
    STATUS_STALE,
    DepStatus,
    check,
    check_all,
    check_dep,
    totals,
)
from app.depmgr.store import (
    bin_dirs_for_id,
    certifi_bundle,
    deps_root,
    du_bytes,
    installed_records,
    load_manifest,
    mamba_root_prefix,
    manifest_path,
    micromamba_bin,
    prefix_for,
    prefix_for_id,
    record_install,
    record_removal,
    save_manifest,
    symlink_farm,
)
from app.depmgr.uninstaller import RemovalError, dependents, nuke, remove
from app.tools.deps_map import TOOL_DEPENDENCIES, deps_for_tool, tools_for_dep

__all__ = [
    # catalog
    "Dep", "KIND_CONDA", "KIND_PIP", "all_deps", "get_dep",
    # store
    "deps_root", "manifest_path", "load_manifest", "save_manifest", "du_bytes",
    "installed_records", "record_install", "record_removal",
    "prefix_for", "prefix_for_id", "bin_dirs_for_id", "symlink_farm",
    "micromamba_bin", "mamba_root_prefix", "certifi_bundle",
    # resolver
    "DepStatus", "check", "check_all", "check_dep", "totals",
    "STATUS_INSTALLED", "STATUS_MISSING", "STATUS_STALE",
    # installer
    "install", "install_one", "ensure_micromamba", "rebuild_symlink_farm",
    "InstallError", "InstallCancelled",
    "micromamba_url", "micromamba_platform", "micromamba_version",
    # uninstaller
    "remove", "nuke", "dependents", "RemovalError",
    # environ
    "env_for", "preview", "bin_dirs_for_tool",
    # tool map
    "TOOL_DEPENDENCIES", "deps_for_tool", "tools_for_dep",
]