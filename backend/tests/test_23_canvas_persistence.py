import pytest
from starlette.testclient import TestClient
from app.main import app
from app.core.canvas import get_workspace_canvas, save_workspace_canvas, reset_workspace_canvas
from app.workspaces import create_workspace


def test_canvas_persistence_isolated():
    client = TestClient(app)
    ws1 = "test-session-alpha"
    ws2 = "test-session-beta"
    create_workspace(ws1)
    create_workspace(ws2)

    # 1. Initial GET on ws1 returns default starter canvas
    res1 = client.get(f"/api/workspaces/{ws1}/canvas")
    assert res1.status_code == 200
    data1 = res1.json()
    assert "nodes" in data1
    assert len(data1["nodes"]) >= 2
    assert data1["workspace_id"] == ws1

    # 2. Save a custom half-baked pipeline into ws1
    custom_nodes = [
        {
            "id": "node-custom-1",
            "type": "toolNode",
            "position": {"x": 120, "y": 240},
            "data": {
                "label": "Custom Audio Processor",
                "toolId": "audio_processor",
                "params": {"format": "mp3", "bitrate": "320k"},
                "status": "idle",
            },
        }
    ]
    custom_edges = []
    put_res = client.put(
        f"/api/workspaces/{ws1}/canvas",
        json={"nodes": custom_nodes, "edges": custom_edges, "viewport": {"x": 50, "y": 50, "zoom": 1.2}},
    )
    assert put_res.status_code == 200
    saved = put_res.json()
    assert saved["nodes"][0]["id"] == "node-custom-1"
    assert saved["nodes"][0]["data"]["params"]["bitrate"] == "320k"

    # 3. Verify session isolation: ws2 canvas is completely unaffected
    res2 = client.get(f"/api/workspaces/{ws2}/canvas")
    assert res2.status_code == 200
    data2 = res2.json()
    assert data2["workspace_id"] == ws2
    # ws2 still has default nodes, not ws1's custom node
    node_ids_2 = [n["id"] for n in data2["nodes"]]
    assert "node-custom-1" not in node_ids_2

    # 4. Reload ws1 canvas and verify exact positions and parameters persisted
    reload_res = client.get(f"/api/workspaces/{ws1}/canvas")
    assert reload_res.status_code == 200
    reloaded = reload_res.json()
    assert len(reloaded["nodes"]) == 1
    assert reloaded["nodes"][0]["id"] == "node-custom-1"
    assert reloaded["nodes"][0]["position"] == {"x": 120, "y": 240}
    assert reloaded["nodes"][0]["data"]["params"]["bitrate"] == "320k"

    # 5. Reset canvas for ws1
    reset_res = client.post(f"/api/workspaces/{ws1}/canvas/reset")
    assert reset_res.status_code == 200
    reset_data = reset_res.json()
    assert len(reset_data["nodes"]) == 0
    assert len(reset_data["edges"]) == 0
