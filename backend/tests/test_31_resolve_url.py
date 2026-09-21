"""Slice 2: pre-run URL resolve endpoint (syntax check + yt-dlp metadata, no download)."""

import json

from app.tools.downloader import resolve_media_url


class _Proc:
    def __init__(self, returncode=0, stdout='', stderr=''):
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr


def test_rejects_non_http_url():
    assert resolve_media_url("not a url")["ok"] is False
    assert resolve_media_url("ftp://example.com/x")["ok"] is False
    assert resolve_media_url("")["ok"] is False


def test_parses_metadata(monkeypatch):
    info = {
        "title": "Some Video",
        "duration": 372,
        "uploader": "Some Channel",
        "extractor": "youtube",
        "thumbnails": [{"url": "http://t/1.jpg"}, {"url": "http://t/2.jpg"}],
        "is_live": False,
    }
    monkeypatch.setattr(
        "app.tools.downloader.subprocess.run",
        lambda *a, **k: _Proc(0, json.dumps(info), ""),
    )
    res = resolve_media_url("https://www.youtube.com/watch?v=abc")
    assert res["ok"] is True
    assert res["title"] == "Some Video"
    assert res["duration_seconds"] == 372
    assert res["uploader"] == "Some Channel"
    assert res["thumbnail"] == "http://t/2.jpg"


def test_surfaces_ytdlp_error(monkeypatch):
    monkeypatch.setattr(
        "app.tools.downloader.subprocess.run",
        lambda *a, **k: _Proc(1, "", "ERROR: [youtube] abc: Video unavailable"),
    )
    res = resolve_media_url("https://www.youtube.com/watch?v=abc")
    assert res["ok"] is False
    assert "unavailable" in res["error"].lower()
    assert not res["error"].startswith("ERROR: ")


def test_endpoint_rejects_bad_url(client):
    r = client.post("/api/workspaces/ws1/pipeline/resolve-url", json={"url": "notaurl"})
    assert r.status_code == 200
    assert r.json()["ok"] is False


def test_endpoint_ok_path(monkeypatch, client):
    info = {"title": "T", "duration": 60, "uploader": "U", "extractor": "youtube", "thumbnails": [], "is_live": False}
    monkeypatch.setattr(
        "app.tools.downloader.subprocess.run",
        lambda *a, **k: _Proc(0, json.dumps(info), ""),
    )
    r = client.post("/api/workspaces/ws1/pipeline/resolve-url", json={"url": "https://example.com/v"})
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["title"] == "T"
