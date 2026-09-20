from app import registry
from app.registry import REGISTRY, _ALIASES, _SOURCES
from app.tools.base import Tool, ToolManifest, ToolRunContext, ToolResult

PROBE_ID = "media.test.collision.probe"


class _T1(Tool):
    manifest = ToolManifest(id=PROBE_ID, name="t1", description="t1",
                            input_kinds=["any"], output_kinds=["any"], parameters_schema={})
    async def execute(self, context: ToolRunContext) -> ToolResult:
        return ToolResult(artifacts=[], status="completed")


class _T2(Tool):
    manifest = ToolManifest(id=PROBE_ID, name="t2", description="t2",
                            input_kinds=["any"], output_kinds=["any"], parameters_schema={})
    async def execute(self, context: ToolRunContext) -> ToolResult:
        return ToolResult(artifacts=[], status="completed")


def test_duplicate_dotted_id_fails_with_both_files():
    snapshots = [dict(REGISTRY), dict(_SOURCES), dict(_ALIASES)]
    try:
        registry.register(_T1())
        try:
            registry.register(_T2())
        except ValueError as e:
            assert PROBE_ID in str(e)
        else:
            raise AssertionError("expected ValueError for duplicate id")
    finally:
        for store, snapshot in zip((REGISTRY, _SOURCES, _ALIASES), snapshots):
            store.clear()
            store.update(snapshot)
