import shutil
import subprocess
from pathlib import Path

import pytest


@pytest.fixture
def tiny_wav(tmp_path):
    wav = tmp_path / "source.wav"
    subprocess.run(
        ["ffmpeg", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", str(wav)],
        check=True,
        capture_output=True,
    )
    return wav


def _run(client, tool_id, params):
    return client.post(
        f"/api/tools/{tool_id}/execute",
        json={"kind": "standalone", "destination": "", "params": params},
    ).json()


def test_mediainfo_standalone(client):
    body = _run(client, "mediainfo", {"path": "/tmp/source.wav"})
    assert body["status"] == "completed"
    assert body["artifacts"][0]["name"].endswith("_info.txt")


def test_streamlink_standalone(client):
    body = _run(client, "streamlink", {"url": "http://example.com/live"})
    assert body["status"] == "completed"
    assert body["artifacts"][0]["name"] == "stream.mp4"


def test_ocrmypdf_standalone(client):
    body = _run(client, "ocrmypdf", {"input_pdf": "/tmp/doc.pdf"})
    assert body["status"] == "completed"
    assert body["artifacts"][0]["name"] == "ocr.pdf"


def test_gallery_dl_standalone(client):
    body = _run(client, "gallery-dl", {"url": "http://example.com/gallery"})
    assert body["status"] == "completed"
    assert body["artifacts"][0]["name"] == "gallery.zip"


def test_demucs_standalone(client):
    body = _run(client, "demucs", {"input_path": "/tmp/source.wav"})
    assert body["status"] == "completed"
    assert body["artifacts"][0]["name"] == "stems.zip"


@pytest.mark.skipif(shutil.which("sox") is None, reason="sox binary not installed")
def test_sox_standalone(client, tiny_wav):
    body = _run(client, "sox", {"input_path": str(tiny_wav), "effect": "trim 0 1"})
    assert body["status"] == "completed"
    assert body["artifacts"][0]["name"].endswith(".wav")


def test_catalog_tools_registered(client):
    ids = {t["id"] for t in client.get("/api/tools").json()["tools"]}
    for tid in ("mediainfo", "streamlink", "ocrmypdf", "sox", "gallery-dl", "demucs"):
        assert tid in ids


def test_mediainfo_runs_in_workspace_pipeline(client):
    ws = client.post("/api/workspaces", json={"name": "CatPipe"}).json()["id"]
    resp = client.post(
        f"/api/workspaces/{ws}/pipeline/run",
        json={"steps": [{"tool_id": "mediainfo", "params": {"input_path": "/tmp/source.wav"}}]},
    ).json()["results"]
    assert resp[0]["status"] == "completed"
    assert len(resp[0]["artifacts"]) == 1

    run_id = resp[0]["run_id"]
    artifacts = client.get(f"/api/workspaces/{ws}/runs/{run_id}/artifacts").json()["artifacts"]
    assert any(a["name"].endswith("_info.txt") for a in artifacts)
