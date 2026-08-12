import json

from app.paths import DOWNLOADS


def test_app_lists_tools(client):
    resp = client.get("/api/tools")
    assert resp.status_code == 200
    body = resp.json()
    ids = [t["id"] for t in body["tools"]]
    assert "audio_processor" in ids


def test_create_and_list_workspace(client):
    resp = client.post("/api/workspaces", json={"name": "Test"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "Test"
    assert "id" in body

    resp = client.get("/api/workspaces")
    assert resp.status_code == 200
    assert any(w["id"] == body["id"] for w in resp.json()["workspaces"])


def test_storage_layout_created(tmp_path):
    from app.paths import ensure_layout

    ensure_layout()
    assert (tmp_path / "downloads").exists()
    assert (tmp_path / "workspaces").exists()


def test_workspace_persists_after_restart(client, tmp_path):
    resp = client.post("/api/workspaces", json={"name": "Persist"})
    ws_id = resp.json()["id"]

    meta_path = tmp_path / "workspaces" / ws_id / "meta.json"
    assert meta_path.exists()

    data = json.loads(meta_path.read_text())
    assert data["id"] == ws_id
