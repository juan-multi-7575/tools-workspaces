from app.tools.base import Tool, ToolManifest, ToolRunContext, ToolResult, Artifact, PortKind
from app.paths import tool_downloads_dir, run_dir


class MediainfoTool(Tool):
    manifest = ToolManifest(
        id="mediainfo",
        name="Mediainfo",
        description="Probe media file properties.",
        input_kinds=[PortKind.any],
        output_kinds=[PortKind.text],
        parameters_schema={"path": {"type": "string"}},
    )

    async def execute(self, context: ToolRunContext) -> ToolResult:
        input_path = context.params.get("input_path") or context.params.get("path")
        if not input_path:
            return ToolResult(artifacts=[], status="failed", error="input_path is required")
        dest = tool_downloads_dir("mediainfo") if context.kind == "standalone" else run_dir(
            context.workspace_id or "tmp", context.run_id or "tmp"
        )
        out = dest / f"{Path(input_path).stem}_info.txt"
        out.write_text(f"probe info for {input_path}")
        return ToolResult(artifacts=[Artifact(path=str(out), kind=PortKind.text, name=out.name)], status="completed")


class StreamlinkTool(Tool):
    manifest = ToolManifest(
        id="streamlink",
        name="Streamlink",
        description="Capture live streams.",
        input_kinds=[PortKind.any],
        output_kinds=[PortKind.any],
        parameters_schema={"url": {"type": "string"}},
    )

    async def execute(self, context: ToolRunContext) -> ToolResult:
        url = context.params.get("url")
        if not url:
            return ToolResult(artifacts=[], status="failed", error="url is required")
        dest = tool_downloads_dir("streamlink") if context.kind == "standalone" else run_dir(
            context.workspace_id or "tmp", context.run_id or "tmp"
        )
        out = dest / "stream.mp4"
        out.write_text("placeholder stream")
        return ToolResult(artifacts=[Artifact(path=str(out), kind=PortKind.any, name=out.name)], status="completed")


class OcrmypdfTool(Tool):
    manifest = ToolManifest(
        id="ocrmypdf",
        name="OCRMypdf",
        description="Make scanned PDFs searchable.",
        input_kinds=[PortKind.any],
        output_kinds=[PortKind.any],
        parameters_schema={"input_pdf": {"type": "string"}},
    )

    async def execute(self, context: ToolRunContext) -> ToolResult:
        input_pdf = context.params.get("input_pdf") or context.params.get("input_path")
        if not input_pdf:
            return ToolResult(artifacts=[], status="failed", error="input_pdf is required")
        dest = tool_downloads_dir("ocrmypdf") if context.kind == "standalone" else run_dir(
            context.workspace_id or "tmp", context.run_id or "tmp"
        )
        out = dest / "ocr.pdf"
        out.write_text("placeholder ocr")
        return ToolResult(artifacts=[Artifact(path=str(out), kind=PortKind.any, name=out.name)], status="completed")


class SoxTool(Tool):
    manifest = ToolManifest(
        id="sox",
        name="SoX",
        description="Audio effects and filter chains.",
        input_kinds=[PortKind.audio],
        output_kinds=[PortKind.audio],
        parameters_schema={"effect": {"type": "string"}},
    )

    async def execute(self, context: ToolRunContext) -> ToolResult:
        input_path = context.params.get("input_path")
        effect = context.params.get("effect", "trim 0 10")
        if not input_path:
            return ToolResult(artifacts=[], status="failed", error="input_path is required")
        dest = tool_downloads_dir("sox") if context.kind == "standalone" else run_dir(
            context.workspace_id or "tmp", context.run_id or "tmp"
        )
        out = dest / f"{Path(input_path).stem}_sox{Path(input_path).suffix}"
        try:
            subprocess.run(
                ["sox", input_path, str(out)] + effect.split(),
                check=True,
                capture_output=True,
            )
        except Exception as e:
            return ToolResult(artifacts=[], status="failed", error=str(e))
        return ToolResult(artifacts=[Artifact(path=str(out), kind=PortKind.audio, name=out.name)], status="completed")


class GallerydlTool(Tool):
    manifest = ToolManifest(
        id="gallery-dl",
        name="Gallery-dl",
        description="Batch download image galleries.",
        input_kinds=[PortKind.any],
        output_kinds=[PortKind.any],
        parameters_schema={"url": {"type": "string"}},
    )

    async def execute(self, context: ToolRunContext) -> ToolResult:
        url = context.params.get("url")
        if not url:
            return ToolResult(artifacts=[], status="failed", error="url is required")
        dest = tool_downloads_dir("gallery-dl") if context.kind == "standalone" else run_dir(
            context.workspace_id or "tmp", context.run_id or "tmp"
        )
        out = dest / "gallery.zip"
        out.write_text("placeholder gallery")
        return ToolResult(artifacts=[Artifact(path=str(out), kind=PortKind.any, name=out.name)], status="completed")


class DemucsTool(Tool):
    manifest = ToolManifest(
        id="demucs",
        name="Demucs",
        description="Separate audio stems.",
        input_kinds=[PortKind.audio],
        output_kinds=[PortKind.audio],
        parameters_schema={"input_path": {"type": "string"}},
    )

    async def execute(self, context: ToolRunContext) -> ToolResult:
        input_path = context.params.get("input_path")
        if not input_path:
            return ToolResult(artifacts=[], status="failed", error="input_path is required")
        dest = tool_downloads_dir("demucs") if context.kind == "standalone" else run_dir(
            context.workspace_id or "tmp", context.run_id or "tmp"
        )
        out = dest / "stems.zip"
        out.write_text("placeholder stems")
        return ToolResult(artifacts=[Artifact(path=str(out), kind=PortKind.any, name=out.name)], status="completed")
