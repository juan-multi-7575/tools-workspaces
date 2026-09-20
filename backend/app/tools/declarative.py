from __future__ import annotations

from pathlib import Path
from typing import Any, ClassVar
from app.paths import run_dir, tool_downloads_dir
from app.runners.subprocess_runner import AsyncSubprocessRunner
from app.tools.base import Artifact, PortKind, Tool, ToolManifest, ToolResult, ToolRunContext


class CommandTool(Tool):
    """Declarative base class for command-line tools.
    Subclasses only need to define `manifest` and `command_tokens`.
    """
    manifest: ToolManifest
    command_tokens: ClassVar[list[str]] = []
    input_param: str = "input_path"
    timeout: float | None = 300.0

    def _validate_params(self, params: dict[str, Any]) -> tuple[bool, str]:
        for key, spec in self.manifest.parameters_schema.items():
            if key in params:
                val = params[key]
                if "enum" in spec and val not in spec["enum"]:
                    return False, f"Parameter '{key}' must be one of {spec['enum']}, got '{val}'"
        return True, ""

    async def execute(self, context: ToolRunContext) -> ToolResult:
        dest_dir = (
            tool_downloads_dir(self.manifest.id)
            if context.kind == "standalone"
            else run_dir(context.workspace_id or "tmp", context.run_id or "tmp")
        )
        dest_dir.mkdir(parents=True, exist_ok=True)

        ok, err = self._validate_params(context.params)
        if not ok:
            return ToolResult(artifacts=[], status="failed", error=err)

        before_files = set(dest_dir.iterdir()) if dest_dir.exists() else set()

        input_path_str = context.params.get(self.input_param, "")
        input_file = Path(input_path_str) if input_path_str else Path("input")

        fmt_kwargs = {
            "input_path": str(input_file),
            "input_stem": input_file.stem,
            "destination": str(dest_dir),
            "dest_dir": str(dest_dir),
            **context.params,
        }

        resolved_tokens: list[str] = []
        try:
            for token_template in self.command_tokens:
                resolved_tokens.append(token_template.format(**fmt_kwargs))
        except KeyError as e:
            return ToolResult(artifacts=[], status="failed", error=f"Missing required parameter: {e}")

        runner = AsyncSubprocessRunner(
            command=resolved_tokens,
            cwd=dest_dir,
            timeout=self.timeout,
        )

        log_path = dest_dir / "execution.log"
        try:
            res = await runner.run(
                cancel_event=context.cancel_event,
                progress_queue=context.progress_queue,
                log_file=log_path,
            )
        except FileNotFoundError:
            binary = resolved_tokens[0] if resolved_tokens else "command"
            return ToolResult(artifacts=[], status="failed", error=f"{binary} not installed")

        if res.cancelled:
            return ToolResult(artifacts=[], status="cancelled", error="Cancelled by user", duration_seconds=res.duration_seconds)
        if res.timed_out:
            return ToolResult(artifacts=[], status="failed", error=f"Timed out after {self.timeout}s", duration_seconds=res.duration_seconds)
        if res.exit_code != 0:
            return ToolResult(artifacts=[], status="failed", error=res.stderr or f"Exited with code {res.exit_code}", duration_seconds=res.duration_seconds)

        after_files = set(dest_dir.iterdir()) if dest_dir.exists() else set()
        new_files = sorted(list(after_files - before_files), key=lambda p: p.name)

        output_kind = self.manifest.output_kinds[0] if self.manifest.output_kinds else PortKind.any
        artifacts = [
            Artifact(path=str(p), kind=output_kind, name=p.name)
            for p in new_files
            if p.is_file() and p.name != "execution.log"
        ]

        return ToolResult(artifacts=artifacts, status="completed", duration_seconds=res.duration_seconds)
