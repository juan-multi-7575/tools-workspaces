from app import registry
from app.tools.base import Tool, ToolManifest, ToolRunContext, ToolResult


class _T1(Tool):
    manifest = ToolManifest(id="media.download.resolve", name="t1", description="t1",
                            input_kinds=["any"], output_kinds=["any"], parameters_schema={})
    async def execute(self, context: ToolRunContext) -> ToolResult:
        return ToolResult(artifacts=[], status="completed")


class _T2(Tool):
    manifest = ToolManifest(id="media.download.resolve", name="t2", description="t2",
                            input_kinds=["any"], output_kinds=["any"], parameters_schema={})
    async def execute(self, context: ToolRunContext) -> ToolResult:
        return ToolResult(artifacts=[], status="completed")


def test_duplicate_dotted_id_fails_with_both_files():
    registry.register(_T1())
    try:
        registry.register(_T2())
    except ValueError as e:
        assert "media.download.resolve" in str(e)
    else:
        raise AssertionError("expected ValueError for duplicate id")
