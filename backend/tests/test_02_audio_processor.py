import subprocess
from pathlib import Path

import pytest

from app.paths import DOWNLOADS


@pytest.fixture
def tiny_wav(tmp_path):
    wav = tmp_path / "source.wav"
    subprocess.run(
        ["ffmpeg", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", str(wav)],
        check=True,
        capture_output=True,
    )
    return wav


def test_audio_processor_standalone(client, tmp_path, tiny_wav):
    resp = client.post(
        "/api/tools/audio_processor/execute",
        json={
            "kind": "standalone",
            "destination": str(DOWNLOADS / "audio_processor"),
            "params": {"input_path": str(tiny_wav), "format": "mp3", "sample_rate": 44100},
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "completed"
    assert len(body["artifacts"]) == 1
    assert body["artifacts"][0]["name"].endswith(".mp3")


def test_audio_processor_in_workspace(client, tmp_path, tiny_wav):
    ws = client.post("/api/workspaces", json={"name": "WS"}).json()
    ws_id = ws["id"]
    run_id = "run-1"
    resp = client.post(
        "/api/tools/audio_processor/execute",
        json={
            "kind": "workspace",
            "destination": str(tmp_path / "workspaces" / ws_id / "runs" / run_id / "artifacts"),
            "workspace_id": ws_id,
            "run_id": run_id,
            "params": {"input_path": str(tiny_wav), "format": "mp3", "sample_rate": 44100},
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "completed"
    assert len(body["artifacts"]) == 1
    assert body["artifacts"][0]["path"].startswith(str(tmp_path / "workspaces" / ws_id))
