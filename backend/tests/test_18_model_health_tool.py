from pathlib import Path
import json
import os
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.registry import get, list_manifests
from app.tools.base import ToolRunContext
from app.tools.model_health_tool import (
    ModelHealthCheckTool,
    _resolve_ephemeral_key,
    _scan_bashrc_keys,
    PROVIDER_SPECS,
)


@pytest.fixture
def client(tmp_path, monkeypatch):
    from app import paths
    d = tmp_path / "downloads"
    w = tmp_path / "workspaces"
    c = tmp_path / "config"
    monkeypatch.setattr(paths, "DOWNLOADS", d)
    monkeypatch.setattr(paths, "WORKSPACES", w)
    monkeypatch.setattr(paths, "CONFIG", c)
    paths.ensure_layout()
    return TestClient(app)


def test_tool_manifest_registered():
    tool = get("ai_model_health_check")
    assert tool is not None
    assert isinstance(tool, ModelHealthCheckTool)
    manifest = tool.manifest
    assert manifest.id == "sys.health.check"
    assert manifest.category == "AI & Tutoring"
    assert "provider" in manifest.parameters_schema
    assert "model" in manifest.parameters_schema
    assert "api_key" in manifest.parameters_schema
    assert "mock_offline" in manifest.parameters_schema
    assert "enum" in manifest.parameters_schema["provider"]


def test_api_detected_providers(client):
    resp = client.get("/api/tools/ai_model_health_check/providers")
    assert resp.status_code == 200
    data = resp.json()
    assert "providers" in data
    assert len(data["providers"]) >= 8
    provider_ids = {p["id"] for p in data["providers"]}
    assert "openai" in provider_ids
    assert "anthropic" in provider_ids
    assert "gemini" in provider_ids
    assert "groq" in provider_ids
    assert "nvidia" in provider_ids


def test_api_get_models_endpoint(client):
    resp = client.get("/api/tools/ai_model_health_check/models?provider=nvidia")
    assert resp.status_code == 200
    data = resp.json()
    assert data["provider"] == "nvidia"
    assert len(data["models"]) > 0


def test_ephemeral_key_resolution_no_disk_persistence(tmp_path, monkeypatch):
    # Direct keys take priority
    key = _resolve_ephemeral_key("openai", direct_keys={"openai": "sk-direct-test"})
    assert key == "sk-direct-test"

    # Single direct key
    key = _resolve_ephemeral_key("anthropic", direct_keys={}, direct_single_key="sk-ant-direct")
    assert key == "sk-ant-direct"

    # Environment variable resolution
    monkeypatch.setenv("GROQ_API_KEY", "gsk-env-test")
    key = _resolve_ephemeral_key("groq", direct_keys={})
    assert key == "gsk-env-test"

    # Missing key returns None
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    key = _resolve_ephemeral_key("openai", direct_keys={})
    assert key is None


@pytest.mark.anyio
async def test_model_health_check_mock_offline_all_providers(tmp_path):
    tool = ModelHealthCheckTool()
    ctx = ToolRunContext(
        workspace_id="test-ws",
        run_id="run-health-1",
        kind="workspace",
        destination=str(tmp_path),
        params={
            "provider": "all",
            "mock_offline": True,
            "prompt": "ping test",
        },
    )

    result = await tool.execute(ctx)
    assert result.status == "completed"
    # Pure in-memory data, no md files generated or persisted
    assert len(result.artifacts) == 0
    assert result.data is not None
    assert "summary" in result.data
    assert result.data["summary"]["total_probed"] > 0
    assert result.data["summary"]["healthy"] > 0


@pytest.mark.anyio
async def test_selective_single_provider_probe(tmp_path):
    tool = ModelHealthCheckTool()
    ctx = ToolRunContext(
        workspace_id="test-ws",
        run_id="run-health-2",
        kind="workspace",
        destination=str(tmp_path),
        params={
            "provider": "nvidia",
            "model": "meta/llama-3.1-70b-instruct",
            "api_key": "nvapi-test-ephemeral-key",
            "mock_offline": True,
        },
    )

    result = await tool.execute(ctx)
    assert result.status == "completed"
    assert len(result.artifacts) == 0
    assert result.data is not None
    assert result.data["summary"]["total_probed"] == 1
    assert result.data["results"][0]["provider_id"] == "nvidia"
    assert result.data["results"][0]["model"] == "meta/llama-3.1-70b-instruct"
    assert result.data["results"][0]["status"] == "HEALTHY"


@pytest.mark.anyio
async def test_unconfigured_provider_graceful_handling(tmp_path, monkeypatch):
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    tool = ModelHealthCheckTool()
    ctx = ToolRunContext(
        workspace_id="test-ws",
        run_id="run-health-3",
        kind="workspace",
        destination=str(tmp_path),
        params={
            "provider": "deepseek",
            "mock_offline": False,
        },
    )

    result = await tool.execute(ctx)
    assert result.status == "completed"
    assert len(result.artifacts) == 0
    assert result.data is not None
    assert result.data["summary"]["unconfigured"] >= 1
    assert result.data["results"][0]["status"] == "UNCONFIGURED"
    assert "DEEPSEEK_API_KEY" in result.data["results"][0]["error"]


def test_api_execute_model_health_check(client, tmp_path):
    payload = {
        "kind": "standalone",
        "destination": str(tmp_path),
        "params": {
            "provider": "groq",
            "mock_offline": True,
        },
    }
    resp = client.post("/api/tools/ai_model_health_check/execute", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "completed"
    assert len(data["artifacts"]) == 0
    assert data["data"] is not None
    assert data["data"]["summary"]["total_probed"] > 0


@pytest.mark.anyio
async def test_dynamic_custom_env_provider_discovery(monkeypatch, tmp_path):
    monkeypatch.setenv("MY_CUSTOM_LLM_API_KEY", "sk-custom-secret-key")
    monkeypatch.setenv("MY_CUSTOM_LLM_BASE_URL", "https://api.mycustomllm.com/v1")

    from app.tools.model_health_tool import get_detected_providers_summary, ModelHealthCheckTool
    summary = get_detected_providers_summary()
    custom_provs = [p for p in summary if p["id"] == "custom-my-custom-llm"]
    assert len(custom_provs) == 1
    p = custom_provs[0]
    assert p["has_key"] is True
    assert p["source"] == "environment"
    assert p["is_custom"] is True
    assert "MY_CUSTOM_LLM_API_KEY" in p["env_vars"]

    tool = ModelHealthCheckTool()
    ctx = ToolRunContext(
        workspace_id="test-ws",
        run_id="run-health-custom",
        kind="workspace",
        destination=str(tmp_path),
        params={
            "provider": "custom-my-custom-llm",
            "mock_offline": True,
        },
    )
    res = await tool.execute(ctx)
    assert res.status == "completed"
    assert res.data["summary"]["total_probed"] > 0
    assert res.data["results"][0]["provider_id"] == "custom-my-custom-llm"
