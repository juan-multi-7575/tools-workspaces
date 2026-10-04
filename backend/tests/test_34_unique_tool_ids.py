import re
from pathlib import Path

TOOLS_DIR = Path(__file__).resolve().parents[1] / "app" / "tools"


def test_subtitle_translator_declared_exactly_once():
    pattern = re.compile(r'id="subtitle\.translate\.srt"')
    declaring_files = [
        path.relative_to(TOOLS_DIR).as_posix()
        for path in TOOLS_DIR.rglob("*.py")
        if pattern.search(path.read_text(encoding="utf-8"))
    ]
    assert declaring_files == ["translator_tool.py"], (
        f"subtitle.translate.srt must be declared once, found in {declaring_files}"
    )


def test_catalog_exposes_subtitle_translator_once(client):
    ids = [t["id"] for t in client.get("/api/tools").json()["tools"]]
    assert ids.count("subtitle.translate.srt") == 1
    assert "subtitle_translator" in ids


def test_remaining_translator_module_is_importable():
    import app.tools.translator_tool  # noqa: F401