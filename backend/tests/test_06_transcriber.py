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
            "params": {"input_path": "/tmp/a.wav", "provider": "unsupported_provider", "model": "whisper-large-v3-turbo"},
        },
    )
    body = resp.json()
    assert body["status"] == "failed"
    assert body["artifacts"] == []
    assert "unsupported provider" in body["error"]
    assert "unsupported_provider" in body["error"]

    resp = client.post(
        "/api/tools/transcriber/execute",
        json={
            "kind": "standalone",
            "destination": str(tmp_path / "out"),
            "params": {"input_paths": ["/tmp/a.wav", "/tmp/b.wav"], "provider": "openai", "model": "whisper-1"},
        },
    )
    body = resp.json()
    assert body["status"] == "failed"
    assert body["artifacts"] == []
    assert "openai" in body["error"]


def test_transcriber_faster_whisper_success(client, tmp_path, monkeypatch):
    from app.tools.base import Artifact, PortKind
    from app.tools.downloader import TranscriberTool

    audio = tmp_path / "a.wav"
    audio.write_bytes(b"RIFFplaceholder")

    def fake_transcribe(self, input_paths, model, dest):
        assert model == "base"
        return [
            Artifact(path=str(dest / "a.txt"), kind=PortKind.text, name="a.txt"),
            Artifact(path=str(dest / "a.srt"), kind=PortKind.document, name="a.srt"),
        ]

    monkeypatch.setattr(TranscriberTool, "_transcribe", fake_transcribe)
    resp = client.post(
        "/api/tools/transcriber/execute",
        json={
            "kind": "standalone",
            "destination": str(tmp_path / "out"),
            "params": {"input_path": str(audio), "provider": "faster-whisper", "model": "base"},
        },
    )
    body = resp.json()
    assert body["status"] == "completed"
    assert len(body["artifacts"]) == 2
    assert {a["name"] for a in body["artifacts"]} == {"a.txt", "a.srt"}


def test_transcriber_translate_mode(client, tmp_path, monkeypatch):
    from pathlib import Path
    from app.tools.base import Artifact, PortKind
    from app.tools.downloader import TranscriberTool

    audio = tmp_path / "korean_clip.wav"
    audio.write_bytes(b"RIFFdummydata")

    # Mock transcribe_with_groq to return translated English segments
    async def fake_groq(file_path, api_key, model="whisper-large-v3-turbo", task="transcribe", timeout=120.0):
        assert task == "translate"
        return [
            {"start": 0.0, "end": 2.5, "text": "Did you talk about that in the interview?"},
            {"start": 2.5, "end": 5.0, "text": "Who do you think will marry first?"},
        ]

    import app.tools.subtitles
    monkeypatch.setattr(app.tools.subtitles, "transcribe_with_groq", fake_groq)
    monkeypatch.setenv("GROQ_API_KEY", "gsk_mock_test_key_123")

    resp = client.post(
        "/api/tools/transcriber/execute",
        json={
            "kind": "standalone",
            "destination": str(tmp_path / "out"),
            "params": {
                "input_path": str(audio),
                "provider": "groq",
                "task": "translate",
                "output_mode": "both",
            },
        },
    )
    body = resp.json()
    assert body["status"] == "completed"
    artifact_names = {a["name"] for a in body["artifacts"]}
    assert "korean_clip.en.srt" in artifact_names
    assert "korean_clip.en.vtt" in artifact_names
    assert "korean_clip_en_clean.txt" in artifact_names


def test_split_audio_into_chunks_short_file(tmp_path):
    from app.tools.subtitles import split_audio_into_chunks
    f = tmp_path / "short.wav"
    f.write_bytes(b"x" * 1024)
    chunks = split_audio_into_chunks(f, chunk_duration=600.0)
    assert len(chunks) == 1
    assert chunks[0][0] == f
    assert chunks[0][1] == 0.0

