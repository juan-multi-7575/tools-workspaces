from __future__ import annotations

from pathlib import Path

from app.paths import run_dir, tool_downloads_dir
from app.runners.subprocess_runner import AsyncSubprocessRunner
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
        name="Audio Extractor & Processor (FFmpeg)",
        description="Extract audio tracks from video files or convert & resample audio (WAV, MP3, FLAC, M4A, OGG) via FFmpeg.",
        category="Media",
        tags=["audio", "ffmpeg", "converter", "extractor", "video-to-audio"],
        input_kinds=[PortKind.video, PortKind.audio],
        output_kinds=[PortKind.audio],
        parameters_schema={
            "format": {"type": "string", "enum": ["wav", "mp3", "flac", "ogg", "m4a"], "default": "wav"},
            "sample_rate": {"type": "number", "enum": [22050, 44100, 48000], "default": 44100, "unit": "Hz"},
        },
    )

    VALID_FORMATS = {"wav", "mp3", "flac", "ogg", "m4a"}
    VALID_SAMPLE_RATES = {22050, 44100, 48000}

    async def execute(self, context: ToolRunContext) -> ToolResult:
        input_path = context.params.get("input_path")
        fmt = context.params.get("format", "wav")
        sr = context.params.get("sample_rate", 44100)
        if not input_path:
            return ToolResult(artifacts=[], status="failed", error="input_path is required")

        if fmt not in self.VALID_FORMATS:
            return ToolResult(artifacts=[], status="failed", error=f"unsupported format: {fmt} (supported: {', '.join(sorted(self.VALID_FORMATS))})")
        try:
            sr = int(sr)
        except (TypeError, ValueError):
            return ToolResult(artifacts=[], status="failed", error=f"invalid sample_rate: {sr}")
        if sr not in self.VALID_SAMPLE_RATES:
            return ToolResult(artifacts=[], status="failed", error=f"unsupported sample_rate: {sr} (supported: {sorted(self.VALID_SAMPLE_RATES)})")

        src = Path(input_path)
        if not src.exists():
            return ToolResult(artifacts=[], status="failed", error="input file not found")

        if context.kind == "standalone":
            dest_dir = tool_downloads_dir("audio_processor")
        else:
            dest_dir = run_dir(context.workspace_id or "tmp", context.run_id or "tmp")

        dest_dir.mkdir(parents=True, exist_ok=True)
        out_name = f"{src.stem}.{fmt}"
        out_path = dest_dir / out_name
        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            str(src),
            "-vn",
            "-ar",
            str(sr),
            "-ac",
            "2",
            str(out_path),
        ]

        runner = AsyncSubprocessRunner(command=cmd, cwd=dest_dir, timeout=300)
        try:
            res = await runner.run(
                cancel_event=context.cancel_event,
                progress_queue=context.progress_queue,
            )
        except FileNotFoundError:
            return ToolResult(artifacts=[], status="failed", error="ffmpeg not installed")

        if res.timed_out:
            return ToolResult(artifacts=[], status="failed", error=f"ffmpeg timed out after {res.duration_seconds:.0f}s", duration_seconds=res.duration_seconds)
        if res.cancelled:
            return ToolResult(artifacts=[], status="cancelled", error="Cancelled by user", duration_seconds=res.duration_seconds)
        if res.exit_code != 0:
            return ToolResult(artifacts=[], status="failed", error=res.stderr or f"ffmpeg exited with {res.exit_code}", duration_seconds=res.duration_seconds)

        return ToolResult(
            artifacts=[Artifact(path=str(out_path), kind=PortKind.audio, name=out_name)],
            status="completed",
            duration_seconds=res.duration_seconds,
        )
