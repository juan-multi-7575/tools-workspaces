from app.tools.base import Artifact, Tool, ToolManifest, ToolRunContext, ToolResult


class ThumbnailFetcherTool(Tool):
    manifest = ToolManifest(
        id="media.thumbnail.get",
        name="Thumbnail Fetcher",
        description="Fetch the thumbnail image for a media source (stub).",
        category="Media",
        tags=["media", "thumbnail", "image"],
        input_kinds=["video"],
        output_kinds=["image"],
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
        return ToolResult(artifacts=[Artifact(path=src, kind="image", name="thumbnail.jpg")],
                          status="completed", output_text=src)
