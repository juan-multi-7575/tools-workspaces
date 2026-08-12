import subprocess
from pathlib import Path

import pytest

from app.paths import run_dir


@pytest.fixture
def tiny_wav(tmp_path):
    wav = tmp_path / "source.wav"
    subprocess.run(
        ["ffmpeg", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", str(wav)],
        check=True,
        capture_output=True,
    )
    return wav


def test_validate_compatible_chain(client):
    resp = client.post(
        "/api/workspaces/ws/pipeline/validate",
        json={"chain": ["audio_processor", "audio_processor"]},
    )
    assert resp.status_code == 200
    assert resp.json()["valid"] is True


def test_validate_incompatible_chain(client):
    resp = client.post(
        "/api/workspaces/ws/pipeline/validate",
        json={"chain": ["transcriber", "audio_processor"]},
    )
    assert resp.status_code == 200
    assert resp.json()["valid"] is False
    assert resp.json()["error"]


def test_run_pipeline_wires_outputs_between_steps(client, tmp_path, tiny_wav):
    ws = client.post("/api/workspaces", json={"name": "Pipe"}).json()
    ws_id = ws["id"]

    resp = client.post(
        f"/api/workspaces/{ws_id}/pipeline/run",
        json={
            "steps": [
                {
                    "tool_id": "audio_processor",
                    "params": {"input_path": str(tiny_wav), "format": "mp3", "sample_rate": 44100},
                },
                {
                    "tool_id": "audio_processor",
                    "params": {"format": "wav", "sample_rate": 22050},
                },
            ]
        },
    )
    assert resp.status_code == 200
    body = resp.json()["results"]
    assert len(body) == 2
    assert body[0]["status"] == "completed"
    assert body[1]["status"] == "completed"
    assert body[0]["run_id"] != body[1]["run_id"]
    assert len(body[1]["artifacts"]) == 1


def test_runs_are_versioned(client, tmp_path, tiny_wav):
    ws = client.post("/api/workspaces", json={"name": "Version"}).json()
    ws_id = ws["id"]

    r1 = client.post(
        f"/api/workspaces/{ws_id}/pipeline/run",
        json={"steps": [{"tool_id": "audio_processor", "params": {"input_path": str(tiny_wav), "format": "mp3"}}]},
    ).json()["results"]

    r2 = client.post(
        f"/api/workspaces/{ws_id}/pipeline/run",
        json={"steps": [{"tool_id": "audio_processor", "params": {"input_path": str(tiny_wav), "format": "wav"}}]},
    ).json()["results"]

    runs = client.get(f"/api/workspaces/{ws_id}/runs").json()["runs"]
    run_ids = {r["id"] for r in runs}
    assert r1[0]["run_id"] in run_ids
    assert r2[0]["run_id"] in run_ids
    assert r1[0]["run_id"] != r2[0]["run_id"]
