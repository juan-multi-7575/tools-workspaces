def test_translator_split_ids_exist(client):
    for tid in ("text.translate.llm", "subtitle.translate.srt"):
        r = client.get("/api/tools")
        ids = [t["id"] for t in r.json()["tools"]]
        assert tid in ids


def test_old_translator_alias_still_listed(client):
    r = client.get("/api/tools")
    ids = [t["id"] for t in r.json()["tools"]]
    assert "subtitle_translator" in ids
    assert "text.translate.llm" in ids
    assert "ai_model_health_check" in ids
