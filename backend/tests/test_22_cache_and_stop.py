import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.core.scheduler import stop_dag_pipeline
from app.core.cache import detect_existing_artifacts
from app.paths import workspace_runs_dir, run_dir
from app.workspaces import create_workspace, save_run_meta

client = TestClient(app)


def test_duplicate_detection_and_caching():
    ws_id = "test_cache_ws"
    create_workspace(ws_id)

    # Simulate an existing completed run with an artifact
    run_id = "run_existing_123"
    r_dir = run_dir(ws_id, run_id)
    r_dir.mkdir(parents=True, exist_ok=True)
    sample_file = r_dir / "sample_video.mp4"
    sample_file.write_bytes(b"dummy video data")

    record = {
        "id": run_id,
        "run_id": run_id,
        "tool_id": "downloader",
        "status": "completed",
        "params": {"url": "https://www.youtube.com/watch?v=sample123"},
        "artifacts": [{"name": "sample_video.mp4", "path": str(sample_file), "size": len(b"dummy video data")}],
    }
    save_run_meta(ws_id, run_id, record)

    # Check duplicate detection for same URL
    check_res = detect_existing_artifacts(
        ws_id,
        nodes=[{"id": "n1", "tool_id": "downloader", "params": {"url": "https://www.youtube.com/watch?v=sample123"}}],
        params_by_node={"n1": {"url": "https://www.youtube.com/watch?v=sample123"}},
    )

    assert check_res["has_existing"] is True
    assert len(check_res["matches"]) == 1
    assert check_res["matches"][0]["node_id"] == "n1"
    assert check_res["matches"][0]["artifacts"][0]["name"] == "sample_video.mp4"


def test_stop_pipeline_endpoint():
    res = client.post("/api/workspaces/test_cache_ws/pipeline/stop")
    assert res.status_code == 200
    # Returns whether a running pipeline was actively stopped
    assert "stopped" in res.json()


def test_delete_media_endpoint():
    ws_id = "test_cache_ws"
    # Create file to delete
    r_dir = run_dir(ws_id, "run_del_test")
    r_dir.mkdir(parents=True, exist_ok=True)
    target = r_dir / "to_delete.txt"
    target.write_text("temporary")

    res = client.delete(f"/api/workspaces/{ws_id}/media/to_delete.txt")
    assert res.status_code == 200
    assert res.json()["deleted"] is True
    assert not target.exists()


def test_cache_stem_exact_match():
    ws = "test_cache_stem"
    create_workspace(ws)
    r_dir = run_dir(ws, "run_cat")
    r_dir.mkdir(parents=True, exist_ok=True)
    (r_dir / "concatenate.mp4").write_bytes(b"x")
    save_run_meta(ws, "run_cat", {"id": "run_cat", "tool_id": "downloader", "status": "completed", "params": {"url": "https://example.com/cat", "task": "translate"}, "artifacts": [{"name": "concatenate.mp4", "path": str(r_dir / "concatenate.mp4")}]})
    # current input is "cat.mp4" — should NOT match "concatenate.mp4"
    res = detect_existing_artifacts(ws, [{"id": "n1", "tool_id": "downloader", "params": {"input_path": "cat.mp4", "task": "translate"}}], {"n1": {"input_path": "cat.mp4", "task": "translate"}})
    # Should be no match because stem "cat" != "concatenate"
    assert res["has_existing"] is False
    # exact stem should still match when names equal
    r2 = run_dir(ws, "run_cat2")
    r2.mkdir(parents=True, exist_ok=True)
    (r2 / "cat.mp4").write_bytes(b"y")
    save_run_meta(ws, "run_cat2", {"id": "run_cat2", "tool_id": "downloader", "status": "completed", "params": {"url": "https://example.com/cat2", "task": "translate"}, "artifacts": [{"name": "cat.mp4", "path": str(r2 / "cat.mp4")}]})
    res2 = detect_existing_artifacts(ws, [{"id": "n2", "tool_id": "downloader", "params": {"input_path": "cat.mp4", "task": "translate"}}], {"n2": {"input_path": "cat.mp4", "task": "translate"}})
    assert res2["has_existing"] is True
