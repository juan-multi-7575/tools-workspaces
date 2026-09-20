from __future__ import annotations

import sys
from pathlib import Path
from app.paths import run_dir, tool_downloads_dir
from app.runners.subprocess_runner import AsyncSubprocessRunner
from app.tools.base import Artifact, PortKind, Tool, ToolManifest, ToolResult, ToolRunContext


class ScriptRunnerTool(Tool):
    manifest = ToolManifest(
        id="script_runner",
        name="Custom Python & Shell Script Runner",
        description="Execute custom user-built Python or Shell scripts, experimental tools, and prototypes.",
        category="Custom / Personal",
        tags=["custom", "script", "python", "bash", "developer", "prototype"],
        input_kinds=[PortKind.any],
        output_kinds=[PortKind.any, PortKind.text, PortKind.json],
        parameters_schema={
            "language": {"type": "string", "enum": ["python", "bash"], "default": "python"},
            "code": {"type": "string", "default": "print('Custom tool execution')"},
            "custom_args": {"type": "string", "default": ""},
            "timeout": {"type": "number", "default": 300, "description": "Maximum execution time in seconds"},
        },
    )

    async def execute(self, context: ToolRunContext) -> ToolResult:
        dest_dir = tool_downloads_dir("script_runner") if context.kind == "standalone" else run_dir(context.workspace_id or "tmp", context.run_id or "tmp")
        dest_dir.mkdir(parents=True, exist_ok=True)

        lang = context.params.get("language", "python")
        code = context.params.get("code", "")
        custom_args = context.params.get("custom_args", "")

        if lang not in ("python", "bash"):
            return ToolResult(artifacts=[], status="failed", error=f"unsupported language: {lang}")
        if not code or not str(code).strip():
            return ToolResult(artifacts=[], status="failed", error="code is required")
        try:
            timeout = float(context.params.get("timeout", 300))
        except (TypeError, ValueError):
            timeout = 300.0
        timeout = min(timeout, 3600.0)  # cap user override so arbitrary code cannot run forever

        script_file = dest_dir / ("user_script.py" if lang == "python" else "user_script.sh")
        script_file.write_text(code, encoding="utf-8")

        if lang == "python":
            cmd = [sys.executable, str(script_file)]
        else:
            cmd = ["bash", str(script_file)]

        if custom_args:
            cmd.extend([a for a in custom_args.split() if a])

        runner = AsyncSubprocessRunner(command=cmd, cwd=dest_dir, timeout=timeout)
        log_file = dest_dir / "output.log"
        try:
            res = await runner.run(
                cancel_event=context.cancel_event,
                progress_queue=context.progress_queue,
                log_file=log_file,
            )
        except FileNotFoundError:
            return ToolResult(artifacts=[], status="failed", error="bash not installed")

        if res.cancelled:
            return ToolResult(artifacts=[], status="cancelled", error="Cancelled by user", duration_seconds=res.duration_seconds)
        if res.timed_out:
            return ToolResult(artifacts=[], status="failed", error=f"Script timed out after {timeout:.0f}s", duration_seconds=res.duration_seconds)
        if res.exit_code != 0:
            return ToolResult(artifacts=[], status="failed", error=res.stderr or f"Script exited with {res.exit_code}", duration_seconds=res.duration_seconds)

        artifacts = [
            Artifact(path=str(p), kind=PortKind.any, name=p.name)
            for p in dest_dir.iterdir()
            if p.is_file() and p.name != script_file.name
        ]

        out_log = log_file.read_text(encoding="utf-8", errors="replace") if log_file.exists() else res.stdout
        return ToolResult(
            artifacts=artifacts,
            status="completed",
            duration_seconds=res.duration_seconds,
            output_text=out_log,
            data={"exit_code": res.exit_code, "stdout": out_log, "stderr": res.stderr},
        )
