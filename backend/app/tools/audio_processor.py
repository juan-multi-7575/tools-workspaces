from pathlib import Path

from app.paths import run_dir, tool_downloads_dir
from app.tools.base import (
    Artifact,
    PortKind,
    Tool,
    ToolManifest,
    ToolRunContext,
    ToolResult,
)


class AudioProcessorTool(Tool):
    manifest = ToolManifest(
        id="audio_processor",
        name="Audio Processor",
        description="Convert and resample audio files.",
        input_kinds=[PortKind.audio],
        output_kinds=[PortKind.audio],
        parameters_schema={
            "format": {"type": "string", "enum": ["wav", "mp3", "flac", "ogg", "m4a"]},
            "sample_rate": {"type": "number", "enum": [22050, 44100, 48000]},
        },
    )

    async def execute(self, context: ToolRunContext) -> ToolResult:
        input_path = context.params.get("input_path")
        fmt = context.params.get("format", "wav")
        sr = context.params.get("sample_rate", 44100)
        if not input_path:
            return ToolResult(artifacts=[], status="failed", error="input_path is required")

        src = Path(input_path)
        if not src.exists():
            return ToolResult(artifacts=[], status="failed", error="input file not found")

        if context.kind == "standalone":
            dest_dir = tool_downloads_dir("audio_processor")
        else:
            dest_dir = run_dir(context.workspace_id or "tmp", context.run_id or "tmp")

        out_name = f"{src.stem}.{fmt}"
        out_path = dest_dir / out_name
        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            str(src),
            "-ar",
            str(sr),
            "-ac",
            "2",
            str(out_path),
        ]
        try:
            import subprocess

            subprocess.run(cmd, check=True, capture_output=True)
        except Exception as e:
            return ToolResult(artifacts=[], status="failed", error=str(e))

        return ToolResult(
            artifacts=[Artifact(path=str(out_path), kind=PortKind.audio, name=out_name)],
            status="completed",
        )
