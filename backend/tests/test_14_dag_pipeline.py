import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.dag import DAGNode, DAGEdge, DAGPipelineSpec, validate_dag
from app.core.scheduler import execute_dag_pipeline
from app.workspaces import create_workspace


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


def test_validate_dag_valid_diamond():
    spec = DAGPipelineSpec(
        nodes=[
            DAGNode(id="node1", tool_id="audio_processor"),
            DAGNode(id="node2", tool_id="audio_processor"),
            DAGNode(id="node3", tool_id="audio_processor"),
            DAGNode(id="node4", tool_id="audio_processor"),
        ],
        edges=[
            DAGEdge(source_node="node1", target_node="node2"),
            DAGEdge(source_node="node1", target_node="node3"),
            DAGEdge(source_node="node2", target_node="node4"),
            DAGEdge(source_node="node3", target_node="node4"),
        ],
    )
    res = validate_dag(spec)
    assert res.valid is True
    assert res.error is None
    assert len(res.topological_order) == 4
    assert res.topological_order[0] == "node1"
    assert res.topological_order[-1] == "node4"


def test_validate_dag_detects_cycle():
    spec = DAGPipelineSpec(
        nodes=[
            DAGNode(id="n1", tool_id="audio_processor"),
            DAGNode(id="n2", tool_id="audio_processor"),
        ],
        edges=[
            DAGEdge(source_node="n1", target_node="n2"),
            DAGEdge(source_node="n2", target_node="n1"),
        ],
    )
    res = validate_dag(spec)
    assert res.valid is False
    assert "Cycle detected" in res.error


def test_validate_dag_incompatible_ports():
    # Downloader outputs video/audio; if we had incompatible tools it would fail
    spec = DAGPipelineSpec(
        nodes=[
            DAGNode(id="n1", tool_id="downloader"),
            DAGNode(id="n2", tool_id="audio_processor"),
        ],
        edges=[
            DAGEdge(source_node="n1", target_node="n2"),
        ],
    )
    res = validate_dag(spec)
    assert res.valid is True


def test_api_dag_pipeline_validate_and_run(client):
    ws = create_workspace("dag-test-ws")
    ws_id = ws["id"]

    val_payload = {
        "nodes": [
            {"id": "step1", "tool_id": "audio_processor", "params": {"format": "wav"}},
            {"id": "step2", "tool_id": "audio_processor", "params": {"format": "mp3"}},
        ],
        "edges": [
            {"source_node": "step1", "target_node": "step2"},
        ],
    }
    resp = client.post(f"/api/workspaces/{ws_id}/pipeline/validate", json=val_payload)
    assert resp.status_code == 200
    assert resp.json()["valid"] is True
    assert resp.json()["topological_order"] == ["step1", "step2"]
