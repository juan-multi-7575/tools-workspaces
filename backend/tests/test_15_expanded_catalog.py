import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.registry import list_manifests, get
from app.tools.base import ToolRunContext


@pytest.fixture
def client(tmp_path, monkeypatch):
    from app import paths
    d = tmp_path / "downloads"
    w = tmp_path / "workspaces"
    c = tmp_path / "config"
    monkeypatch.setattr(paths, "DOWNLOADS", d)
    monkeypatch.setattr(paths, "WORKSPACES", w)
    monkeypatch.setattr(paths, "CONFIG", c)
    paths.ensure_layout()
    return TestClient(app)


def test_expanded_catalog_manifests(client):
    manifests = list_manifests()
    ids = {m.id for m in manifests}
    categories = {m.category for m in manifests}

    # Verify domains are represented
    assert "pandoc" in ids
    assert "pdf_tools" in ids
    assert "imagemagick" in ids
    assert "exif_scrubber" in ids
    assert "codec_tool" in ids
    assert "summarizer" in ids
    assert "sys.health.check" in ids
    assert "script_runner" in ids

    assert "Documents" in categories
    assert "Images" in categories
    assert "Security" in categories
    assert "AI & Tutoring" in categories
    assert "Custom / Personal" in categories


@pytest.mark.anyio
async def test_execute_security_codec(tmp_path):
    tool = get("codec_tool")
    ctx = ToolRunContext(
        kind="standalone",
        destination=str(tmp_path / "out"),
        params={"text": "hello tools garage", "codec": "base64_encode"},
    )
    res = await tool.execute(ctx)
    assert res.status == "completed"
    assert len(res.artifacts) == 1
    assert res.data is not None
    assert res.data["output"] == "aGVsbG8gdG9vbHMgZ2FyYWdl"


@pytest.mark.anyio
async def test_execute_ai_summarizer(tmp_path):
    tool = get("summarizer")
    ctx = ToolRunContext(
        kind="standalone",
        destination=str(tmp_path / "out"),
        params={
            "text": "Artificial intelligence is transforming tools. Fast pipelines enable rapid iteration. Machine learning accelerates workflows.",
            "max_bullets": 2,
        },
    )
    res = await tool.execute(ctx)
    assert res.status == "completed"
    assert len(res.artifacts) == 1
    assert res.data is not None
    assert len(res.data["takeaways"]) <= 2


@pytest.mark.anyio
async def test_execute_custom_script_runner(tmp_path):
    tool = get("script_runner")
    ctx = ToolRunContext(
        kind="standalone",
        destination=str(tmp_path / "out"),
        params={"language": "python", "code": "print('Custom tool works')"},
    )
    res = await tool.execute(ctx)
    assert res.status == "completed"
