"""Install managed dependencies without root, sudo, apt or brew.

Mechanism:

1. ``micromamba`` - a single static binary - is downloaded once from
   ``https://micro.mamba.pm/api/micromamba/<platform>/latest`` (a bzipped tarball
   containing ``bin/micromamba``) and unpacked into ``<deps_root>/micromamba``.
   No privileged write, no system package manager.
2. conda deps: ``micromamba create -y -p <prefix> -c conda-forge <packages>``
   with ``MAMBA_ROOT_PREFIX`` pointed at the deps root.
3. pip deps: ``python -m venv <prefix>`` then ``<prefix>/bin/python -m pip install``.

Every stage emits granular progress events and polls a cancel event between
output lines, so a multi-gigabyte demucs download can be abandoned mid-flight.
"""

from __future__ import annotations

import asyncio
import os
import platform
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
from pathlib import Path
from typing import Any, Awaitable, Callable

from app.depmgr.catalog import KIND_PIP, Dep, get as get_dep
from app.depmgr.resolver import check_dep
from app.depmgr.store import (
    bin_dir_name,
    deps_root,
    mamba_root_prefix,
    micromamba_bin,
    micromamba_dir,
    prefix_for,
    record_install,
    symlink_farm,
)

ProgressCB = Callable[[dict[str, Any]], Awaitable[None] | None]

MICROMAMBA_BASE = "https://micro.mamba.pm/api/micromamba"
DOWNLOAD_TIMEOUT = 120.0

STAGE_RESOLVING = "resolving"
STAGE_DOWNLOADING = "downloading"
STAGE_EXTRACTING = "extracting"
STAGE_INSTALLING = "installing"
STAGE_VERIFYING = "verifying"
STAGE_DONE = "done"
STAGE_FAILED = "failed"
STAGE_CANCELLED = "cancelled"


class InstallCancelled(Exception):
    """Raised internally when a cancel event fires mid-install."""


class InstallError(Exception):
    """A dependency install failed; carries a public-safe message."""

    def __init__(self, message: str, code: str = "DEPENDENCY_INSTALL_FAILED"):
        super().__init__(message)
        self.code = code
        self.message = message


def micromamba_platform() -> str:
    """The ``<platform>`` path segment micro.mamba.pm expects."""
    system = platform.system().lower()
    machine = platform.machine().lower()
    if system == "linux":
        return "linux-64" if machine in ("x86_64", "amd64") else "linux-aarch64"
    if system == "darwin":
        return "osx-arm64" if machine in ("arm64", "aarch64") else "osx-64"
    if system == "windows":
        return "win-64"
    raise InstallError(f"unsupported platform: {system}/{machine}", code="UNSUPPORTED_PLATFORM")


def micromamba_url() -> str:
    return f"{MICROMAMBA_BASE}/{micromamba_platform()}/latest"


def micromamba_version() -> str:
    binary = micromamba_bin()
    if not binary.exists():
        return "not installed"
    try:
        proc = subprocess.run([str(binary), "--version"], capture_output=True, text=True, timeout=20)
        return (proc.stdout or proc.stderr or "").strip().splitlines()[0]
    except Exception:
        return "unknown"


async def _emit(cb: ProgressCB | None, **payload: Any) -> None:
    if cb is None:
        return
    result = cb(payload)
    if asyncio.iscoroutine(result):
        await result


def _cancelled(cancel_event: asyncio.Event | None) -> bool:
    return bool(cancel_event and cancel_event.is_set())


def _check_cancel(cancel_event: asyncio.Event | None, dep_id: str) -> None:
    if _cancelled(cancel_event):
        raise InstallCancelled(dep_id)


# --------------------------------------------------------------------------
# micromamba bootstrap
# --------------------------------------------------------------------------

def _extract_micromamba(archive: Path, dest: Path) -> Path:
    """Pull bin/micromamba out of the .tar.bz2/.tar.gz micromamba release."""
    dest.mkdir(parents=True, exist_ok=True)
    wanted = ("bin/micromamba", "Library/bin/micromamba", "micromamba")
    try:
        with tarfile.open(archive, "r:*") as tar:
            for member in tar.getmembers():
                name = member.name.replace("\\", "/")
                base = os.path.basename(name)
                if base != "micromamba" or not member.isfile():
                    continue
                extracted = tar.extractfile(member)
                if extracted is None:
                    continue
                target = dest / bin_dir_name() / "micromamba"
                target.parent.mkdir(parents=True, exist_ok=True)
                with open(target, "wb") as handle:
                    shutil.copyfileobj(extracted, handle)
                os.chmod(target, 0o755)
                return target
    except tarfile.TarError as exc:
        raise InstallError(f"could not unpack micromamba archive: {exc}") from exc
    raise InstallError(
        f"micromamba binary not present in archive (wanted one of {', '.join(wanted)})"
    )


async def ensure_micromamba(
    on_progress: ProgressCB | None = None,
    cancel_event: asyncio.Event | None = None,
) -> Path:
    """Download micromamba into the deps root if it is not already there."""
    binary = micromamba_bin()
    if binary.exists() and os.access(binary, os.X_OK):
        return binary

    _check_cancel(cancel_event, "micromamba")
    url = micromamba_url()
    await _emit(
        on_progress,
        type=STAGE_DOWNLOADING,
        dep_id="micromamba",
        message=f"downloading micromamba for {micromamba_platform()}",
        url=url,
    )

    loop = asyncio.get_running_loop()
    root = deps_root()
    root.mkdir(parents=True, exist_ok=True)

    def _download() -> Path:
        req = urllib.request.Request(url, headers={"User-Agent": "ToolsGarage/depmgr"})
        with urllib.request.urlopen(req, timeout=DOWNLOAD_TIMEOUT) as resp:
            suffix = ".tar.bz2" if url.endswith("bz2") else ".tar.bz2"
            fd, name = tempfile.mkstemp(dir=str(root), prefix=".micromamba-", suffix=suffix)
            with os.fdopen(fd, "wb") as handle:
                shutil.copyfileobj(resp, handle)
            return Path(name)

    archive = await loop.run_in_executor(None, _download)
    try:
        _check_cancel(cancel_event, "micromamba")
        await _emit(on_progress, type=STAGE_EXTRACTING, dep_id="micromamba", message="unpacking micromamba")
        target = await loop.run_in_executor(None, _extract_micromamba, archive, micromamba_dir())
    finally:
        archive.unlink(missing_ok=True)

    _check_cancel(cancel_event, "micromamba")
    await _emit(on_progress, type=STAGE_DONE, dep_id="micromamba", message="micromamba ready", path=str(target))
    return target


# --------------------------------------------------------------------------
# streaming subprocess
# --------------------------------------------------------------------------

async def _run_streaming(
    command: list[str],
    *,
    cwd: Path,
    env: dict[str, str],
    dep_id: str,
    on_progress: ProgressCB | None,
    cancel_event: asyncio.Event | None,
    stage: str = STAGE_INSTALLING,
    total_hint: int | None = None,
) -> tuple[int, str]:
    """Run a command, streaming each output line as progress. Cancellable."""
    proc = await asyncio.create_subprocess_exec(
        *command,
        cwd=str(cwd),
        env=env,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
        start_new_session=(os.name != "nt"),
    )
    output: list[str] = []
    assert proc.stdout is not None
    async for raw in proc.stdout:
        line = raw.decode("utf-8", errors="replace").rstrip()
        if line:
            output.append(line)
            if len(output) > 500:
                del output[:200]
            await _emit(
                on_progress,
                type=stage,
                dep_id=dep_id,
                message=line[:400],
                total=total_hint,
            )
        if _cancelled(cancel_event):
            await _terminate(proc)
            raise InstallCancelled(dep_id)
    code = await proc.wait()
    if _cancelled(cancel_event):
        raise InstallCancelled(dep_id)
    return code, "\n".join(output)


async def _terminate(proc: asyncio.subprocess.Process) -> None:
    import signal

    if proc.returncode is not None:
        return
    try:
        if os.name != "nt":
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
        else:
            proc.terminate()
    except (ProcessLookupError, OSError):
        proc.kill()
    try:
        await asyncio.wait_for(proc.wait(), timeout=10)
    except asyncio.TimeoutError:
        proc.kill()


def _base_env() -> dict[str, str]:
    """A minimal, explicit env for installers. Never inherits os.environ wholesale."""
    env = {
        "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
        "HOME": os.environ.get("HOME", str(deps_root())),
        "LANG": os.environ.get("LANG", "C.UTF-8"),
        "TMPDIR": os.environ.get("TMPDIR", tempfile.gettempdir()),
    }
    cert = os.environ.get("SSL_CERT_FILE") or os.environ.get("REQUESTS_CA_BUNDLE")
    if cert:
        env["SSL_CERT_FILE"] = cert
        env["REQUESTS_CA_BUNDLE"] = cert
    return env


# --------------------------------------------------------------------------
# per-kind installers
# --------------------------------------------------------------------------

async def _install_conda(
    dep: Dep,
    *,
    on_progress: ProgressCB | None,
    cancel_event: asyncio.Event | None,
) -> None:
    binary = await ensure_micromamba(on_progress, cancel_event)
    prefix = prefix_for(dep)
    prefix.parent.mkdir(parents=True, exist_ok=True)
    mamba_root_prefix().mkdir(parents=True, exist_ok=True)

    env = _base_env()
    env["MAMBA_ROOT_PREFIX"] = str(mamba_root_prefix())
    env["MAMBA_NO_BANNER"] = "1"
    env["CONDA_PKGS_DIRS"] = str(mamba_root_prefix() / "pkgs")

    command = [
        str(binary), "create", "-y", "-p", str(prefix),
        "-c", dep.channel, "--no-rc", "--no-env",
        *dep.packages,
    ]
    await _emit(
        on_progress,
        type=STAGE_INSTALLING,
        dep_id=dep.id,
        message=f"micromamba create {', '.join(dep.packages)} into {prefix.name}",
        approx_bytes=dep.approx_bytes,
        heavy=dep.heavy,
    )
    code, output = await _run_streaming(
        command, cwd=prefix.parent, env=env, dep_id=dep.id,
        on_progress=on_progress, cancel_event=cancel_event,
        stage=STAGE_INSTALLING, total_hint=dep.approx_bytes,
    )
    if code != 0:
        raise InstallError(
            f"micromamba exited with {code}: {output.strip().splitlines()[-1] if output.strip() else 'no output'}",
            code="CONDA_INSTALL_FAILED",
        )


async def _install_pip(
    dep: Dep,
    *,
    on_progress: ProgressCB | None,
    cancel_event: asyncio.Event | None,
) -> None:
    prefix = prefix_for(dep)
    _check_cancel(cancel_event, dep.id)

    if not venv_python(prefix).exists():
        await _emit(
            on_progress,
            type=STAGE_RESOLVING,
            dep_id=dep.id,
            message=f"creating venv at {prefix}",
        )
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(
            None,
            lambda: _create_venv(prefix),
        )

    python = venv_python(prefix)
    if not python.exists():
        raise InstallError("venv python was not created", code="VENV_CREATE_FAILED")

    _check_cancel(cancel_event, dep.id)
    env = _base_env()
    env["VIRTUAL_ENV"] = str(prefix)
    packages = [*dep.packages, "certifi"]

    await _emit(
        on_progress,
        type=STAGE_INSTALLING,
        dep_id=dep.id,
        message=f"pip install {' '.join(packages)} into {prefix.name}",
        approx_bytes=dep.approx_bytes,
        heavy=dep.heavy,
    )
    code, output = await _run_streaming(
        [str(python), "-m", "pip", "install", "--no-input", "--disable-pip-version-check", *packages],
        cwd=prefix, env=env, dep_id=dep.id,
        on_progress=on_progress, cancel_event=cancel_event,
        stage=STAGE_DOWNLOADING, total_hint=dep.approx_bytes,
    )
    if code != 0:
        tail = output.strip().splitlines()[-1] if output.strip() else "no output"
        raise InstallError(f"pip exited with {code}: {tail}", code="PIP_INSTALL_FAILED")


def venv_python(prefix: Path) -> Path:
    return prefix / bin_dir_name() / ("python.exe" if sys.platform == "win32" else "python")


def _create_venv(prefix: Path) -> None:
    """Create a venv at ``prefix``. Blocking, so it runs in an executor."""
    prefix.mkdir(parents=True, exist_ok=True)
    proc = subprocess.run(
        [sys.executable, "-m", "venv", str(prefix)],
        capture_output=True, text=True, timeout=300,
    )
    if proc.returncode != 0:
        raise InstallError(f"python -m venv failed: {(proc.stderr or '').strip()[-300:]}", code="VENV_CREATE_FAILED")


# --------------------------------------------------------------------------
# symlink farm
# --------------------------------------------------------------------------

def rebuild_symlink_farm() -> int:
    """Point deps_root/bin/<command> at every installed dep's real binary."""
    farm = symlink_farm()
    farm.mkdir(parents=True, exist_ok=True)
    from app.depmgr.resolver import check_all

    linked = 0
    wanted: dict[str, Path] = {}
    for status in check_all(probe_version=False):
        if status.status != "installed":
            continue
        for command, real in status.paths.items():
            wanted.setdefault(command, Path(real))

    for existing in farm.iterdir():
        if existing.name not in wanted:
            try:
                existing.unlink()
            except OSError:
                pass
    for command, real in wanted.items():
        link = farm / command
        tmp = farm / f".{command}.tmp"
        try:
            if tmp.is_symlink() or tmp.exists():
                tmp.unlink()
            os.symlink(real, tmp)
            os.replace(tmp, link)
            linked += 1
        except OSError:
            continue
    return linked


# --------------------------------------------------------------------------
# public entry point
# --------------------------------------------------------------------------

async def install_one(
    dep: Dep,
    *,
    on_progress: ProgressCB | None = None,
    cancel_event: asyncio.Event | None = None,
) -> dict[str, Any]:
    await _emit(
        on_progress, type=STAGE_RESOLVING, dep_id=dep.id,
        message=dep.notes, heavy=dep.heavy, approx_bytes=dep.approx_bytes,
    )
    if dep.kind == KIND_PIP:
        await _install_pip(dep, on_progress=on_progress, cancel_event=cancel_event)
        installer = f"pip ({sys.version.split()[0]})"
    else:
        await _install_conda(dep, on_progress=on_progress, cancel_event=cancel_event)
        installer = micromamba_version()

    await _emit(on_progress, type=STAGE_VERIFYING, dep_id=dep.id, message="probing installed binaries")

    status = check_dep(dep.id)
    if status.status == "missing":
        raise InstallError(
            f"install finished but {', '.join(status.missing_commands)} still not found in {status.prefix}",
            code="DEPENDENCY_VERIFY_FAILED",
        )
    record_install(dep, status.version, installer)
    return status.as_dict()


async def install(
    dep_ids: list[str],
    on_progress: ProgressCB | None = None,
    cancel_event: asyncio.Event | None = None,
) -> dict[str, Any]:
    """Install each dep in order, streaming progress. Stops at the first failure."""
    results: list[dict[str, Any]] = []
    failures: list[dict[str, str]] = []
    cancelled = False

    for dep_id in dep_ids:
        dep = get_dep(dep_id)
        if dep is None:
            failures.append({"dep_id": dep_id, "error": "unknown dependency id"})
            await _emit(on_progress, type=STAGE_FAILED, dep_id=dep_id, message="unknown dependency id")
            continue
        try:
            results.append(await install_one(dep, on_progress=on_progress, cancel_event=cancel_event))
        except InstallCancelled:
            cancelled = True
            await _emit(on_progress, type=STAGE_CANCELLED, dep_id=dep_id, message="cancelled")
            break
        except Exception as exc:  # noqa: BLE001 - surfaced to the UI verbatim
            message = exc.message if isinstance(exc, InstallError) else str(exc)
            code = exc.code if isinstance(exc, InstallError) else "DEPENDENCY_INSTALL_FAILED"
            failures.append({"dep_id": dep_id, "error": message, "code": code})
            await _emit(on_progress, type=STAGE_FAILED, dep_id=dep_id, message=message)
            break
        await _emit(on_progress, type=STAGE_DONE, dep_id=dep.id, message="installed")

    try:
        rebuild_symlink_farm()
    except Exception:
        pass

    return {
        "ok": not failures and not cancelled,
        "cancelled": cancelled,
        "installed": results,
        "failures": failures,
        "requested": list(dep_ids),
    }