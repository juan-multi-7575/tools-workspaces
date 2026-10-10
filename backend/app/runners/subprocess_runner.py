from __future__ import annotations

import asyncio
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import time
from dataclasses import dataclass
from typing import Any, Callable


@dataclass
class SubprocessResult:
    exit_code: int
    stdout: str
    stderr: str
    duration_seconds: float
    timed_out: bool = False
    cancelled: bool = False


class AsyncSubprocessRunner:
    """Non-blocking asynchronous process runner with process group isolation,
    sanitized environment variables, real-time stdout/stderr streaming,
    graceful 3-stage cancellation escalation (SIGINT -> SIGTERM -> SIGKILL),
    and zombie process reaping.
    """

    SAFE_ENV_ALLOWLIST = {
        "PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "COMSPEC",
        "HOME", "USERPROFILE", "HOMEDRIVE", "HOMEPATH",
        "TMPDIR", "TEMP", "TMP", "APPDATA", "LOCALAPPDATA",
        "LANG", "LC_ALL", "LC_CTYPE", "LC_MESSAGES",
        "USER", "LOGNAME", "SHELL",
        "SSL_CERT_FILE", "SSL_CERT_DIR", "REQUESTS_CA_BUNDLE", "CURL_CA_BUNDLE",
    }

    BLOCKED_PATTERNS = ("KEY", "SECRET", "TOKEN", "PASSWORD", "AUTH", "CREDENTIAL")

    def __init__(
        self,
        command: list[str],
        cwd: str | Path | None = None,
        env_vars: dict[str, str] | None = None,
        timeout: float | None = None,
        grace_period: float = 2.0,
        progress_parser: Callable[[str], dict[str, Any] | None] | None = None,
        env: dict[str, str] | None = None,
        tool_id: str | None = None,
    ):
        self.command = [str(c) for c in command]
        self.cwd = Path(cwd) if cwd else Path.cwd()
        self.extra_env = env_vars or {}
        self.timeout = timeout
        self.grace_period = grace_period
        self.progress_parser = progress_parser
        # `env` is merged over the isolated environment for this one execve only.
        # `tool_id` pulls PATH/conada variables from the app-owned dependency
        # manager (app/depmgr) so a tool finds the binaries installed under the
        # deps root instead of anything on the system PATH. Neither mutates
        # os.environ, and both are no-ops when omitted.
        self.env = dict(env) if env else {}
        self.tool_id = tool_id
        self._proc: asyncio.subprocess.Process | None = None
        self._cancel_requested = False

    def _apply_tool_deps(self, isolated: dict[str, str]) -> None:
        """Prepend the dep manager's bin dirs to PATH for this call only."""
        if not self.tool_id:
            return
        from app.depmgr.environ import env_for

        try:
            dep_env = env_for(self.tool_id)
        except Exception:
            return
        dep_path = dep_env.pop("PATH", "")
        if dep_path:
            inherited = isolated.get("PATH", "")
            isolated["PATH"] = os.pathsep.join(p for p in (dep_path, inherited) if p)
        for key, value in dep_env.items():
            isolated[key] = value

    def _build_isolated_env(self) -> dict[str, str]:
        isolated: dict[str, str] = {}
        for k, v in os.environ.items():
            k_upper = k.upper()
            if k_upper in self.SAFE_ENV_ALLOWLIST or k_upper.startswith("LC_"):
                if not any(pat in k_upper for pat in self.BLOCKED_PATTERNS):
                    isolated[k] = v

        venv_bin = str(Path(sys.prefix) / ("Scripts" if sys.platform == "win32" else "bin"))
        current_path = isolated.get("PATH", "")
        if venv_bin not in current_path.split(os.pathsep):
            isolated["PATH"] = f"{venv_bin}{os.pathsep}{current_path}" if current_path else venv_bin

        for ek, ev in self.extra_env.items():
            if "\x00" not in str(ek) and "\x00" not in str(ev):
                isolated[str(ek)] = str(ev)

        self._apply_tool_deps(isolated)

        # `env` is the explicit caller override and wins over everything above.
        for ek, ev in self.env.items():
            if "\x00" not in str(ek) and "\x00" not in str(ev):
                isolated[str(ek)] = str(ev)

        isolated["PYTHONIOENCODING"] = "utf-8"
        isolated["PYTHONUNBUFFERED"] = "1"
        return isolated

    async def run(
        self,
        cancel_event: asyncio.Event | None = None,
        progress_queue: asyncio.Queue[dict[str, Any]] | None = None,
        log_file: Path | None = None,
        truncate_log: bool = False,
    ) -> SubprocessResult:
        """``log_file`` is appended to by default, so callers that share one log
        across several steps (``declarative.CommandTool`` writes every step of a
        run into ``execution.log``) keep accumulating it. A caller whose log
        belongs to a single invocation passes ``truncate_log=True`` so the file
        starts empty and only holds what that invocation wrote."""
        start_time = time.monotonic()
        env = self._build_isolated_env()
        self.cwd.mkdir(parents=True, exist_ok=True)

        kwargs: dict[str, Any] = {
            "stdout": asyncio.subprocess.PIPE,
            "stderr": asyncio.subprocess.PIPE,
            "cwd": str(self.cwd),
            "env": env,
            "limit": 2**20,  # 1MB line buffer
        }
        if sys.platform != "win32":
            kwargs["start_new_session"] = True
        else:
            kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP

        self._proc = await asyncio.create_subprocess_exec(*self.command, **kwargs)

        stdout_lines: list[str] = []
        stderr_lines: list[str] = []
        log_mode = "w" if truncate_log else "a"
        log_handle = log_file.open(log_mode, encoding="utf-8") if log_file else None

        async def _read_stream(stream: asyncio.StreamReader | None, stream_name: str, buffer: list[str]):
            if stream is None:
                return
            partial = ""
            while True:
                chunk = await stream.read(4096)
                if not chunk:
                    if partial.strip():
                        _process_line(partial.strip(), stream_name, buffer)
                    break

                text = chunk.decode("utf-8", errors="replace")
                lines = re.split(r"[\r\n]+", partial + text)
                partial = lines.pop()

                for line in lines:
                    line_str = line.strip()
                    if line_str:
                        _process_line(line_str, stream_name, buffer)

        def _process_line(line_str: str, stream_name: str, buffer: list[str]):
            buffer.append(line_str)
            if log_handle:
                log_handle.write(f"[{stream_name}] {line_str}\n")
                log_handle.flush()

            parsed = self.progress_parser(line_str) if self.progress_parser else None
            if progress_queue:
                event_data = {"stream": stream_name, "line": line_str, "timestamp": time.time()}
                if parsed:
                    event_data.update(parsed)
                try:
                    progress_queue.put_nowait(event_data)
                except Exception:
                    pass

        async def _cancellation_monitor():
            if cancel_event:
                await cancel_event.wait()
                self._cancel_requested = True
                await self.terminate_process_group()

        cancel_task = asyncio.create_task(_cancellation_monitor())
        stdout_task = asyncio.create_task(_read_stream(self._proc.stdout, "stdout", stdout_lines))
        stderr_task = asyncio.create_task(_read_stream(self._proc.stderr, "stderr", stderr_lines))

        timed_out = False
        try:
            if self.timeout:
                await asyncio.wait_for(
                    asyncio.gather(stdout_task, stderr_task, self._proc.wait()),
                    timeout=self.timeout,
                )
            else:
                await asyncio.gather(stdout_task, stderr_task, self._proc.wait())
        except asyncio.TimeoutError:
            timed_out = True
            await self.terminate_process_group()
            await asyncio.gather(stdout_task, stderr_task, return_exceptions=True)
        finally:
            cancel_task.cancel()
            if log_handle:
                try:
                    log_handle.close()
                except Exception:
                    pass

        duration = time.monotonic() - start_time
        exit_code = self._proc.returncode if self._proc.returncode is not None else -1

        return SubprocessResult(
            exit_code=exit_code,
            stdout="\n".join(stdout_lines),
            stderr="\n".join(stderr_lines),
            duration_seconds=duration,
            timed_out=timed_out,
            cancelled=self._cancel_requested,
        )

    async def terminate_process_group(self) -> None:
        """3-stage termination: SIGINT -> SIGTERM -> SIGKILL with PID reaping."""
        if not self._proc or self._proc.returncode is not None:
            return

        pid = self._proc.pid
        if sys.platform != "win32":
            try:
                pgid = os.getpgid(pid)
                os.killpg(pgid, signal.SIGINT)
                for _ in range(int(self.grace_period * 10)):
                    if self._proc.returncode is not None:
                        return
                    await asyncio.sleep(0.1)

                if self._proc.returncode is None:
                    os.killpg(pgid, signal.SIGTERM)
                    await asyncio.sleep(1.0)

                if self._proc.returncode is None:
                    os.killpg(pgid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            finally:
                try:
                    await asyncio.wait_for(self._proc.wait(), timeout=2.0)
                except Exception:
                    pass
        else:
            try:
                os.kill(pid, signal.CTRL_BREAK_EVENT)
                await asyncio.sleep(self.grace_period)
            except Exception:
                pass

            if self._proc.returncode is None:
                try:
                    kill_proc = await asyncio.create_subprocess_exec(
                        "taskkill", "/F", "/T", "/PID", str(pid),
                        stdout=asyncio.subprocess.DEVNULL,
                        stderr=asyncio.subprocess.DEVNULL,
                    )
                    await kill_proc.wait()
                except Exception:
                    self._proc.kill()
            try:
                await asyncio.wait_for(self._proc.wait(), timeout=2.0)
            except Exception:
                pass
