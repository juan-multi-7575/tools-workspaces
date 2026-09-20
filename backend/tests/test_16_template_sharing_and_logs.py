import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.workspaces import create_workspace, save_run_meta


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


def test_get_run_manifest_and_logs(client, tmp_path):
    ws = create_workspace("logs-test-ws")
    ws_id = ws["id"]
    run_id = "testrun123"

    # Save run metadata
    record = {
        "id": run_id,
        "run_id": run_id,
        "tool_id": "hash_calculator",
        "status": "completed",
        "params": {"algorithm": "sha256"},
        "artifacts": [],
    }
    save_run_meta(ws_id, run_id, record)

    # Fetch manifest
    resp = client.get(f"/api/workspaces/{ws_id}/runs/{run_id}/manifest")
    assert resp.status_code == 200
    manifest = resp.json()["manifest"]
    assert manifest["tool_id"] == "hash_calculator"
    assert manifest["status"] == "completed"

    # Fetch logs
    resp_logs = client.get(f"/api/workspaces/{ws_id}/runs/{run_id}/logs")
    assert resp_logs.status_code == 200
    assert "logs" in resp_logs.json()
