from app.tools.base import Artifact, Tool, ToolManifest, ToolRunContext, ToolResult


class UrlResolverTool(Tool):
    manifest = ToolManifest(
        id="media.download.resolve",
        name="URL Resolver",
        description="Validate a media URL and echo it as a portable artifact.",
        category="Media",
        tags=["media", "download", "url"],
        input_kinds=["any"],
        output_kinds=["any"],
        parameters_schema={"url": {"type": "string", "title": "Media URL"}},
    )

    async def execute(self, context: ToolRunContext) -> ToolResult:
        url = (context.params or {}).get("url", "")
        if not url:
            return ToolResult(artifacts=[], status="failed", error="input file not found: url is required")
        return ToolResult(artifacts=[Artifact(path=url, kind="any", name="url.txt")],
                          status="completed", output_text=url)
