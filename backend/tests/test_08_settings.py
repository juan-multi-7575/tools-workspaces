import pytest

from app.deps import MANAGED_BY_DEPMGR, PINNED_DEPENDENCIES, check_dependencies, upgrade_package
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


def test_update_refuses_packages_the_dependency_manager_owns(monkeypatch):
    """No second copy of a managed dependency outside the deps root."""
    def explode(*args, **kwargs):
        raise AssertionError("upgrade_package must not shell out for a managed dependency")

    monkeypatch.setattr("app.deps.subprocess.run", explode)
    for package, dep_id in MANAGED_BY_DEPMGR.items():
        res = upgrade_package(package)
        assert res["ok"] is False
        assert dep_id in res["error"]


def test_upgrade_never_shells_out_to_a_privileged_package_manager(monkeypatch):
    commands = []

    def record(cmd, **kwargs):
        commands.append(cmd)
        return None

    monkeypatch.setattr("app.deps.subprocess.run", record)
    for package in ("yt-dlp", "gallery-dl", "exiftool", "faster-whisper"):
        upgrade_package(package)

    forbidden = ("apt", "apt-get", "sudo", "brew", "yum", "dnf", "apk")
    for cmd in commands:
        assert not any(str(part) in forbidden for part in cmd), cmd


def test_deps_module_never_references_a_privileged_package_manager():
    """Walk app/deps.py's AST, so prose in a docstring cannot pass by accident."""
    import ast
    from pathlib import Path

    import app.deps as deps_module

    forbidden = {"apt-get", "apt", "sudo", "brew", "yum", "dnf", "apk"}
    tree = ast.parse(Path(deps_module.__file__).read_text(encoding="utf-8"))
    docstrings = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
            body = getattr(node, "body", [])
            if body and isinstance(body[0], ast.Expr) and isinstance(body[0].value, ast.Constant) \
                    and isinstance(body[0].value.value, str):
                docstrings.add(id(body[0].value))

    offenders = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Constant) and isinstance(node.value, str) and id(node) not in docstrings:
            token = node.value.strip().lower()
            if token in forbidden or token.startswith(tuple(f"{f} " for f in forbidden)):
                offenders.append(node.value)

    assert offenders == [], f"app/deps.py references privileged package managers: {offenders}"


def test_ytdlp_settings_endpoint_get_and_post(client):
    res_get = client.get("/api/settings/ytdlp").json()
    assert "cookies_from_browser" in res_get
    assert "extractor_args" in res_get

    res_post = client.post(
        "/api/settings/ytdlp",
        json={"cookies_from_browser": "chrome", "extractor_args": "youtube:player_client=mweb"},
    ).json()
    assert res_post["cookies_from_browser"] == "chrome"
    assert res_post["extractor_args"] == "youtube:player_client=mweb"


def test_update_nightly_channel(client, monkeypatch):
    called = {}

    def fake_upgrade(pkg, channel="stable"):
        called["pkg"] = pkg
        called["channel"] = channel
        return {"ok": True, "package": pkg, "channel": channel}

    monkeypatch.setattr("app.main.upgrade_package", fake_upgrade)
    resp = client.post(
        "/api/settings/deps/update",
        json={"package": "yt-dlp", "approved": True, "channel": "nightly"},
    )
    assert resp.json() == {"ok": True, "package": "yt-dlp", "channel": "nightly"}
    assert called["pkg"] == "yt-dlp"
    assert called["channel"] == "nightly"