import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.paths import run_dir
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


def test_branch_from_run(client):
    ws = create_workspace("branch-test-ws")
    ws_id = ws["id"]
    run_id = "run-parent-1"

    # Create dummy artifact in run directory
    r_dir = run_dir(ws_id, run_id)
    (r_dir / "output.txt").write_text("parent artifact content", encoding="utf-8")

    record = {
        "id": run_id,
        "run_id": run_id,
        "tool_id": "summarizer",
        "status": "completed",
        "params": {"max_bullets": 3},
        "artifacts": [{"name": "output.txt", "path": str(r_dir / "output.txt"), "size": 23}],
    }
    save_run_meta(ws_id, run_id, record)

    resp = client.post(f"/api/workspaces/{ws_id}/runs/{run_id}/branch")
    assert resp.status_code == 200
    data = resp.json()
    assert data["run_id"] == run_id
    assert data["tool_id"] == "summarizer"
    assert len(data["artifacts"]) >= 1
    assert data["artifacts"][0]["name"] == "output.txt"
