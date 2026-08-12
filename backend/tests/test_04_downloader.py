import asyncio
import json
from pathlib import Path

import pytest

from app.tools.downloader import (
    AUDIO_QUALITY,
    FORMAT_PRESETS,
    DownloaderTool,
    _to_cli,
    build_ydl_opts,
    execute_ydl,
    validate_raw_args,
    split_raw_args,
)
from app.tools.base import ToolRunContext


def test_format_presets_and_audio_quality_exist():
    assert "best" in FORMAT_PRESETS
    assert "audio" in FORMAT_PRESETS
    assert "1080p" in FORMAT_PRESETS
    assert "128" in AUDIO_QUALITY
    assert "320" in AUDIO_QUALITY


def test_build_ydl_opts_applies_preset():
    opts = build_ydl_opts({"format_preset": "audio", "extract_audio": True, "audio_quality": "192"}, "tmpl")
    assert opts["format"] == FORMAT_PRESETS["audio"]
    assert opts["extractaudio"] is True
    assert opts["audioquality"] == "192"


def test_build_ydl_opts_subtitles_and_playlist():
    opts = build_ydl_opts(
        {"writesubtitles": True, "subtitleslangs": ["en", "es"], "playlist_items": "1-3"}, "tmpl"
    )
    assert opts["writesubtitles"] is True
    assert opts["subtitleslangs"] == ["en", "es"]
    assert opts["playlist_items"] == "1-3"


def test_to_cli_builds_flags():
    cli = _to_cli({"format": "best", "writesubtitles": True, "subtitleslangs": ["en"]})
    assert "yt-dlp" in cli
    assert "--format" in cli
    assert "--writesubtitles" in cli


def test_execute_ydl_parses_progress_and_emits_completed(tmp_path):
    lines = [
        "[download]   0.0% of 10.00MiB at 1.00MiB/s ETA 00:10",
        "[download]  50.0% of 10.00MiB at 2.00MiB/s ETA 00:02",
        "[download] 100.0% of 10.00MiB at 2.00MiB/s ETA 00:00",
    ]

    class FakeProc:
        def __init__(self):
            self.stdout = iter(lines)
            self.returncode = 0

        def wait(self):
            return 0

        def terminate(self):
            pass

    import app.tools.downloader as dl

    orig = dl.subprocess.Popen
    dl.subprocess.Popen = lambda *a, **k: FakeProc()
    try:
        q: asyncio.Queue = asyncio.Queue()
        produced = execute_ydl("http://example.com/vid", {}, tmp_path, progress_queue=q)
    finally:
        dl.subprocess.Popen = orig

    messages = []
    while not q.empty():
        messages.append(q.get_nowait())
    assert any(m["percent"] == 50.0 for m in messages)
    assert messages[-1]["status"] == "completed"


def test_execute_ydl_cancels_and_cleans_part_files(tmp_path):
    (tmp_path / "leftover.part").write_text("x")

    class FakeProc:
        def __init__(self):
            self._lines = ["[download]   1.0% of 10.00MiB at 1.00MiB/s ETA 00:10"]
            self.stdout = iter(self._lines)
            self.returncode = 0
            self._waited = 0

        def wait(self):
            return 0

        def terminate(self):
            pass

    import app.tools.downloader as dl

    async def run():
        ev = asyncio.Event()
        ev.set()
        q: asyncio.Queue = asyncio.Queue()
        return execute_ydl("http://example.com/vid", {}, tmp_path, progress_queue=q, cancel_event=ev)

    orig = dl.subprocess.Popen
    dl.subprocess.Popen = lambda *a, **k: FakeProc()
    try:
        with pytest.raises(RuntimeError, match="cancelled"):
            asyncio.run(run())
    finally:
        dl.subprocess.Popen = orig

    assert not (tmp_path / "leftover.part").exists()


def test_downloader_tool_failed_url(client):
    resp = client.post(
        "/api/tools/downloader/execute",
        json={"kind": "standalone", "destination": "", "params": {}},
    )
    body = resp.json()
    assert body["status"] == "failed"
    assert "url is required" in body["error"]


def test_enqueue_list_and_cancel_download(client, tmp_path, monkeypatch):
    import app.tools.downloader as dl

    def fake_execute_ydl(url, params, outdir, progress_queue=None, cancel_event=None):
        if progress_queue is not None:
            for pct in (0, 50, 100):
                progress_queue.put_nowait({"status": "downloading", "percent": pct})
            progress_queue.put_nowait({"status": "completed", "percent": 100})
        out = outdir / "video.mp4"
        out.write_text("dummy")
        return [out]

    monkeypatch.setattr(dl, "execute_ydl", fake_execute_ydl)

    enq = client.post("/api/downloads", json={"url": "http://example.com/v"}).json()
    task_id = enq["id"]
    assert enq["status"] == "queued"

    listed = client.get("/api/downloads").json()["downloads"]
    assert any(d["id"] == task_id for d in listed)

    async def collect_stream():
        resp = client.get(f"/api/downloads/{task_id}/stream")
        assert resp.status_code == 200
        return resp.text

    body = asyncio.run(collect_stream())
    assert "50" in body
    assert "completed" in body


def test_download_concurrency_configurable(client):
    resp = client.post("/api/settings/download", json={"max_concurrent": 4}).json()
    assert resp["max_concurrent"] == 4
    resp = client.get("/api/settings/download").json()
    assert resp["max_concurrent"] == 4


def test_validate_raw_args():
    assert validate_raw_args("--no-mtime --embed-thumbnail")[0] is True
    assert validate_raw_args("--exec rm -rf /")[0] is False
    assert validate_raw_args("url; rm -rf /")[0] is False
    assert validate_raw_args("a | b")[0] is False
    assert split_raw_args("--no-mtime --embed-thumbnail") == ["--no-mtime", "--embed-thumbnail"]


def test_execute_ydl_passes_valid_raw_args_through(tmp_path):
    captured: dict = {}

    class FakeProc:
        def __init__(self, *a, **k):
            captured["args"] = a[0]
            self.stdout = iter(["[download] 100.0% of 1MiB at 1MiB/s ETA 00:00"])
            self.returncode = 0

        def wait(self):
            return 0

        def terminate(self):
            pass

    import app.tools.downloader as dl

    orig = dl.subprocess.Popen
    dl.subprocess.Popen = FakeProc
    try:
        execute_ydl(
            "http://example.com/v",
            {"raw_args": "--no-mtime --embed-thumbnail"},
            tmp_path,
        )
    finally:
        dl.subprocess.Popen = orig

    assert "--no-mtime" in captured["args"]
    assert "--embed-thumbnail" in captured["args"]
    assert "http://example.com/v" in captured["args"]


def test_execute_ydl_rejects_invalid_raw_args(tmp_path):
    import pytest

    with pytest.raises(ValueError):
        execute_ydl("http://example.com/v", {"raw_args": "--exec bad"}, tmp_path)
