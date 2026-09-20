from fastapi.testclient import TestClient
from app.main import app
from app.workspaces import list_workspace_media, list_pipeline_runs

client = TestClient(app)


def test_list_workspace_media():
    res = list_workspace_media("youtube")
    assert "categories" in res
    assert "packages" in res
    assert "video" in res["categories"]
    assert "subtitle" in res["categories"]


def test_list_pipeline_runs():
    runs = list_pipeline_runs("youtube")
    assert isinstance(runs, list)
    if runs:
        first = runs[0]
        assert "pipeline_run_id" in first
        assert "media" in first
        assert "steps" in first


def test_api_workspace_media():
    response = client.get("/api/workspaces/youtube/media")
    assert response.status_code == 200
    data = response.json()
    assert "categories" in data
    assert "packages" in data


def test_api_pipeline_runs():
    response = client.get("/api/workspaces/youtube/pipeline-runs")
    assert response.status_code == 200
    data = response.json()
    assert "pipeline_runs" in data


def test_api_mux_subtitles_validation():
    response = client.post("/api/workspaces/youtube/mux-subtitles", json={})
    assert response.status_code == 400
