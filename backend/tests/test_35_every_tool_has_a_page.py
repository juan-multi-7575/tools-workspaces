import re
from pathlib import Path

FRONTEND_SRC = Path(__file__).resolve().parents[2] / "frontend" / "src"
REGISTRY = FRONTEND_SRC / "lib" / "toolPageModules.ts"

# Folded into the downloader page as sections, per the approved design.
HELPERS_HOSTED_BY_DOWNLOADER = {
    "media.download.resolve",
    "media.download.format_select",
    "media.subtitle.fetch",
    "media.thumbnail.get",
}


def _registered_page_ids() -> set[str]:
    """Every key of BESPOKE_PAGES, quoted (``'gallery-dl'``) or bare (``trimmer``)."""
    source = REGISTRY.read_text(encoding="utf-8")
    body = source.split("BESPOKE_PAGES", 1)[1]
    return set(re.findall(r"['\"]?([\w.\-]+)['\"]?\s*:\s*\w+Page", body))


def test_every_registered_tool_has_a_page(client):
    tools = client.get("/api/tools").json()["tools"]
    registered = {t["id"] for t in tools}
    deprecated = {t["id"] for t in tools if "[deprecated alias]" in (t.get("description") or "")}
    page_ids = _registered_page_ids() | HELPERS_HOSTED_BY_DOWNLOADER
    missing = sorted(registered - deprecated - page_ids)
    assert not missing, f"tools with no page: {missing}"


def test_no_page_registered_for_unknown_tool(client):
    registered = {t["id"] for t in client.get("/api/tools").json()["tools"]}
    unknown = sorted(_registered_page_ids() - registered)
    assert not unknown, f"pages registered for unknown tools: {unknown}"
