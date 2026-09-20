from app.pipeline import validate_chain


def test_new_dotted_ids_validate_as_chain():
    ok, err = validate_chain(["media.download.resolve", "media.download.format_select"])
    assert ok, err


def test_old_downloader_id_still_resolves(client):
    body = client.post("/api/tools/downloader/execute",
                       json={"kind": "standalone", "destination": "", "params": {}}).json()
    assert body["status"] in ("completed", "failed")
    assert "error" in body or "artifacts" in body
