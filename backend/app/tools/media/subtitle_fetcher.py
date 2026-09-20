from app.tools.base import Artifact, Tool, ToolManifest, ToolRunContext, ToolResult


class SubtitleFetcherTool(Tool):
    manifest = ToolManifest(
        id="media.subtitle.fetch",
        name="Subtitle Fetcher",
        description="Fetch subtitle tracks for a media source (stub).",
        category="Media",
        tags=["media", "subtitles"],
        input_kinds=["video"],
        output_kinds=["document"],
        parameters_schema={
            "input_path": {"type": "string", "title": "Input media path"},
            "url": {"type": "string", "title": "Media URL"},
        },
    )

    async def execute(self, context: ToolRunContext) -> ToolResult:
        params = context.params or {}
        src = params.get("input_path") or params.get("url", "")
        if not src:
            return ToolResult(artifacts=[], status="failed", error="input file not found: input_path is required")
        return ToolResult(artifacts=[Artifact(path=src, kind="document", name="subtitle.srt")],
                          status="completed", output_text=src)
