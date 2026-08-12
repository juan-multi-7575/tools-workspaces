import subprocess
from pathlib import Path

import pytest

from app.paths import run_dir


@pytest.fixture
def tiny_wav(tmp_path):
    wav = tmp_path / "source.wav"
    subprocess.run(
        ["ffmpeg", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=3", str(wav)],
        check=True,
        capture_output=True,
    )
    return wav


def test_trimmer_single_region_produces_one_segment(client, tmp_path, tiny_wav):
    resp = client.post(
        "/api/tools/trimmer/execute",
        json={
            "kind": "standalone",
            "destination": str(tmp_path / "out"),
            "params": {"input_path": str(tiny_wav), "regions": [{"start": 0, "end": 1}]},
        },
    )
    body = resp.json()
    assert body["status"] == "completed"
    assert len(body["artifacts"]) == 1
    assert body["artifacts"][0]["name"].endswith(".wav")


def test_trimmer_multiple_regions_produce_multiple_segments(client, tmp_path, tiny_wav):
    resp = client.post(
        "/api/tools/trimmer/execute",
        json={
            "kind": "standalone",
            "destination": str(tmp_path / "out"),
            "params": {
                "input_path": str(tiny_wav),
                "regions": [{"start": 0, "end": 1}, {"start": 1, "end": 2}],
            },
        },
    )
    body = resp.json()
    assert body["status"] == "completed"
    assert len(body["artifacts"]) == 2


def test_trimmer_missing_input_fails(client):
    resp = client.post(
        "/api/tools/trimmer/execute",
        json={"kind": "standalone", "destination": "", "params": {"regions": [{"start": 0, "end": 1}]}},
    )
    body = resp.json()
    assert body["status"] == "failed"
    assert "input_path is required" in body["error"]
