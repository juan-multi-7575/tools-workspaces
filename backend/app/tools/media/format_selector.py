from app.tools.base import Artifact, Tool, ToolManifest, ToolRunContext, ToolResult


class FormatSelectorTool(Tool):
    manifest = ToolManifest(
        id="media.download.format_select",
        name="Format Selector",
        description="Select a download format preset for a resolved media URL.",
        category="Media",
        tags=["media", "download", "format"],
        input_kinds=["any"],
        output_kinds=["video", "audio"],
        parameters_schema={
            "url": {"type": "string", "title": "Media URL"},
            "format": {"type": "string", "title": "Format preset", "default": "best"},
        },
    )

    async def execute(self, context: ToolRunContext) -> ToolResult:
        params = context.params or {}
        url = params.get("url", "")
        if not url:
            return ToolResult(artifacts=[], status="failed", error="input file not found: url is required")
        fmt = params.get("format", "best")
        return ToolResult(artifacts=[Artifact(path=url, kind="video", name="format.txt")],
                          status="completed", output_text=f"{url}@{fmt}")
