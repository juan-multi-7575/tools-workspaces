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


def test_mediainfo_standalone(client, tiny_wav):
    body = _run(client, "mediainfo", {"path": str(tiny_wav)})
    assert body["status"] == "completed"
    assert body["artifacts"][0]["name"].endswith("_info.json")


def test_streamlink_standalone(client):
    body = _run(client, "streamlink", {"url": "http://example.com/live"})
    # No fabricated stream: a URL that cannot be captured must fail truthfully.
    assert body["status"] == "failed"
    assert body["error"]


def test_ocrmypdf_standalone(client):
    body = _run(client, "ocrmypdf", {"input_pdf": "/tmp/doc.pdf"})
    # No fabricated PDF: a missing input must fail before running.
    assert body["status"] == "failed"
    assert "input file not found" in body["error"]


def test_gallery_dl_standalone(client):
    body = _run(client, "gallery-dl", {"url": "http://example.com/gallery"})
    # No fabricated images/zip: an unsupported URL must fail truthfully.
    assert body["status"] == "failed"
    assert body["error"]


def test_demucs_standalone(client):
    body = _run(client, "demucs", {"input_path": "/tmp/source.wav"})
    # No fabricated stems: a missing input must fail before running.
    assert body["status"] == "failed"
    assert "input file not found" in body["error"]


@pytest.mark.skipif(shutil.which("sox") is None, reason="sox binary not installed")
def test_sox_standalone(client, tiny_wav):
    body = _run(client, "sox", {"input_path": str(tiny_wav), "effect": "trim 0 1"})
    assert body["status"] == "completed"
    assert body["artifacts"][0]["name"].endswith(".wav")


def test_catalog_tools_registered(client):
    ids = {t["id"] for t in client.get("/api/tools").json()["tools"]}
    for tid in ("mediainfo", "streamlink", "ocrmypdf", "sox", "gallery-dl", "demucs"):
        assert tid in ids


def test_mediainfo_runs_in_workspace_pipeline(client, tiny_wav):
    ws = client.post("/api/workspaces", json={"name": "CatPipe"}).json()["id"]
    resp = client.post(
        f"/api/workspaces/{ws}/pipeline/run",
        json={"steps": [{"tool_id": "mediainfo", "params": {"input_path": str(tiny_wav)}}]},
    ).json()["results"]
    assert resp[0]["status"] == "completed"
    assert len(resp[0]["artifacts"]) == 1

    run_id = resp[0]["run_id"]
    artifacts = client.get(f"/api/workspaces/{ws}/runs/{run_id}/artifacts").json()["artifacts"]
    assert any(a["name"].endswith("_info.json") for a in artifacts)
