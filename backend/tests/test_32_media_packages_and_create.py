"""Subagent audit batch: package stem grouping + workspace create validation."""

import json


def _seed(ws_root, runs):
    import pathlib

    root = pathlib.Path(ws_root)
    for rid, manifest, files in runs:
        d = root / "runs" / rid / "artifacts"
        d.mkdir(parents=True, exist_ok=True)
        (root / "runs" / rid / "manifest.json").write_text(json.dumps(manifest))
        for name, size in files.items():
            (d / name).write_bytes(b"x" * size)


def test_translated_sidecar_groups_with_video(client):
    _seed(
        __import__("app.paths", fromlist=["workspace_root"]).workspace_root("w1"),
        [
            (
                "r1",
                {"pipeline_run_id": "a1", "tool_id": "downloader", "status": "completed"},
                {"talk.mp4": 100, "talk_translated.en.srt": 50, "talk.ko.srt": 40},
            )
        ],
    )
    r = client.get("/api/workspaces/w1/media")
    assert r.status_code == 200
    packages = r.json()["packages"]
    assert len(packages) == 1, packages
    subs = sorted(a["name"] for a in packages[0]["subtitles"])
    assert subs == ["talk.ko.srt", "talk_translated.en.srt"], subs


def test_duplicate_workspace_name_returns_409(client):
    r1 = client.post("/api/workspaces", json={"name": "dup"})
    assert r1.status_code == 200
    r2 = client.post("/api/workspaces", json={"name": "dup"})
    assert r2.status_code == 409
    assert "already exists" in r2.json()["detail"]


def test_empty_workspace_name_rejected(client):
    r = client.post("/api/workspaces", json={"name": "   "})
    assert r.status_code == 422
