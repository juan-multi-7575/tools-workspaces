from __future__ import annotations

from pathlib import Path
import json
from app.paths import run_dir, tool_downloads_dir
from app.runners.subprocess_runner import AsyncSubprocessRunner
from app.tools.base import Artifact, PortKind, Tool, ToolManifest, ToolResult, ToolRunContext


class ImageMagickTool(Tool):
    manifest = ToolManifest(
        id="imagemagick",
        name="Image Converter & Resizer (ImageMagick)",
        description="Convert image formats (PNG, JPG, WebP), crop, optimize, and resize images.",
        category="Images",
        tags=["image", "imagemagick", "converter", "resizer"],
        input_kinds=[PortKind.image],
        output_kinds=[PortKind.image],
        parameters_schema={
            "input_path": {
                "type": "string",
                "title": "Input Image File",
                "description": "Path to input image file (PNG, JPG, WebP, etc.).",
                "default": "",
            },
            "format": {"type": "string", "title": "Target Format", "enum": ["png", "jpg", "webp"], "default": "webp"},
            "quality": {"type": "number", "title": "Quality (1-100)", "default": 85},
            "resize": {"type": "string", "title": "Resize Geometry", "placeholder": "e.g. 800x600, 50%", "default": ""},
        },
    )

    async def execute(self, context: ToolRunContext) -> ToolResult:
        input_path = context.params.get("input_path")
        if not input_path:
            return ToolResult(artifacts=[], status="failed", error="input_path is required")

        src = Path(input_path)
        if not src.exists():
            return ToolResult(artifacts=[], status="failed", error=f"input file not found: {input_path}")

        dest_dir = tool_downloads_dir("imagemagick") if context.kind == "standalone" else run_dir(context.workspace_id or "tmp", context.run_id or "tmp")
        dest_dir.mkdir(parents=True, exist_ok=True)

        fmt = context.params.get("format", "webp")
        quality = context.params.get("quality", 85)
        resize = context.params.get("resize") or ""
        out_name = f"{src.stem}.{fmt}"
        out_path = dest_dir / out_name

        cmd = ["magick", str(src)]
        if resize:
            cmd += ["-resize", str(resize)]
        cmd += ["-quality", str(quality), str(out_path)]
        runner = AsyncSubprocessRunner(command=cmd, cwd=dest_dir, tool_id=self.manifest.id)
        try:
            res = await runner.run(cancel_event=context.cancel_event, progress_queue=context.progress_queue)
        except FileNotFoundError:
            return ToolResult(artifacts=[], status="failed", error="ImageMagick (magick) not installed")

        if res.cancelled:
            return ToolResult(artifacts=[], status="cancelled", error="cancelled")

        if res.exit_code != 0:
            return ToolResult(artifacts=[], status="failed", error=res.stderr or f"magick exited with {res.exit_code}")

        return ToolResult(
            artifacts=[Artifact(path=str(out_path), kind=PortKind.image, name=out_name)],
            status="completed",
            output_text=f"Converted image saved to {out_name}",
        )


class ExifScrubberTool(Tool):
    manifest = ToolManifest(
        id="exif_scrubber",
        name="EXIF Metadata Privacy Scrubber (ExifTool)",
        description="Extract and scrub private EXIF, GPS location, and camera metadata from images and media.",
        category="Security",
        tags=["image", "metadata", "privacy", "exiftool", "security"],
        input_kinds=[PortKind.image, PortKind.video, PortKind.any],
        output_kinds=[PortKind.image, PortKind.json],
        parameters_schema={
            "input_path": {
                "type": "string",
                "title": "Input Media / Image File",
                "description": "Path to file to scrub or inspect metadata.",
                "default": "",
            },
            "action": {"type": "string", "title": "Operation", "enum": ["scrub", "inspect"], "default": "scrub"},
        },
    )

    async def execute(self, context: ToolRunContext) -> ToolResult:
        input_path = context.params.get("input_path")
        if not input_path:
            return ToolResult(artifacts=[], status="failed", error="input_path is required")

        src = Path(input_path)
        if not src.exists():
            return ToolResult(artifacts=[], status="failed", error=f"input file not found: {input_path}")

        dest_dir = tool_downloads_dir("exif_scrubber") if context.kind == "standalone" else run_dir(context.workspace_id or "tmp", context.run_id or "tmp")
        dest_dir.mkdir(parents=True, exist_ok=True)

        action = context.params.get("action", "scrub")
        if action == "inspect":
            out_name = f"{src.stem}_exif.json"
            out_path = dest_dir / out_name
            runner = AsyncSubprocessRunner(command=["exiftool", "-j", str(src)], cwd=dest_dir, tool_id=self.manifest.id)
            try:
                res = await runner.run(cancel_event=context.cancel_event, progress_queue=context.progress_queue)
            except FileNotFoundError:
                return ToolResult(artifacts=[], status="failed", error="exiftool not installed (apt install libimage-exiftool-perl)")
            if res.cancelled:
                return ToolResult(artifacts=[], status="cancelled", error="cancelled")
            if res.exit_code != 0:
                return ToolResult(artifacts=[], status="failed", error=res.stderr or f"exiftool exited with {res.exit_code}")
            out_path.write_text(res.stdout, encoding="utf-8")
            parsed = {}
            try:
                parsed = json.loads(res.stdout)
                if isinstance(parsed, list) and len(parsed) > 0:
                    parsed = parsed[0]
            except Exception:
                pass
            return ToolResult(
                artifacts=[Artifact(path=str(out_path), kind=PortKind.json, name=out_name)],
                status="completed",
                data=parsed if isinstance(parsed, dict) else {},
                output_text=res.stdout,
            )
        else:
            out_name = f"{src.stem}_clean{src.suffix}"
            out_path = dest_dir / out_name
            out_path.unlink(missing_ok=True)
            runner = AsyncSubprocessRunner(command=["exiftool", "-all=", "-o", str(out_path), str(src)], cwd=dest_dir, tool_id=self.manifest.id)
            try:
                res = await runner.run(cancel_event=context.cancel_event, progress_queue=context.progress_queue)
            except FileNotFoundError:
                return ToolResult(artifacts=[], status="failed", error="exiftool not installed (apt install libimage-exiftool-perl)")
            if res.cancelled:
                return ToolResult(artifacts=[], status="cancelled", error="cancelled")
            if res.exit_code != 0 or not out_path.exists():
                return ToolResult(artifacts=[], status="failed", error=res.stderr or f"exiftool exited with {res.exit_code}")
            return ToolResult(
                artifacts=[Artifact(path=str(out_path), kind=PortKind.image, name=out_name)],
                status="completed",
                data={"scrubbed": True, "clean_file": out_name, "size_bytes": out_path.stat().st_size},
            )
