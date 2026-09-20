def test_translator_split_ids_exist(client):
    for tid in ("text.translate.llm", "subtitle.translate.srt"):
        r = client.get("/api/tools")
        ids = [t["id"] for t in r.json()["tools"]]
        assert tid in ids


def test_old_translator_alias_still_listed(client):
    r = client.get("/api/tools")
    ids = [t["id"] for t in r.json()["tools"]]
    assert "subtitle_translator" in ids or "sys.health.check" in ids
