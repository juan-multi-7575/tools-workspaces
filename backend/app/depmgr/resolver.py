"""Probe the real filesystem / PATH to decide whether a dep is usable.

Rules this module never breaks:

  * ``installed`` means every command the dep claims to provide was found as an
    executable file. Nothing is inferred from the manifest alone.
  * ``missing`` means the prefix or the binaries are gone. A manifest entry on
    its own never upgrades a dep to ``installed``.
  * ``stale`` means the binaries are present but the catalog or the installed
    record has drifted from what was recorded at install time (new package
    added, command list changed, version moved). Staleness is decided from local
    evidence only - no network call is made from a status read.

``shutil.which`` is always called with an explicit ``path`` built from the
dep's own prefix, so a system-wide ffmpeg on the server can never masquerade as
a managed one. That is the whole point of the isolation.
"""

from __future__ import annotations

import os
import shutil
import subprocess
from dataclasses import dataclass, field
from typing import Any

from app.depmgr.catalog import Dep, get as get_dep
from app.depmgr.store import bin_dirs_for, deps_root, du_bytes, installed_records, prefix_for
from app.tools.deps_map import deps_for_tool

STATUS_INSTALLED = "installed"
STATUS_MISSING = "missing"
STATUS_STALE = "stale"

#: Probes that hang (a wedged network mount, a broken wrapper script) must not
#: wedge the status endpoint.
VERSION_PROBE_TIMEOUT = 8.0


@dataclass
class DepStatus:
    dep_id: str
    kind: str
    status: str
    version: str | None = None
    approx_bytes: int = 0
    measured_bytes: int = 0
    provides: list[str] = field(default_factory=list)
    paths: dict[str, str] = field(default_factory=dict)
    missing_commands: list[str] = field(default_factory=list)
    prefix: str = ""
    installed_at: str | None = None
    heavy: bool = False
    notes: str = ""
    reason: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "dep_id": self.dep_id,
            "kind": self.kind,
            "status": self.status,
            "version": self.version,
            "approx_bytes": self.approx_bytes,
            "measured_bytes": self.measured_bytes,
            "provides": list(self.provides),
            "paths": dict(self.paths),
            "missing_commands": list(self.missing_commands),
            "prefix": self.prefix,
            "installed_at": self.installed_at,
            "heavy": self.heavy,
            "notes": self.notes,
            "reason": self.reason,
        }


def _probe_paths(dep: Dep) -> dict[str, str]:
    """which() each provided command against the dep's own bin dirs only."""
    dirs = [str(d) for d in bin_dirs_for(dep) if d.is_dir()]
    found: dict[str, str] = {}
    if not dirs:
        return found
    path_value = os.pathsep.join(dirs)
    for command in dep.provides:
        resolved = shutil.which(command, path=path_value)
        if resolved and os.access(resolved, os.X_OK):
            found[command] = os.path.realpath(resolved)
    return found


def _probe_version(dep: Dep, paths: dict[str, str], record: dict[str, Any] | None) -> str | None:
    """Ask the real binary for its version; fall back to the manifest record."""
    for command in dep.provides:
        binary = paths.get(command)
        if not binary:
            continue
        for flag in ("--version", "-version", "-V"):
            try:
                proc = subprocess.run(
                    [binary, flag],
                    capture_output=True,
                    text=True,
                    timeout=VERSION_PROBE_TIMEOUT,
                    env={**os.environ, "LC_ALL": "C"},
                )
            except (OSError, subprocess.SubprocessError):
                continue
            output = (proc.stdout or proc.stderr or "").strip()
            if not output:
                continue
            first = output.splitlines()[0].strip()
            return first[:200]
    if record and record.get("version"):
        return str(record["version"])
    return None


def _staleness(dep: Dep, record: dict[str, Any] | None) -> str | None:
    """Local-evidence drift check. Returns a human reason, or None if fresh."""
    if record is None:
        return "binaries present but no manifest record"
    recorded_packages = {str(p) for p in (record.get("packages") or [])}
    if recorded_packages and recorded_packages != set(dep.packages):
        return "catalog package list changed since install"
    recorded_provides = {str(p) for p in (record.get("provides") or [])}
    if recorded_provides and recorded_provides != set(dep.provides):
        return "catalog command list changed since install"
    if str(record.get("prefix") or "") != dep.prefix:
        return "catalog prefix changed since install"
    return None


def check_dep(dep_id: str, *, probe_version: bool = True) -> DepStatus:
    dep = get_dep(dep_id)
    if dep is None:
        raise KeyError(dep_id)

    record = installed_records().get(dep_id)
    prefix = prefix_for(dep)
    paths = _probe_paths(dep)
    missing = [c for c in dep.provides if c not in paths]

    status = DepStatus(
        dep_id=dep.id,
        kind=dep.kind,
        status=STATUS_MISSING,
        approx_bytes=dep.approx_bytes,
        provides=list(dep.provides),
        paths=paths,
        missing_commands=missing,
        prefix=str(prefix),
        installed_at=(record or {}).get("installed_at"),
        heavy=dep.heavy,
        notes=dep.notes,
    )

    if not prefix.is_dir():
        status.reason = "prefix does not exist"
        return status
    if missing:
        status.reason = f"not found: {', '.join(missing)}"
        status.measured_bytes = du_bytes(prefix)
        return status

    status.measured_bytes = du_bytes(prefix)
    status.version = _probe_version(dep, paths, record) if probe_version else (record or {}).get("version")
    drift = _staleness(dep, record)
    if drift:
        status.status = STATUS_STALE
        status.reason = drift
        return status

    status.status = STATUS_INSTALLED
    return status


def check_all(*, probe_version: bool = True) -> list[DepStatus]:
    from app.depmgr.catalog import all_deps

    return [check_dep(d.id, probe_version=probe_version) for d in all_deps()]


def check(tool_id: str, *, probe_version: bool = True) -> dict[str, Any]:
    """Resolve every dep a tool needs and report whether the tool can run."""
    dep_ids = deps_for_tool(tool_id)
    deps = [check_dep(d, probe_version=probe_version) for d in dep_ids]
    missing = [d.dep_id for d in deps if d.status != STATUS_INSTALLED]
    return {
        "tool_id": tool_id,
        "ready": not missing,
        "missing": missing,
        "deps": [d.as_dict() for d in deps],
    }


def totals() -> dict[str, Any]:
    statuses = check_all(probe_version=False)
    installed = [s for s in statuses if s.status == STATUS_INSTALLED]
    return {
        "total": len(statuses),
        "installed": len(installed),
        "missing": len([s for s in statuses if s.status == STATUS_MISSING]),
        "stale": len([s for s in statuses if s.status == STATUS_STALE]),
        "heavy_pending": len([s for s in statuses if s.heavy and s.status != STATUS_INSTALLED]),
        "approx_bytes_installed": sum(s.approx_bytes for s in installed),
        "measured_bytes": sum(s.measured_bytes for s in statuses),
    }


def which_in_deps(command: str, dep_ids: list[str]) -> str | None:
    """Resolve a command against only the given deps' prefixes."""
    dirs: list[str] = []
    for dep_id in dep_ids:
        dep = get_dep(dep_id)
        if dep:
            dirs.extend(str(d) for d in bin_dirs_for(dep) if d.is_dir())
    if not dirs:
        return None
    return shutil.which(command, path=os.pathsep.join(dirs))


def deps_root_path() -> str:
    return str(deps_root())