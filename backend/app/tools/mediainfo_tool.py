import zipfile
from pathlib import Path

from app.tools.base import Tool, ToolManifest, ToolRunContext, ToolResult, Artifact, PortKind
from app.paths import tool_downloads_dir, run_dir
from app.runners.subprocess_runner import AsyncSubprocessRunner


class MediainfoTool(Tool):
    manifest = ToolManifest(
        id="mediainfo",
        name="Media Metadata & Stream Inspector (MediaInfo)",
        description="Inspect audio, video, container, bitrate, and codec metadata via FFprobe.",
        category="Media",
        tags=["media", "metadata", "ffprobe", "video", "audio", "inspector"],
        input_kinds=[PortKind.video, PortKind.audio, PortKind.any],
        output_kinds=[PortKind.json, PortKind.text],
        parameters_schema={"input_path": {"type": "string", "title": "Media File Path", "default": ""}},
    )

    async def execute(self, context: ToolRunContext) -> ToolResult:
        input_path = context.params.get("input_path") or context.params.get("path")
        if not input_path:
            return ToolResult(artifacts=[], status="failed", error="input_path is required")
        src = Path(input_path)
        if not src.exists():
            return ToolResult(artifacts=[], status="failed", error=f"input file not found: {input_path}")
        dest = tool_downloads_dir("mediainfo") if context.kind == "standalone" else run_dir(
            context.workspace_id or "tmp", context.run_id or "tmp"
        )
        dest.mkdir(parents=True, exist_ok=True)
        out = dest / f"{src.stem}_info.json"
        cmd = ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", str(src)]
        runner = AsyncSubprocessRunner(command=cmd, cwd=dest, timeout=120)
        try:
            res = await runner.run(cancel_event=context.cancel_event, progress_queue=context.progress_queue)
        except FileNotFoundError:
            return ToolResult(artifacts=[], status="failed", error="ffprobe not installed")
        if res.cancelled:
            return ToolResult(artifacts=[], status="cancelled", error="cancelled")
        if res.timed_out:
            return ToolResult(artifacts=[], status="failed", error=f"ffprobe timed out after {res.duration_seconds:.0f}s")
        if res.exit_code != 0:
            return ToolResult(artifacts=[], status="failed", error=res.stderr or f"ffprobe exited with {res.exit_code}")
        out.write_text(res.stdout, encoding="utf-8")
        parsed_data = {}
        try:
            import json
            parsed_data = json.loads(res.stdout)
        except Exception:
            pass
        return ToolResult(
            artifacts=[Artifact(path=str(out), kind=PortKind.json, name=out.name)],
            status="completed",
            data=parsed_data,
            output_text=res.stdout,
        )


class StreamlinkTool(Tool):
    manifest = ToolManifest(
        id="streamlink",
        name="Live Stream Capturer (Streamlink)",
        description="Capture and record live HLS/DASH video streams from Twitch, YouTube Live, and streaming sites.",
        category="Media",
        tags=["media", "stream", "live", "streamlink", "video"],
        input_kinds=[PortKind.any, PortKind.stream],
        output_kinds=[PortKind.video, PortKind.any],
        parameters_schema={"url": {"type": "string"}},
    )

    async def execute(self, context: ToolRunContext) -> ToolResult:
        url = context.params.get("url")
        if not url:
            return ToolResult(artifacts=[], status="failed", error="url is required")
        dest = tool_downloads_dir("streamlink") if context.kind == "standalone" else run_dir(
            context.workspace_id or "tmp", context.run_id or "tmp"
        )
        dest.mkdir(parents=True, exist_ok=True)
        out = dest / "stream.mp4"

        # Try real streamlink CLI
        cmd = ["streamlink", "--output", str(out), url, "best,worst"]
        runner = AsyncSubprocessRunner(command=cmd, cwd=dest, timeout=120)
        try:
            res = await runner.run(cancel_event=context.cancel_event, progress_queue=context.progress_queue)
        except FileNotFoundError:
            res = None

        if res is not None:
            if res.cancelled:
                return ToolResult(artifacts=[], status="cancelled", error="cancelled")
            if res.timed_out:
                return ToolResult(artifacts=[], status="failed", error=f"streamlink timed out after {res.duration_seconds:.0f}s")
            if res.exit_code == 0 and out.exists() and out.stat().st_size > 0:
                return ToolResult(artifacts=[Artifact(path=str(out), kind=PortKind.any, name=out.name)], status="completed")

        # Fallback to yt-dlp
        cmd_ytdlp = ["yt-dlp", "-o", str(out), url]
        runner_ytdlp = AsyncSubprocessRunner(command=cmd_ytdlp, cwd=dest, timeout=120)
        try:
            res_ytdlp = await runner_ytdlp.run(cancel_event=context.cancel_event, progress_queue=context.progress_queue)
        except FileNotFoundError:
            return ToolResult(artifacts=[], status="failed", error="yt-dlp not installed")
        if res_ytdlp.cancelled:
            return ToolResult(artifacts=[], status="cancelled", error="cancelled")
        if res_ytdlp.timed_out:
            return ToolResult(artifacts=[], status="failed", error=f"yt-dlp timed out after {res_ytdlp.duration_seconds:.0f}s")
        if res_ytdlp.exit_code == 0 and out.exists() and out.stat().st_size > 0:
            return ToolResult(artifacts=[Artifact(path=str(out), kind=PortKind.any, name=out.name)], status="completed")
        return ToolResult(artifacts=[], status="failed", error=res_ytdlp.stderr or f"yt-dlp exited with {res_ytdlp.exit_code}")


class OcrmypdfTool(Tool):
    manifest = ToolManifest(
        id="ocrmypdf",
        name="OCR Document Scanner (OCRmyPDF)",
        description="Apply Optical Character Recognition (OCR) to scanned PDFs and images to generate searchable text PDFs.",
        category="Documents",
        tags=["document", "pdf", "ocr", "scanner", "text"],
        input_kinds=[PortKind.document, PortKind.image, PortKind.any],
        output_kinds=[PortKind.document],
        parameters_schema={"input_pdf": {"type": "string"}},
    )

    async def execute(self, context: ToolRunContext) -> ToolResult:
        input_pdf = context.params.get("input_pdf") or context.params.get("input_path")
        if not input_pdf:
            return ToolResult(artifacts=[], status="failed", error="input_pdf is required")
        src = Path(input_pdf)
        if not src.exists():
            return ToolResult(artifacts=[], status="failed", error=f"input file not found: {input_pdf}")
        dest = tool_downloads_dir("ocrmypdf") if context.kind == "standalone" else run_dir(
            context.workspace_id or "tmp", context.run_id or "tmp"
        )
        dest.mkdir(parents=True, exist_ok=True)
        out = dest / "ocr.pdf"

        cmd = ["ocrmypdf", "--force-ocr", str(src), str(out)]
        runner = AsyncSubprocessRunner(command=cmd, cwd=dest, timeout=120)
        try:
            res = await runner.run(cancel_event=context.cancel_event, progress_queue=context.progress_queue)
        except FileNotFoundError:
            return ToolResult(artifacts=[], status="failed", error="ocrmypdf not installed")
        if res.cancelled:
            return ToolResult(artifacts=[], status="cancelled", error="cancelled")
        if res.timed_out:
            return ToolResult(artifacts=[], status="failed", error=f"ocrmypdf timed out after {res.duration_seconds:.0f}s")
        if res.exit_code != 0 or not out.exists():
            return ToolResult(artifacts=[], status="failed", error=res.stderr or f"ocrmypdf exited with {res.exit_code}")
        return ToolResult(artifacts=[Artifact(path=str(out), kind=PortKind.any, name=out.name)], status="completed")


class SoxTool(Tool):
    manifest = ToolManifest(
        id="sox",
        name="Sound Effects & DSP Filter (SoX)",
        description="Apply professional audio effects, normalization, pitch shifting, and noise filters via Sound eXchange.",
        category="Media",
        tags=["audio", "sox", "dsp", "effects", "filter"],
        input_kinds=[PortKind.audio],
        output_kinds=[PortKind.audio],
        parameters_schema={"effect": {"type": "string"}},
    )

    async def execute(self, context: ToolRunContext) -> ToolResult:
        input_path = context.params.get("input_path")
        effect = context.params.get("effect", "trim 0 10")
        if not isinstance(effect, str):
            return ToolResult(artifacts=[], status="failed", error="effect must be a string")
        if not input_path:
            return ToolResult(artifacts=[], status="failed", error="input_path is required")
        src = Path(input_path)
        if not src.exists():
            return ToolResult(artifacts=[], status="failed", error=f"input file not found: {input_path}")
        dest = tool_downloads_dir("sox") if context.kind == "standalone" else run_dir(
            context.workspace_id or "tmp", context.run_id or "tmp"
        )
        dest.mkdir(parents=True, exist_ok=True)
        out = dest / f"{Path(input_path).stem}_sox{Path(input_path).suffix}"
        cmd = ["sox", input_path, str(out)] + effect.split()
        runner = AsyncSubprocessRunner(command=cmd, cwd=dest, timeout=300)
        try:
            res = await runner.run(cancel_event=context.cancel_event, progress_queue=context.progress_queue)
        except FileNotFoundError:
            return ToolResult(artifacts=[], status="failed", error="sox not installed")
        if res.cancelled:
            return ToolResult(artifacts=[], status="cancelled", error="cancelled")
        if res.timed_out:
            return ToolResult(artifacts=[], status="failed", error=f"sox timed out after {res.duration_seconds:.0f}s")
        if res.exit_code != 0:
            return ToolResult(artifacts=[], status="failed", error=res.stderr or f"sox exited with {res.exit_code}")
        return ToolResult(artifacts=[Artifact(path=str(out), kind=PortKind.audio, name=out.name)], status="completed")


class GallerydlTool(Tool):
    manifest = ToolManifest(
        id="gallery-dl",
        name="Image & Gallery Scraper (gallery-dl)",
        description="Batch download image galleries, photo albums, and social media image sets.",
        category="Images",
        tags=["image", "gallery", "scraper", "download"],
        input_kinds=[PortKind.any],
        output_kinds=[PortKind.image, PortKind.binary, PortKind.any],
        parameters_schema={"url": {"type": "string"}},
    )

    async def execute(self, context: ToolRunContext) -> ToolResult:
        url = context.params.get("url")
        if not url:
            return ToolResult(artifacts=[], status="failed", error="url is required")
        dest = tool_downloads_dir("gallery-dl") if context.kind == "standalone" else run_dir(
            context.workspace_id or "tmp", context.run_id or "tmp"
        )
        dest.mkdir(parents=True, exist_ok=True)

        cmd = ["gallery-dl", "--directory", str(dest), url]
        runner = AsyncSubprocessRunner(command=cmd, cwd=dest, timeout=120)
        try:
            res = await runner.run(cancel_event=context.cancel_event, progress_queue=context.progress_queue)
        except FileNotFoundError:
            return ToolResult(artifacts=[], status="failed", error="gallery-dl not installed")
        if res.cancelled:
            return ToolResult(artifacts=[], status="cancelled", error="cancelled")
        if res.timed_out:
            return ToolResult(artifacts=[], status="failed", error=f"gallery-dl timed out after {res.duration_seconds:.0f}s")
        if res.exit_code != 0:
            return ToolResult(artifacts=[], status="failed", error=res.stderr or f"gallery-dl exited with {res.exit_code}")
        files = [p for p in dest.glob("**/*") if p.is_file() and p.name != "gallery.zip"]
        if not files:
            return ToolResult(artifacts=[], status="failed", error="gallery-dl produced no files")
        out_zip = dest / "gallery.zip"
        with zipfile.ZipFile(out_zip, "w", zipfile.ZIP_DEFLATED) as zf:
            for f in files:
                zf.write(f, f.name)
        return ToolResult(artifacts=[Artifact(path=str(out_zip), kind=PortKind.any, name=out_zip.name)], status="completed")


class DemucsTool(Tool):
    manifest = ToolManifest(
        id="demucs",
        name="AI Audio Stem Separator (Demucs)",
        description="Isolate vocal, drum, bass, and instrumental stems from songs and audio tracks using AI.",
        category="Media",
        tags=["audio", "ai", "stems", "demucs", "music", "separator"],
        input_kinds=[PortKind.audio, PortKind.video, PortKind.any],
        output_kinds=[PortKind.audio, PortKind.binary],
        parameters_schema={"input_path": {"type": "string"}},
    )

    async def execute(self, context: ToolRunContext) -> ToolResult:
        input_path = context.params.get("input_path")
        if not input_path:
            return ToolResult(artifacts=[], status="failed", error="input_path is required")
        src = Path(input_path)
        if not src.exists():
            return ToolResult(artifacts=[], status="failed", error=f"input file not found: {input_path}")
        dest = tool_downloads_dir("demucs") if context.kind == "standalone" else run_dir(
            context.workspace_id or "tmp", context.run_id or "tmp"
        )
        dest.mkdir(parents=True, exist_ok=True)

        cmd = ["demucs", "--out", str(dest), str(src)]
        runner = AsyncSubprocessRunner(command=cmd, cwd=dest, timeout=300)
        try:
            res = await runner.run(cancel_event=context.cancel_event, progress_queue=context.progress_queue)
        except FileNotFoundError:
            return ToolResult(artifacts=[], status="failed", error="demucs not installed")
        if res.cancelled:
            return ToolResult(artifacts=[], status="cancelled", error="cancelled")
        if res.timed_out:
            return ToolResult(artifacts=[], status="failed", error=f"demucs timed out after {res.duration_seconds:.0f}s")
        if res.exit_code != 0:
            return ToolResult(artifacts=[], status="failed", error=res.stderr or f"demucs exited with {res.exit_code}")
        files = [p for p in dest.glob("**/*") if p.is_file() and p.name != "stems.zip"]
        if not files:
            return ToolResult(artifacts=[], status="failed", error="demucs produced no files")
        out_zip = dest / "stems.zip"
        with zipfile.ZipFile(out_zip, "w", zipfile.ZIP_DEFLATED) as zf:
            for f in files:
                zf.write(f, f.relative_to(dest))
        return ToolResult(artifacts=[Artifact(path=str(out_zip), kind=PortKind.audio, name=out_zip.name)], status="completed")
