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
    _parse_progress,
    validate_raw_args,
    split_raw_args,
)
from app.tools.base import ToolRunContext


def test_parse_progress_reports_actual_downloaded_and_total_bytes():
    progress = _parse_progress(
        "[download] __YTDLP_PROGRESS__ 50.0% of 2000000/4000000 at 1.00MiB/s ETA 00:02"
    )
    assert progress == {
        "status": "downloading",
        "percent": 50.0,
        "speed": "1.00MiB/s",
        "eta": "00:02",
        "downloaded_bytes": 2000000,
        "total_bytes": 4000000,
    }


def test_parse_progress_keeps_unknown_total_unknown():
    progress = _parse_progress("[download] __YTDLP_PROGRESS__ 50.0% of 2000000/NA at 1.00MiB/s ETA 00:02")
    assert progress is not None
    assert progress["downloaded_bytes"] == 2000000
    assert "total_bytes" not in progress


def test_parse_progress_ignores_percent_in_already_downloaded_filename():
    assert _parse_progress("[download] /tmp/50% off.mp4 has already been downloaded") is None
    assert _parse_progress("[download] 50% off.mp4 has already been downloaded") is None


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
    assert "-f" in cli
    assert "best" in cli
    assert "--write-subs" in cli
    assert "--sub-langs" in cli
    assert "en" in cli


def test_download_mode_audio_and_video_only():
    audio_opts = build_ydl_opts({"download_mode": "audio_only", "audio_format": "mp3", "audio_quality": "320"}, "tmpl")
    assert audio_opts["extractaudio"] is True
    assert audio_opts["audioformat"] == "mp3"
    assert audio_opts["audioquality"] == "320"

    video_only_opts = build_ydl_opts({"download_mode": "video_only", "format_preset": "1080p"}, "tmpl")
    assert "bestvideo[height<=1080]" in video_only_opts["format"]
    assert "extractaudio" not in video_only_opts


def test_execute_ydl_parses_progress_and_emits_completed(tmp_path):
    lines = [
        "[download] __YTDLP_PROGRESS__ 0.0% of 10.00MiB at 1.00MiB/s ETA 00:10",
        "[download] __YTDLP_PROGRESS__ 50.0% of 10.00MiB at 2.00MiB/s ETA 00:02",
        "[download] __YTDLP_PROGRESS__ 100.0% of 10.00MiB at 2.00MiB/s ETA 00:00",
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
            self._lines = ["[download] __YTDLP_PROGRESS__ 1.0% of 10.00MiB at 1.00MiB/s ETA 00:10"]
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
    assert "url is required" in body["error"]["message"]


def test_enqueue_list_and_cancel_download(client, tmp_path, monkeypatch):
    import app.tools.downloader as dl

    def fake_execute_ydl(url, params, outdir, progress_queue=None, cancel_event=None, *args, **kwargs):
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
            self.stdout = iter(["[download] __YTDLP_PROGRESS__ 100.0% of 1MiB at 1MiB/s ETA 00:00"])
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


def test_execute_ydl_captures_error_lines_on_failure(tmp_path):
    lines = [
        "[youtube] Extracting URL...",
        "ERROR: [youtube] Video unavailable",
        "ERROR: Private video",
    ]

    class FakeErrorProc:
        def __init__(self, *a, **k):
            self.stdout = iter(lines)
            self.returncode = 1

        def wait(self):
            return 1

        def terminate(self):
            pass

    import app.tools.downloader as dl

    orig = dl.subprocess.Popen
    dl.subprocess.Popen = FakeErrorProc
    try:
        with pytest.raises(RuntimeError) as exc_info:
            execute_ydl("http://example.com/bad", {}, tmp_path)
        err = str(exc_info.value)
        assert "yt-dlp exited with code 1" in err
        assert "ERROR: [youtube] Video unavailable" in err
        assert "ERROR: Private video" in err
    finally:
        dl.subprocess.Popen = orig


def test_downloader_tool_returns_informative_error_string(tmp_path):
    class FakeErrorProc:
        def __init__(self, *a, **k):
            self.stdout = iter(["ERROR: Unsupported URL"])
            self.returncode = 1

        def wait(self):
            return 1

        def terminate(self):
            pass

    import app.tools.downloader as dl

    orig = dl.subprocess.Popen
    dl.subprocess.Popen = FakeErrorProc
    try:
        tool = DownloaderTool()
        ctx = ToolRunContext(kind="standalone", destination=str(tmp_path), params={"url": "http://example.com/bad"})
        res = asyncio.run(tool.execute(ctx))
        assert res.status == "failed"
        assert "yt-dlp exited with code 1: ERROR: Unsupported URL" in res.error
    finally:
        dl.subprocess.Popen = orig


def test_build_ydl_opts_cookies_and_anti_403_flags():
    params = {
        "cookies_from_browser": "chrome",
        "cookies_file": "/tmp/test_cookies.txt",
        "extractor_args": "youtube:player_client=ios,web",
        "user_agent": "CustomUA/1.0",
    }
    opts = build_ydl_opts(params, "test.%(ext)s")
    cli = _to_cli(opts)
    assert "--cookies-from-browser" in cli
    assert "chrome" in cli
    assert "--cookies" in cli
    assert "/tmp/test_cookies.txt" in cli
    assert "--extractor-args" in cli
    assert "youtube:player_client=ios,web" in cli
    assert "--user-agent" in cli
    assert "CustomUA/1.0" in cli


def test_validate_raw_args_allows_anti_403_flags():
    ok, err = validate_raw_args("--cookies-from-browser chrome --extractor-args youtube:player_client=mweb")
    assert ok, f"expected valid raw args, got: {err}"


def test_downloader_info_endpoint():
    from app.main import app
    from starlette.testclient import TestClient

    client = TestClient(app)
    # Missing URL should 400
    res = client.get("/api/tools/downloader/info")
    assert res.status_code == 422 or res.status_code == 400

    # Non-YouTube URL fallback
    res = client.get("/api/tools/downloader/info?url=https://example.com/video")
    assert res.status_code == 200
    assert "title" in res.json()


def test_execute_ydl_artifact_isolation(tmp_path):
    # Create pre-existing file in outdir
    old_file = tmp_path / "old_song.mp3"
    old_file.write_text("old content")
    # Set mtime in past
    import os
    import time
    past = time.time() - 100
    os.utime(str(old_file), (past, past))

    class FakeProc:
        returncode = 0
        stdout = ["[download] __YTDLP_PROGRESS__ 100% of 1.00MiB in 00:01"]

        def __init__(self, *args, **kwargs):
            # Simulate newly created file during download
            new_file = tmp_path / "new_video.mp4"
            new_file.write_text("video content")

        def wait(self):
            return 0

    import app.tools.downloader as dl
    orig = dl.subprocess.Popen
    dl.subprocess.Popen = FakeProc
    try:
        produced = execute_ydl("http://example.com/test", {}, tmp_path)
        assert len(produced) == 1
        assert produced[0].name == "new_video.mp4"
    finally:
        dl.subprocess.Popen = orig


@pytest.mark.parametrize("reported_path", ["absolute", "relative"])
def test_execute_ydl_already_downloaded(tmp_path, reported_path):
    existing_file = tmp_path / "50% off.mp4"
    existing_file.write_text("existing content")
    import os
    import time
    past = time.time() - 3600
    os.utime(str(existing_file), (past, past))
    printed_path = str(existing_file) if reported_path == "absolute" else existing_file.name

    class FakeAlreadyProc:
        returncode = 0
        stdout = [f"[download] {printed_path} has already been downloaded"]

        def wait(self):
            return 0

    import app.tools.downloader as dl
    orig = dl.subprocess.Popen
    dl.subprocess.Popen = lambda *args, **kwargs: FakeAlreadyProc()
    try:
        produced = execute_ydl("http://example.com/test", {}, tmp_path)
        assert len(produced) == 1
        assert produced[0].name == "50% off.mp4"
    finally:
        dl.subprocess.Popen = orig
