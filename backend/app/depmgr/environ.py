"""Build the subprocess-scoped environment a tool needs to find its binaries.

``env_for(tool_id)`` returns a **new dict**. It never writes to ``os.environ``,
never calls ``os.putenv``, and never mutates ``sys.path``. The caller merges the
result over the environment for exactly one ``execve``; when that process exits
the change is gone. That is what makes "without touching system PATH" literally
true rather than aspirational.

What goes in:

``PATH``              the dep's own prefix bin dirs, prepended to the inherited
                      PATH. Order matters: managed binaries win over anything a
                      server admin happened to apt-install.
``MAMBA_ROOT_PREFIX`` the deps root, so any child micromamba/conda invocation
                      keeps its package cache inside the app-owned root.
``CONDA_PREFIX``      set only when the tool uses exactly one conda dep. With two
                      or more prefixes on PATH a single CONDA_PREFIX would be a
                      lie, so it is omitted instead.
``VIRTUAL_ENV``       set only when the tool uses exactly one pip venv, for the
                      same reason.
``SSL_CERT_FILE`` and friends
                      conda-forge ffmpeg is linked against its own CA store and
                      routinely fails HTTPS on sites that redirect to CDN hosts.
                      Pointing SSL_CERT_FILE / REQUESTS_CA_BUNDLE / CURL_CA_BUNDLE
                      at certifi from the managed venv fixes that class of failure.
"""

from __future__ import annotations

import os
from typing import Any

from app.depmgr.catalog import KIND_PIP, get as get_dep
from app.depmgr.store import (
    bin_dirs_for_id,
    certifi_bundle,
    mamba_root_prefix,
    micromamba_bin,
    prefix_for_id,
)


def _deps_for_tool(tool_id: str) -> list[str]:
    # Imported lazily on purpose: app.tools.deps_map lives inside the app.tools
    # package, whose __init__ imports every tool driver, and downloader.py imports
    # env_for from this module. A module-level import would close that cycle.
    from app.tools.deps_map import deps_for_tool

    return deps_for_tool(tool_id)


def bin_dirs_for_tool(tool_id: str) -> list[str]:
    """Ordered, de-duplicated existing bin dirs for a tool's deps."""
    ordered: list[str] = []
    for dep_id in _deps_for_tool(tool_id):
        for d in bin_dirs_for_id(dep_id):
            s = str(d)
            if s not in ordered and os.path.isdir(s):
                ordered.append(s)
    return ordered


def env_for(tool_id: str) -> dict[str, str]:
    """Overrides for a tool's subprocess env. Pure function; os.environ untouched."""
    dep_ids = _deps_for_tool(tool_id)
    bin_dirs = bin_dirs_for_tool(tool_id)
    env: dict[str, str] = {}

    if bin_dirs:
        inherited = os.environ.get("PATH", "")
        env["PATH"] = os.pathsep.join(bin_dirs + ([inherited] if inherited else []))

    deps = [get_dep(d) for d in dep_ids]
    conda_prefixes = [prefix_for_id(d.id) for d in deps if d is not None and d.kind != KIND_PIP]
    pip_prefixes = [prefix_for_id(d.id) for d in deps if d is not None and d.kind == KIND_PIP]

    if len(conda_prefixes) == 1 and conda_prefixes[0] and conda_prefixes[0].is_dir():
        env["CONDA_PREFIX"] = str(conda_prefixes[0])
    if len(pip_prefixes) == 1 and pip_prefixes[0] and pip_prefixes[0].is_dir():
        env["VIRTUAL_ENV"] = str(pip_prefixes[0])

    if micromamba_bin().exists() or mamba_root_prefix().exists():
        env["MAMBA_ROOT_PREFIX"] = str(mamba_root_prefix())

    cert = certifi_bundle()
    if cert:
        # Covers OpenSSL (ffmpeg), Python requests (yt-dlp, gallery-dl) and curl.
        env["SSL_CERT_FILE"] = str(cert)
        env["REQUESTS_CA_BUNDLE"] = str(cert)
        env["CURL_CA_BUNDLE"] = str(cert)

    return env


def preview(tool_id: str) -> dict[str, Any]:
    """Serialisable view of what env_for would contribute. Used by the API."""
    env = env_for(tool_id)
    return {
        "tool_id": tool_id,
        "bin_dirs": bin_dirs_for_tool(tool_id),
        "env": env,
        "mutates_global_env": False,
    }