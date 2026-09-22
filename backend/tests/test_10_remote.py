import pytest

from app.remote import get_token


def test_remote_info_shape(client):
    resp = client.get("/api/remote/info")
    assert resp.status_code == 200
    body = resp.json()
    assert body["token"]
    assert "/remote" in body["connect_url"]
    assert body["token"] == get_token()


def test_remote_rotate_issues_new_token(client):
    old = get_token()
    resp = client.post("/api/remote/rotate")
    assert resp.status_code == 200
    new = resp.json()["token"]
    assert new
    assert new != old
    assert get_token() == new
    assert client.get("/api/remote/info").json()["token"] == new


def test_remote_enqueue_requires_valid_token(client, monkeypatch):
    import app.tools.downloader as dl

    def fake_execute_ydl(url, params, outdir, progress_queue=None, cancel_event=None):
        if progress_queue is not None:
            progress_queue.put_nowait({"status": "completed", "percent": 100})
        out = outdir / "video.mp4"
        out.write_text("dummy")
        return [out]

    monkeypatch.setattr(dl, "execute_ydl", fake_execute_ydl)

    bad = client.post("/api/remote/downloads", json={"token": "wrong", "url": "http://x"})
    assert bad.status_code == 403

    token = get_token()
    good = client.post("/api/remote/downloads", json={"token": token, "url": "http://x"})
    assert good.status_code == 200
    task_id = good.json()["id"]

    listed = client.get("/api/downloads").json()["downloads"]
    assert any(d["id"] == task_id for d in listed)

    bad_cancel = client.post(f"/api/remote/downloads/{task_id}/cancel", json={"token": "nope"})
    assert bad_cancel.status_code == 403

    good_cancel = client.post(f"/api/remote/downloads/{task_id}/cancel", json={"token": token})
    assert good_cancel.status_code == 200
    assert good_cancel.json()["cancelled"] is True
