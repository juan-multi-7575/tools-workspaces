import pytest

from app.deps import PINNED_DEPENDENCIES, check_dependencies, upgrade_package
from app.settings_store import load_settings


def test_download_settings_persist_across_restart(client):
    assert client.get("/api/settings/download").json()["max_concurrent"] == 2

    resp = client.post("/api/settings/download", json={"max_concurrent": 5})
    assert resp.json()["max_concurrent"] == 5

    settings = load_settings()
    assert settings["download"]["max_concurrent"] == 5


def test_download_settings_survive_new_client():
    from fastapi.testclient import TestClient

    import app.main as m

    with TestClient(m.app) as c1:
        c1.post("/api/settings/download", json={"max_concurrent": 7})

    with TestClient(m.app) as c2:
        body = c2.get("/api/settings/download").json()
        assert body["max_concurrent"] == 7


def test_pinned_dependencies_ytdlp_first():
    names = [d["name"] for d in PINNED_DEPENDENCIES]
    assert names[0] == "yt-dlp"
    assert "gallery-dl" in names


def test_dep_check_reports_versions(monkeypatch):
    monkeypatch.setattr(
        "app.deps.installed_version", lambda pkg: "1.0.0",
    )
    results = check_dependencies(index=lambda url: "2.0.0")
    assert len(results) == len(PINNED_DEPENDENCIES)
    for r in results:
        assert r["installed"] == "1.0.0"
        assert r["latest"] == "2.0.0"


def test_dep_check_missing_installed(monkeypatch):
    monkeypatch.setattr("app.deps.installed_version", lambda pkg: None)
    results = check_dependencies(index=lambda url: "2.0.0")
    assert all(r["installed"] is None for r in results)


def test_dep_check_on_start(client):
    body = client.get("/api/settings/deps").json()
    assert body["dependencies"]
    assert all("name" in d for d in body["dependencies"])


def test_dep_check_on_demand(monkeypatch, client):
    monkeypatch.setattr("app.deps.installed_version", lambda pkg: "3.0.0")
    monkeypatch.setattr("app.deps.latest_version", lambda url: "9.9.9")
    body = client.post("/api/settings/deps/check").json()
    assert all(d["latest"] == "9.9.9" for d in body["dependencies"])


def test_update_requires_approval(client):
    resp = client.post("/api/settings/deps/update", json={"package": "yt-dlp"})
    assert resp.json() == {"ok": False, "error": "approval required"}


def test_update_runs_with_approval(client, monkeypatch):
    called = {}

    def fake_upgrade(pkg):
        called["pkg"] = pkg
        return {"ok": True, "package": pkg}

    monkeypatch.setattr("app.main.upgrade_package", fake_upgrade)
    resp = client.post("/api/settings/deps/update", json={"package": "yt-dlp", "approved": True})
    assert resp.json() == {"ok": True, "package": "yt-dlp"}
    assert called["pkg"] == "yt-dlp"


def test_deps_module_upgrade_functions_exist():
    assert callable(upgrade_package)