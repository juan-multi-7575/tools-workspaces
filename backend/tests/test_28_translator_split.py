import pytest
from fastapi.testclient import TestClient

from app.tools.text.llm_translator import LlmTranslatorTool


def test_translator_split_ids_exist(client):
    for tid in ("text.translate.llm", "subtitle.translate.srt"):
        r = client.get("/api/tools")
        ids = [t["id"] for t in r.json()["tools"]]
        assert tid in ids


def test_old_translator_alias_still_listed(client):
    r = client.get("/api/tools")
    ids = [t["id"] for t in r.json()["tools"]]
    assert "subtitle_translator" in ids
    assert "text.translate.llm" in ids
    assert "ai_model_health_check" in ids


@pytest.mark.parametrize("tool_id,suffix,response", [
    ("text.translate.llm", ".txt", "Hello"),
    ("subtitle.translate.srt", ".srt", "[1] Hello"),
])
def test_translators_use_saved_provider_key(client, tmp_path, monkeypatch, tool_id, suffix, response):
    monkeypatch.setattr("app.providers.CONFIG", tmp_path / "config")
    saved_key = "saved-secret-for-translator"
    assert client.post("/api/providers/groq/key", json={"key": saved_key}).status_code == 200
    monkeypatch.setenv("GROQ_API_KEY", "environment-secret")
    source = tmp_path / f"source{suffix}"
    source.write_text("1\n00:00:01,000 --> 00:00:02,000\n안녕\n" if suffix == ".srt" else "안녕")
    received = []

    async def fake_chat(self, provider, key, model, system_prompt, user_prompt, timeout=120.0):
        received.append((provider, key))
        return response

    monkeypatch.setattr(LlmTranslatorTool, "_call_llm_chat", fake_chat)
    result = client.post(f"/api/tools/{tool_id}/execute", json={
        "kind": "standalone", "destination": str(tmp_path / "out"),
        "params": {"input_path": str(source), "provider": "groq"},
    })
    assert result.status_code == 200
    assert received == [("groq", saved_key)]
    assert result.json()["status"] == "completed"
    assert saved_key not in result.text
    assert "environment-secret" not in result.text


@pytest.mark.parametrize("provider,env_vars", [
    ("groq", ["GROQ_API_KEY"]),
    ("nvidia", ["NVIDIA_API_KEY", "NVAPI_KEY"]),
    ("openai", ["OPENAI_API_KEY"]),
    ("deepseek", ["DEEPSEEK_API_KEY"]),
    ("gemini", ["GEMINI_API_KEY", "GOOGLE_API_KEY"]),
    ("anthropic", ["ANTHROPIC_API_KEY"]),
])
def test_translation_key_precedence(tmp_path, monkeypatch, provider, env_vars):
    from app.providers import save_key

    monkeypatch.setattr("app.providers.CONFIG", tmp_path / "config")
    for name in env_vars:
        monkeypatch.delenv(name, raising=False)
    bashrc = {env_vars[0]: ("bashrc-key", "bashrc")}
    tool = LlmTranslatorTool()
    assert tool._resolve_llm(provider, "custom-model", bashrc) == (provider, "bashrc-key", "custom-model")
    monkeypatch.setenv(env_vars[-1], "environment-key")
    assert tool._resolve_llm(provider, "custom-model", bashrc) == (provider, "environment-key", "custom-model")
    save_key(provider, "saved-key")
    assert tool._resolve_llm(provider, "custom-model", bashrc) == (provider, "saved-key", "custom-model")
    save_key(provider, "")
    assert tool._resolve_llm(provider, "custom-model", bashrc) == (provider, "environment-key", "custom-model")


def test_auto_translation_uses_saved_keys_in_existing_provider_order(tmp_path, monkeypatch):
    from app.providers import save_key

    monkeypatch.setattr("app.providers.CONFIG", tmp_path / "config")
    for name in ("GROQ_API_KEY", "NVIDIA_API_KEY", "NVAPI_KEY", "OPENAI_API_KEY", "DEEPSEEK_API_KEY"):
        monkeypatch.delenv(name, raising=False)
    save_key("openai", "saved-openai")
    tool = LlmTranslatorTool()
    assert tool._resolve_llm("auto", "auto", {})[:2] == ("openai", "saved-openai")
    save_key("groq", "saved-groq")
    monkeypatch.setenv("GROQ_API_KEY", "environment-groq")
    assert tool._resolve_llm("auto", "auto", {})[:2] == ("groq", "saved-groq")


@pytest.mark.parametrize("tool_id", ["text.translate.llm", "subtitle.translate.srt"])
def test_plain_text_provider_error_does_not_expose_saved_key(client, tmp_path, monkeypatch, caplog, tool_id):
    monkeypatch.setattr("app.providers.CONFIG", tmp_path / "config")
    secret = "saved-secret-in-provider-error"
    client.post("/api/providers/groq/key", json={"key": secret})
    source = tmp_path / "source.txt"
    source.write_text("안녕")

    async def failing_chat(self, provider, key, model, system_prompt, user_prompt, timeout=120.0):
        raise RuntimeError(f"Provider rejected credential: {key}")

    monkeypatch.setattr(LlmTranslatorTool, "_call_llm_chat", failing_chat)
    with TestClient(client.app, raise_server_exceptions=False) as error_client:
        result = error_client.post(f"/api/tools/{tool_id}/execute", json={
            "kind": "standalone", "destination": str(tmp_path / "out"),
            "params": {"input_path": str(source), "provider": "groq"},
        })
    assert secret not in caplog.text
    assert secret not in result.text
    assert result.status_code == 200
    assert result.json()["status"] == "failed"
    assert "translation" in result.json()["error"]["message"].lower()
    assert result.json()["artifacts"] == []
