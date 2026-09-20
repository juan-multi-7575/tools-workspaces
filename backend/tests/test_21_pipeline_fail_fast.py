import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.dag import DAGPipelineSpec, DAGNode, DAGEdge
from app.core.scheduler import execute_dag_pipeline

client = TestClient(app)


@pytest.mark.anyio
async def test_scheduler_fail_fast_halts_and_emits():
    """Verify that when node 1 fails (missing url), downstream nodes are immediately skipped and events are emitted."""
    events = []

    async def _on_event(evt):
        events.append(evt)

    # Define a 3-node DAG: downloader -> audio_processor -> transcriber
    spec = DAGPipelineSpec(
        nodes=[
            DAGNode(id="node-1", tool_id="downloader", params={}), # Missing 'url' param -> fails
            DAGNode(id="node-2", tool_id="audio_processor", params={}),
            DAGNode(id="node-3", tool_id="transcriber", params={}),
        ],
        edges=[
            DAGEdge(source_node="node-1", target_node="node-2"),
            DAGEdge(source_node="node-2", target_node="node-3"),
        ],
        error_policy="fail_fast",
    )

    results = await execute_dag_pipeline("youtube", spec, progress_callback=_on_event)

    # Node 1 should be failed
    node1_res = next(r for r in results if r["node_id"] == "node-1")
    assert node1_res["status"] == "failed"
    assert "url is required" in node1_res["error"]

    # Downstream nodes should be skipped
    node2_res = next(r for r in results if r["node_id"] == "node-2")
    node3_res = next(r for r in results if r["node_id"] == "node-3")
    assert node2_res["status"] == "skipped"
    assert node3_res["status"] == "skipped"

    # Verify events
    event_types = [e["type"] for e in events]
    assert "node_started" in event_types
    assert "node_failed" in event_types
    assert "node_skipped" in event_types


def test_api_pipeline_run_stream_fail_fast():
    """Verify the /pipeline/run-stream SSE endpoint streams real-time status and reports failure cleanly."""
    payload = {
        "nodes": [
            {"id": "n1", "tool_id": "downloader", "params": {}}, # Missing URL -> fail
            {"id": "n2", "tool_id": "transcriber", "params": {}},
        ],
        "edges": [
            {"source_node": "n1", "target_node": "n2"}
        ],
        "error_policy": "fail_fast",
    }

    with client.stream("POST", "/api/workspaces/youtube/pipeline/run-stream", json=payload) as response:
        assert response.status_code == 200
        lines = [line for line in response.iter_lines() if line.startswith("data: ")]
        assert len(lines) > 0
        
        # Check that we received node_failed and pipeline_finished
        raw_text = "\n".join(lines)
        assert "node_failed" in raw_text
        assert "url is required" in raw_text
        assert "pipeline_finished" in raw_text
