import io
import subprocess
import zipfile

import pytest

import app.paths


@pytest.fixture
def tiny_wav(tmp_path):
    wav = tmp_path / "source.wav"
    subprocess.run(
        ["ffmpeg", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", str(wav)],
        check=True,
        capture_output=True,
    )
    return wav


@pytest.fixture
def workspace_with_run(client, tiny_wav):
    ws = client.post("/api/workspaces", json={"name": "Artifacts"}).json()
    ws_id = ws["id"]
    results = client.post(
        f"/api/workspaces/{ws_id}/pipeline/run",
        json={"steps": [{"tool_id": "audio_processor", "params": {"input_path": str(tiny_wav), "format": "mp3"}}]},
    ).json()["results"]
    run_id = results[0]["run_id"]
    return ws_id, run_id


def test_browse_runs_and_artifacts(client, workspace_with_run):
    ws_id, run_id = workspace_with_run
    runs = client.get(f"/api/workspaces/{ws_id}/runs").json()["runs"]
    assert [r["id"] for r in runs] == [run_id]
    assert runs[0]["artifacts"][0]["name"].endswith(".mp3")

    artifacts = client.get(f"/api/workspaces/{ws_id}/runs/{run_id}/artifacts").json()["artifacts"]
    assert len(artifacts) == 1
    assert artifacts[0]["size"] > 0


def test_preview_artifact(client, workspace_with_run):
    ws_id, run_id = workspace_with_run
    resp = client.get(f"/api/workspaces/{ws_id}/runs/{run_id}/artifacts/source.mp3/preview")
    assert resp.status_code == 200
    assert len(resp.content) > 0


def test_download_copies_artifact_out(client, workspace_with_run, tmp_path):
    ws_id, run_id = workspace_with_run
    resp = client.get(f"/api/workspaces/{ws_id}/runs/{run_id}/artifacts/source.mp3/download")
    assert resp.status_code == 200
    assert resp.headers["content-disposition"].startswith("attachment")
    assert resp.content[:4] == b"ID3" or resp.content[:4] != b""

    copy = tmp_path / "copied.mp3"
    copy.write_bytes(resp.content)
    assert copy.exists() and copy.stat().st_size > 0


def test_delete_artifact_leaves_run_intact(client, workspace_with_run):
    ws_id, run_id = workspace_with_run
    resp = client.delete(f"/api/workspaces/{ws_id}/runs/{run_id}/artifacts/source.mp3")
    assert resp.json() == {"deleted": True}

    artifacts = client.get(f"/api/workspaces/{ws_id}/runs/{run_id}/artifacts").json()["artifacts"]
    assert artifacts == []
    runs = client.get(f"/api/workspaces/{ws_id}/runs").json()["runs"]
    assert len(runs) == 1


def test_delete_run_removes_only_that_run(client, tiny_wav, tmp_path):
    ws = client.post("/api/workspaces", json={"name": "TwoRuns"}).json()
    ws_id = ws["id"]

    for fmt in ("mp3", "wav"):
        client.post(
            f"/api/workspaces/{ws_id}/pipeline/run",
            json={"steps": [{"tool_id": "audio_processor", "params": {"input_path": str(tiny_wav), "format": fmt}}]},
        )

    runs = client.get(f"/api/workspaces/{ws_id}/runs").json()["runs"]
    assert len(runs) == 2
    doomed, survivor = runs[0]["id"], runs[1]["id"]

    resp = client.delete(f"/api/workspaces/{ws_id}/runs/{doomed}")
    assert resp.json() == {"deleted": True}

    remaining = client.get(f"/api/workspaces/{ws_id}/runs").json()["runs"]
    assert [r["id"] for r in remaining] == [survivor]
    ws_root = app.paths.WORKSPACES / ws_id
    assert (ws_root / "runs" / doomed).exists() is False
    assert (ws_root / "runs" / survivor).exists() is True


def test_export_workspace_as_zip(client, workspace_with_run):
    ws_id, _ = workspace_with_run
    resp = client.get(f"/api/workspaces/{ws_id}/export")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/zip"

    with zipfile.ZipFile(io.BytesIO(resp.content), "r") as zf:
        names = zf.namelist()
    assert any(n.endswith("source.mp3") for n in names)


def test_delete_workspace_cascades_runs(client, workspace_with_run, tiny_wav):
    ws_id, run_id = workspace_with_run
    second = client.post(
        f"/api/workspaces/{ws_id}/pipeline/run",
        json={"steps": [{"tool_id": "audio_processor", "params": {"input_path": str(tiny_wav), "format": "wav"}}]},
    ).json()["results"][0]["run_id"]

    resp = client.delete(f"/api/workspaces/{ws_id}")
    assert resp.json() == {"deleted": True}

    ws_root = app.paths.WORKSPACES / ws_id
    assert ws_root.exists() is False
    remaining = client.get("/api/workspaces").json()["workspaces"]
    assert all(w["id"] != ws_id for w in remaining)
    assert (ws_root / "runs" / run_id).exists() is False
    assert (ws_root / "runs" / second).exists() is False


def test_missing_artifact_returns_not_found(client, workspace_with_run):
    ws_id, run_id = workspace_with_run
    assert client.get(f"/api/workspaces/{ws_id}/runs/{run_id}/artifacts/nope.mp3/preview").json() == {"error": "not found"}
    assert client.delete(f"/api/workspaces/{ws_id}/runs/{run_id}/artifacts/nope.mp3").json() == {"deleted": False}


def test_trim_artifact_produces_segments(client, workspace_with_run):
    ws_id, run_id = workspace_with_run
    resp = client.post(
        f"/api/workspaces/{ws_id}/runs/{run_id}/artifacts/source.mp3/trim",
        json={"regions": [{"start": 0, "end": 1}, {"start": 1, "end": 2}]},
    )
    assert resp.status_code == 200
    names = resp.json()["artifacts"]
    assert len(names) == 2
    assert all("_seg_" in n for n in names)

    listed = {a["name"] for a in client.get(f"/api/workspaces/{ws_id}/runs/{run_id}/artifacts").json()["artifacts"]}
    assert all(n in listed for n in names)


def test_get_recent_artifacts(client, workspace_with_run):
    resp = client.get("/api/artifacts/recent")
    assert resp.status_code == 200
    data = resp.json()
    assert "artifacts" in data
    assert isinstance(data["artifacts"], list)
    # The workspace_with_run fixture generated source.mp3
    names = [a["name"] for a in data["artifacts"]]
    assert "source.mp3" in names

