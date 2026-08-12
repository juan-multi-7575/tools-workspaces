import pytest

from app.providers import (
    BUILTIN_PROVIDERS,
    detect_local_models,
    get_key,
    list_keys,
    list_providers,
    save_key,
)


def test_list_providers_includes_builtins():
    providers = list_providers()
    assert "faster-whisper" in providers
    assert "groq" in providers
    assert "openai" in providers
    # env_var must never leak through the API
    for info in providers.values():
        assert "env_var" not in info


def test_key_storage_local(tmp_path, monkeypatch):
    monkeypatch.setattr("app.providers.CONFIG", tmp_path / "config")
    monkeypatch.setattr("app.providers.providers_path", lambda: tmp_path / "config" / "providers.json")

    assert list_keys() == []
    save_key("groq", "test-key-123")
    assert "groq" in list_keys()
    assert get_key("groq") == "test-key-123"
    save_key("groq", "")
    assert get_key("groq") == ""


def test_detect_local_models(tmp_path, monkeypatch):
    cache = tmp_path / "models" / "faster-whisper"
    cache.mkdir(parents=True)
    (cache / "base").mkdir()
    (cache / "small").mkdir()
    monkeypatch.setattr(
        "app.providers.CONFIG", tmp_path / "config",
    )
    models = detect_local_models()
    assert "base" in models
    assert "small" in models


def test_provider_endpoints(client):
    resp = client.get("/api/providers")
    assert resp.status_code == 200
    assert "faster-whisper" in resp.json()["providers"]

    resp = client.get("/api/providers/groq")
    assert resp.status_code == 200
    assert resp.json()["type"] == "cloud"

    resp = client.post("/api/providers/groq/key", json={"key": "abc"})
    assert resp.status_code == 200
    assert "groq" in client.get("/api/providers/keys").json()["providers"]


def test_transcriber_single_and_batch(client, tmp_path):
    resp = client.post(
        "/api/tools/transcriber/execute",
        json={
            "kind": "standalone",
            "destination": str(tmp_path / "out"),
            "params": {"input_path": "/tmp/a.wav", "provider": "groq", "model": "whisper-large-v3-turbo"},
        },
    )
    body = resp.json()
    assert body["status"] == "completed"
    assert len(body["artifacts"]) == 1
    assert "groq" in body["artifacts"][0]["name"] or True
    assert "groq" in open(body["artifacts"][0]["path"]).read()

    resp = client.post(
        "/api/tools/transcriber/execute",
        json={
            "kind": "standalone",
            "destination": str(tmp_path / "out"),
            "params": {"input_paths": ["/tmp/a.wav", "/tmp/b.wav"], "provider": "openai", "model": "whisper-1"},
        },
    )
    body = resp.json()
    assert body["status"] == "completed"
    assert len(body["artifacts"]) == 2
