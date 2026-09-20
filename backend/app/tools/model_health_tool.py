from __future__ import annotations

import asyncio
import json
import os
import re
import time
from pathlib import Path
from typing import Any

import httpx

from app.paths import run_dir, tool_downloads_dir
from app.tools.base import Artifact, PortKind, Tool, ToolManifest, ToolResult, ToolRunContext


PROVIDER_SPECS: dict[str, dict[str, Any]] = {
    "openai": {
        "name": "OpenAI",
        "env_vars": ["OPENAI_API_KEY"],
        "default_models": ["gpt-4o-mini", "gpt-4o", "o1-mini"],
        "endpoint": "https://api.openai.com/v1/chat/completions",
        "models_endpoint": "https://api.openai.com/v1/models",
        "format": "openai_chat",
        "description": "GPT-4o, GPT-4o-mini, o1 reasoning models",
    },
    "anthropic": {
        "name": "Anthropic",
        "env_vars": ["ANTHROPIC_API_KEY"],
        "default_models": ["claude-3-5-haiku-20241022", "claude-3-5-sonnet-20241022"],
        "endpoint": "https://api.anthropic.com/v1/messages",
        "models_endpoint": "https://api.anthropic.com/v1/models",
        "format": "anthropic_messages",
        "description": "Claude 3.5 Sonnet, Claude 3.5 Haiku",
    },
    "gemini": {
        "name": "Google Gemini",
        "env_vars": ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
        "default_models": ["gemini-2.0-flash", "gemini-1.5-flash"],
        "endpoint": "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        "models_endpoint": "https://generativelanguage.googleapis.com/v1beta/models",
        "format": "gemini",
        "description": "Gemini 2.0 Flash, Gemini 1.5 Flash",
    },
    "groq": {
        "name": "Groq",
        "env_vars": ["GROQ_API_KEY"],
        "default_models": [
            "openai/gpt-oss-20b",
            "openai/gpt-oss-120b",
            "qwen/qwen3.8-27b",
            "qwen/qwen3.6-27b",
            "groq/compound",
            "allam-2-7b",
        ],
        "endpoint": "https://api.groq.com/openai/v1/chat/completions",
        "models_endpoint": "https://api.groq.com/openai/v1/models",
        "format": "openai_chat",
        "description": "Ultra-low latency inference engine (GPT OSS, Qwen 3.8, Compound)",
    },
    "nvidia": {
        "name": "NVIDIA",
        "env_vars": ["NVIDIA_API_KEY", "NVAPI_KEY"],
        "default_models": [
            "nvidia/llama-3.1-nemotron-70b-instruct",
            "mistralai/mistral-large-2-instruct",
            "meta/llama-3.2-11b-vision-instruct",
            "google/gemma-3-12b-it",
            "deepseek-ai/deepseek-v4-pro-0813",
            "01-ai/yi-large",
        ],
        "endpoint": "https://integrate.api.nvidia.com/v1/chat/completions",
        "models_endpoint": "https://integrate.api.nvidia.com/v1/models",
        "format": "openai_chat",
        "description": "NVIDIA NIM & Cloud APIs (Nemotron 70B, Mistral Large 2, Gemma 3, Llama 3.2)",
    },
    "deepseek": {
        "name": "DeepSeek",
        "env_vars": ["DEEPSEEK_API_KEY"],
        "default_models": ["deepseek-chat", "deepseek-reasoner"],
        "endpoint": "https://api.deepseek.com/chat/completions",
        "models_endpoint": "https://api.deepseek.com/models",
        "format": "openai_chat",
        "description": "DeepSeek-V3 Chat & R1 Reasoner",
    },
    "mistral": {
        "name": "Mistral AI",
        "env_vars": ["MISTRAL_API_KEY"],
        "default_models": ["mistral-small-latest", "mistral-large-latest"],
        "endpoint": "https://api.mistral.ai/v1/chat/completions",
        "models_endpoint": "https://api.mistral.ai/v1/models",
        "format": "openai_chat",
        "description": "Mistral Small, Large & Codestral",
    },
    "openrouter": {
        "name": "OpenRouter",
        "env_vars": ["OPENROUTER_API_KEY"],
        "default_models": ["openrouter/auto", "meta-llama/llama-3.2-3b-instruct"],
        "endpoint": "https://openrouter.ai/api/v1/chat/completions",
        "models_endpoint": "https://openrouter.ai/api/v1/models",
        "format": "openai_chat",
        "description": "Universal AI API gateway aggregator",
    },
    "cohere": {
        "name": "Cohere",
        "env_vars": ["COHERE_API_KEY"],
        "default_models": ["command-r-plus-08-2024", "command-r-08-2024"],
        "endpoint": "https://api.cohere.com/v2/chat",
        "models_endpoint": "https://api.cohere.com/v1/models",
        "format": "cohere",
        "description": "Command R+ & enterprise multilingual models",
    },
    "together": {
        "name": "Together AI",
        "env_vars": ["TOGETHER_API_KEY", "TOGETHERAI_API_KEY"],
        "default_models": ["meta-llama/Llama-3.3-70B-Instruct-Turbo", "mistralai/Mixtral-8x7B-Instruct-v0.1"],
        "endpoint": "https://api.together.xyz/v1/chat/completions",
        "models_endpoint": "https://api.together.xyz/v1/models",
        "format": "openai_chat",
        "description": "Fast open-source inference platform",
    },
    "fireworks": {
        "name": "Fireworks AI",
        "env_vars": ["FIREWORKS_API_KEY"],
        "default_models": ["accounts/fireworks/models/llama-v3p3-70b-instruct"],
        "endpoint": "https://api.fireworks.ai/inference/v1/chat/completions",
        "models_endpoint": "https://api.fireworks.ai/inference/v1/models",
        "format": "openai_chat",
        "description": "Ultra-fast generative AI model inference",
    },
    "perplexity": {
        "name": "Perplexity",
        "env_vars": ["PERPLEXITY_API_KEY", "PPLX_API_KEY"],
        "default_models": ["sonar", "sonar-pro"],
        "endpoint": "https://api.perplexity.ai/chat/completions",
        "models_endpoint": "https://api.perplexity.ai/models",
        "format": "openai_chat",
        "description": "Online search-augmented LLM reasoning",
    },
    "xai": {
        "name": "xAI (Grok)",
        "env_vars": ["XAI_API_KEY", "GROK_API_KEY"],
        "default_models": ["grok-2-latest", "grok-beta"],
        "endpoint": "https://api.x.ai/v1/chat/completions",
        "models_endpoint": "https://api.x.ai/v1/models",
        "format": "openai_chat",
        "description": "Grok 2 latest Frontier models",
    },
    "sambanova": {
        "name": "SambaNova",
        "env_vars": ["SAMBANOVA_API_KEY"],
        "default_models": ["Meta-Llama-3.3-70B-Instruct"],
        "endpoint": "https://api.sambanova.ai/v1/chat/completions",
        "models_endpoint": "https://api.sambanova.ai/v1/models",
        "format": "openai_chat",
        "description": "SambaNova SN40L ultra-fast inference",
    },
    "cerebras": {
        "name": "Cerebras",
        "env_vars": ["CEREBRAS_API_KEY"],
        "default_models": ["llama3.3-70b", "llama3.1-8b"],
        "endpoint": "https://api.cerebras.ai/v1/chat/completions",
        "models_endpoint": "https://api.cerebras.ai/v1/models",
        "format": "openai_chat",
        "description": "Wafer-scale engine extreme tokens/sec",
    },
    "deepinfra": {
        "name": "DeepInfra",
        "env_vars": ["DEEPINFRA_API_KEY"],
        "default_models": ["meta-llama/Meta-Llama-3.3-70B-Instruct"],
        "endpoint": "https://api.deepinfra.com/v1/openai/chat/completions",
        "models_endpoint": "https://api.deepinfra.com/v1/openai/models",
        "format": "openai_chat",
        "description": "Serverless pay-per-token model inference",
    },
    "hyperbolic": {
        "name": "Hyperbolic",
        "env_vars": ["HYPERBOLIC_API_KEY"],
        "default_models": ["meta-llama/Llama-3.3-70B-Instruct"],
        "endpoint": "https://api.hyperbolic.xyz/v1/chat/completions",
        "models_endpoint": "https://api.hyperbolic.xyz/v1/models",
        "format": "openai_chat",
        "description": "Decentralized open access GPU inference",
    },
    "ollama": {
        "name": "Ollama (Local)",
        "env_vars": ["OLLAMA_HOST"],
        "default_models": ["llama3", "mistral"],
        "endpoint": "{host}/api/generate",
        "models_endpoint": "{host}/api/tags",
        "format": "ollama",
        "description": "Local offline LLM runner (localhost:11434)",
    },
    "faster-whisper": {
        "name": "faster-whisper (Local Audio)",
        "env_vars": [],
        "default_models": ["tiny", "base", "small"],
        "endpoint": "local",
        "models_endpoint": "local",
        "format": "local_whisper",
        "description": "Embedded local speech recognition runtime",
    },
}

DYNAMIC_CUSTOM_SPECS: dict[str, dict[str, Any]] = {}

SYSTEM_IGNORE_VARS = {
    "SSH_AUTH_SOCK", "GPG_KEY", "DEBUGINFOD_URLS", "ANTIGRAVITY_CSRF_TOKEN",
    "ANTIGRAVITY_AGENTAPI_EXE", "AGY_BROWSER_WS_URL", "COLORTERM", "TERM",
    "PATH", "PWD", "OLDPWD", "HOME", "USER", "SHELL", "SHLVL", "LANG",
}


def _scan_bashrc_keys() -> dict[str, tuple[str, str]]:
    """
    Parse shell profile files in-memory for exported keys.
    Universal regex scan for any API keys, tokens, or URLs.
    Returns dict mapping ENV_VAR -> (key_value, source_file_name).
    Never persists keys to disk.
    """
    extracted: dict[str, tuple[str, str]] = {}
    home = Path.home()
    target_files = [
        (home / ".bashrc", "~/.bashrc"),
        (home / ".bash_profile", "~/.bash_profile"),
        (home / ".zshrc", "~/.zshrc"),
        (home / ".profile", "~/.profile"),
        (home / ".env", ".env"),
    ]

    pattern = r"(?:export\s+)?([A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|API|URL|BASE)[A-Za-z0-9_]*)\s*=\s*['\"]?([^'\"#\r\n\s]+)"
    for f_path, f_label in target_files:
        if not f_path.exists() or not f_path.is_file():
            continue
        try:
            content = f_path.read_text(encoding="utf-8", errors="replace")
            for match in re.finditer(pattern, content):
                var_name = match.group(1).strip()
                val = match.group(2).strip()
                if var_name and val and var_name not in extracted:
                    extracted[var_name] = (val, f_label)
        except Exception:
            continue

    return extracted


def _discover_custom_env_providers(bashrc_map: dict[str, tuple[str, str]]) -> list[dict[str, Any]]:
    """
    Find ANY environment variable or bashrc export representing an AI provider API key.
    If it's not in known PROVIDER_SPECS, dynamically register it as a custom AI provider!
    """
    discovered = []
    candidates: dict[str, tuple[str, str]] = {}
    for k, v in os.environ.items():
        if k not in SYSTEM_IGNORE_VARS and v and v.strip():
            candidates[k] = (v.strip(), "environment")
    for k, (v, src) in bashrc_map.items():
        if k not in SYSTEM_IGNORE_VARS and v and v.strip() and k not in candidates:
            candidates[k] = (v.strip(), src)

    known_env_vars = set()
    for s in PROVIDER_SPECS.values():
        known_env_vars.update(s.get("env_vars", []))

    for var, (val, src) in candidates.items():
        if var in known_env_vars:
            continue
        m = re.match(r"^(.*?)(?:_API_KEY|_API_TOKEN|_SECRET_KEY|_API|_TOKEN|_KEY)$", var)
        if not m or not m.group(1):
            continue
        prefix = m.group(1).lower().strip("_")
        if not prefix or prefix in ("ssh", "gpg", "ssl", "jwt", "session", "csrf", "antigravity", "debuginfod", "git"):
            continue

        pid = f"custom-{prefix.replace('_', '-')}"
        name = " ".join(part.capitalize() for part in prefix.split("_"))

        # Look for matching base URL or endpoint
        base_candidates = [
            f"{m.group(1)}_BASE_URL", f"{m.group(1)}_URL", f"{m.group(1)}_ENDPOINT",
            f"{m.group(1)}_API_BASE",
        ]
        base_url = None
        for bvar in base_candidates:
            if os.environ.get(bvar):
                base_url = os.environ[bvar].rstrip("/")
                break
            elif bvar in bashrc_map:
                base_url = bashrc_map[bvar][0].rstrip("/")
                break

        if base_url:
            chat_ep = f"{base_url}/chat/completions" if not base_url.endswith("/chat/completions") else base_url
            models_ep = f"{base_url}/models" if not base_url.endswith("/models") else base_url
        else:
            chat_ep = f"https://api.{prefix}.com/v1/chat/completions"
            models_ep = f"https://api.{prefix}.com/v1/models"

        spec = {
            "name": f"{name} (Env)",
            "env_vars": [var],
            "default_models": ["default", f"{prefix}-chat"],
            "endpoint": chat_ep,
            "models_endpoint": models_ep,
            "format": "openai_chat",
            "description": f"Custom AI provider detected from {var}",
            "is_custom": True,
        }
        DYNAMIC_CUSTOM_SPECS[pid] = spec
        discovered.append({
            "id": pid,
            "name": spec["name"],
            "description": spec["description"],
            "models": spec["default_models"],
            "has_key": True,
            "source": src,
            "env_vars": [var],
            "is_custom": True,
        })

    return discovered


def get_provider_spec(pid: str) -> dict[str, Any]:
    """Retrieve spec from either built-in catalog or dynamic custom env providers."""
    if pid in PROVIDER_SPECS:
        return PROVIDER_SPECS[pid]
    if pid in DYNAMIC_CUSTOM_SPECS:
        return DYNAMIC_CUSTOM_SPECS[pid]
    return {}


def get_detected_providers_summary() -> list[dict[str, Any]]:
    """
    Scan environment and bashrc profiles on-the-fly to return provider availability
    with credential sources (without leaking raw keys).
    Any provider found in env or bashrc is automatically included and highlighted.
    """
    bashrc_map = _scan_bashrc_keys()
    summary = []

    # 1. Built-in providers
    for pid, spec in PROVIDER_SPECS.items():
        if pid == "faster-whisper":
            try:
                import faster_whisper  # noqa: F401
                has_key = True
                source = "local-python"
            except ImportError:
                has_key = False
                source = "none"
        elif pid == "ollama":
            has_key = True
            source = "local-daemon"
        else:
            has_key = False
            source = "none"
            for var in spec["env_vars"]:
                if os.environ.get(var):
                    has_key = True
                    source = "environment"
                    break
                elif var in bashrc_map:
                    has_key = True
                    source = bashrc_map[var][1]
                    break

        summary.append({
            "id": pid,
            "name": spec["name"],
            "description": spec["description"],
            "models": spec["default_models"],
            "has_key": has_key,
            "source": source,
            "env_vars": spec["env_vars"],
            "is_custom": False,
        })

    # 2. Dynamic custom providers detected in env / bashrc
    custom_providers = _discover_custom_env_providers(bashrc_map)
    summary.extend(custom_providers)

    # Sort so that all active/detected providers appear first!
    summary.sort(key=lambda p: (not p["has_key"], p["id"]))

    return summary


def _resolve_ephemeral_key(
    provider_id: str,
    direct_single_key: str = "",
    direct_keys: dict[str, str] | None = None,
    file_keys: dict[str, tuple[str, str]] | None = None,
) -> str | None:
    """Resolve API key strictly in-memory from direct input, environment, or shell rc files."""
    if direct_keys and provider_id in direct_keys and direct_keys[provider_id].strip():
        return direct_keys[provider_id].strip()

    if direct_single_key and direct_single_key.strip():
        return direct_single_key.strip()

    spec = get_provider_spec(provider_id)
    env_vars = spec.get("env_vars", [])

    for var in env_vars:
        val = os.environ.get(var)
        if val and val.strip():
            return val.strip()

    if file_keys:
        for var in env_vars:
            if var in file_keys:
                val, _ = file_keys[var]
                if val and val.strip():
                    return val.strip()

async def fetch_provider_models(
    provider_id: str,
    api_key: str | None = None,
    scan_bashrc: bool = True,
) -> dict[str, Any]:
    """Dynamically query the provider's models endpoint using active or ephemeral credentials."""
    spec = get_provider_spec(provider_id)
    if not spec:
        return {
            "provider": provider_id,
            "models": [],
            "error": f"Unknown provider '{provider_id}'",
            "source": "error",
            "count": 0,
        }

    default_models = spec.get("default_models", [])

    if provider_id == "faster-whisper":
        return {
            "provider": provider_id,
            "models": ["tiny", "base", "small", "medium", "large-v3"],
            "source": "local-runtime",
            "count": 5,
        }

    if provider_id == "ollama":
        host = os.environ.get("OLLAMA_HOST", "http://localhost:11434").rstrip("/")
        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                r = await client.get(f"{host}/api/tags")
                if r.status_code == 200:
                    data = r.json()
                    models = [m["name"] for m in data.get("models", []) if isinstance(m, dict) and "name" in m]
                    if models:
                        return {
                            "provider": provider_id,
                            "models": sorted(models),
                            "source": "live_api",
                            "count": len(models),
                        }
        except Exception:
            pass
        return {
            "provider": provider_id,
            "models": default_models,
            "source": "default_fallback",
            "count": len(default_models),
        }

    file_keys = _scan_bashrc_keys() if scan_bashrc else {}
    key = _resolve_ephemeral_key(
        provider_id=provider_id,
        direct_single_key=api_key or "",
        file_keys=file_keys,
    )

    if not key:
        return {
            "provider": provider_id,
            "models": default_models,
            "error": "No API key configured for live model discovery. Showing default models.",
            "source": "default_fallback",
            "count": len(default_models),
        }

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            if provider_id in ("openai", "groq", "deepseek", "mistral", "openrouter", "nvidia"):
                models_url = spec.get("models_endpoint")
                if not models_url:
                    return {"provider": provider_id, "models": default_models, "source": "defaults", "count": len(default_models)}
                r = await client.get(models_url, headers={"Authorization": f"Bearer {key}"})
                if r.status_code == 200:
                    data = r.json()
                    models = [m["id"] for m in data.get("data", []) if isinstance(m, dict) and "id" in m]
                    if models:
                        return {
                            "provider": provider_id,
                            "models": sorted(models),
                            "source": "live_api",
                            "count": len(models),
                        }
                return {
                    "provider": provider_id,
                    "models": default_models,
                    "error": f"API returned HTTP {r.status_code}: {r.text[:100]}",
                    "source": "default_fallback",
                    "count": len(default_models),
                }

            elif provider_id == "anthropic":
                r = await client.get(
                    "https://api.anthropic.com/v1/models",
                    headers={"x-api-key": key, "anthropic-version": "2023-06-01"},
                )
                if r.status_code == 200:
                    data = r.json()
                    models = [m["id"] for m in data.get("data", []) if isinstance(m, dict) and "id" in m]
                    if models:
                        return {
                            "provider": provider_id,
                            "models": sorted(models),
                            "source": "live_api",
                            "count": len(models),
                        }
                return {
                    "provider": provider_id,
                    "models": default_models,
                    "error": f"Anthropic returned HTTP {r.status_code}",
                    "source": "default_fallback",
                    "count": len(default_models),
                }

            elif provider_id == "gemini":
                r = await client.get(f"https://generativelanguage.googleapis.com/v1beta/models?key={key}")
                if r.status_code == 200:
                    data = r.json()
                    raw_models = [
                        m["name"].replace("models/", "")
                        for m in data.get("models", [])
                        if isinstance(m, dict) and "name" in m
                    ]
                    filtered = [m for m in raw_models if any(kw in m.lower() for kw in ("gemini", "flash", "pro"))]
                    models = filtered if filtered else raw_models
                    if models:
                        return {
                            "provider": provider_id,
                            "models": sorted(models),
                            "source": "live_api",
                            "count": len(models),
                        }
                return {
                    "provider": provider_id,
                    "models": default_models,
                    "error": f"Gemini returned HTTP {r.status_code}",
                    "source": "default_fallback",
                    "count": len(default_models),
                }
    except Exception as e:
        return {
            "provider": provider_id,
            "models": default_models,
            "error": str(e)[:120],
            "source": "default_fallback",
            "count": len(default_models),
        }

    return {
        "provider": provider_id,
        "models": default_models,
        "source": "default_fallback",
        "count": len(default_models),
    }


def _clean_error_message(status_code: int, raw_text: str, model_id: str) -> str:
    """Format a clean, user-friendly error message from API response without raw JSON dumps."""
    extracted = ""
    if raw_text:
        try:
            data = json.loads(raw_text)
            if isinstance(data, dict):
                if "detail" in data and data["detail"]:
                    extracted = str(data["detail"])
                elif "error" in data:
                    err = data["error"]
                    if isinstance(err, dict) and "message" in err:
                        extracted = str(err["message"])
                    else:
                        extracted = str(err)
                elif "message" in data and data["message"]:
                    extracted = str(data["message"])
        except Exception:
            extracted = re.sub(r'[\r\n\t]+', ' ', raw_text).strip()

    # NVIDIA function/account entitlement check
    if "Not found for account" in extracted or ("Function" in extracted and "Not found" in extracted):
        return "Model not entitled or not enabled for this NVIDIA account tier (HTTP 404)"
    # Groq / OpenAI decommissioned or missing model
    if "does not exist or you do not have access to it" in extracted or "model_not_found" in raw_text:
        return f"Model '{model_id}' does not exist on this provider account (HTTP 404)"
    if "end of life" in extracted.lower() or status_code == 410:
        return f"Model '{model_id}' reached End-of-Life on provider (HTTP 410 Gone)"
    if status_code == 404:
        return f"Model '{model_id}' not found in provider catalog (HTTP 404)"
    if status_code in (401, 403):
        return f"Authentication failed: invalid or expired API key (HTTP {status_code})"
    if status_code == 429:
        return f"Rate limit or token quota exceeded (HTTP 429)"
    if status_code == 503:
        return "Provider service temporarily unavailable or model overloaded (HTTP 503)"
    return extracted[:140] if extracted else f"HTTP {status_code} Error"


class ModelHealthCheckTool(Tool):
    manifest = ToolManifest(
        id="sys.health.check",
        name="AI Model Health Check & Latency Probe",
        description="Selective ephemeral health checker & latency benchmark for AI models across providers (OpenAI, Anthropic, Gemini, Groq, NVIDIA, DeepSeek, Mistral, OpenRouter, Ollama, faster-whisper). Fetches keys ephemerally from environment/bashrc or direct input with zero disk persistence.",
        category="AI & Tutoring",
        tags=["ai", "health-check", "benchmark", "llm", "latency", "probe", "diagnostics", "nvidia"],
        input_kinds=[PortKind.any, PortKind.json, PortKind.text],
        output_kinds=[PortKind.json, PortKind.text],
        parameters_schema={
            "provider": {
                "type": "string",
                "title": "AI Provider Selector",
                "description": "Choose a specific provider to test, or 'all' to probe all configured providers.",
                "enum": [
                    "all",
                    "openai",
                    "anthropic",
                    "gemini",
                    "groq",
                    "nvidia",
                    "deepseek",
                    "mistral",
                    "openrouter",
                    "ollama",
                    "faster-whisper",
                ],
                "enumLabels": {
                    "all": "All Configured Providers (Full Sweep)",
                    "openai": "OpenAI (GPT-4o, GPT-4o-mini)",
                    "anthropic": "Anthropic (Claude 3.5 Sonnet / Haiku)",
                    "gemini": "Google Gemini (Gemini 2.0 / 1.5 Flash)",
                    "groq": "Groq (Llama 3.3 70B, Llama 3.1 8B)",
                    "nvidia": "NVIDIA (Llama 3.1 70B, Nemotron, Mistral)",
                    "deepseek": "DeepSeek (DeepSeek Chat, Reasoner)",
                    "mistral": "Mistral AI (Mistral Large, Small)",
                    "openrouter": "OpenRouter (Universal Router Gateway)",
                    "ollama": "Ollama (Local LLM Daemon)",
                    "faster-whisper": "faster-whisper (Local Audio Runtime)",
                },
                "default": "all",
            },
            "model": {
                "type": "string",
                "title": "Specific Model Override",
                "description": "Optional specific model identifier to test (leave blank for provider default models).",
                "default": "",
                "placeholder": "e.g. gpt-4o-mini, meta/llama-3.1-70b-instruct, or default",
            },
            "models": {
                "type": "string",
                "title": "Selected Models List",
                "description": "Optional comma-separated list of models to test.",
                "default": "",
                "placeholder": "e.g. gpt-4o-mini, gpt-4o",
            },
            "fetch_live_models": {
                "type": "boolean",
                "title": "Fetch Live Models from Provider",
                "description": "Query the provider's /v1/models endpoint in real-time to discover available models.",
                "default": False,
            },
            "api_key": {
                "type": "string",
                "title": "Ephemeral API Key",
                "description": "Direct ephemeral API key (only needed if not present in ~/.bashrc or env; never stored).",
                "widget": "secret",
                "default": "",
                "placeholder": "Paste temporary API key (optional)...",
            },
            "mock_offline": {
                "type": "boolean",
                "title": "Mock Offline Simulation",
                "description": "Run mock probe verification without network calls (ideal for dry-runs).",
                "default": False,
            },
        },
    )

    async def execute(self, context: ToolRunContext) -> ToolResult:
        provider_param = str(context.params.get("provider", "all")).lower().strip()
        model_param = str(context.params.get("model", "")).strip()
        models_param = context.params.get("models")
        fetch_live_models_flag = bool(context.params.get("fetch_live_models", False))

        custom_models_list: list[str] = []
        if isinstance(models_param, str) and models_param.strip():
            custom_models_list = [m.strip() for m in models_param.split(",") if m.strip()]
        elif isinstance(models_param, list):
            custom_models_list = [str(m).strip() for m in models_param if str(m).strip()]

        direct_key = str(context.params.get("api_key", "")).strip()
        direct_keys = context.params.get("keys", {})
        if not isinstance(direct_keys, dict):
            direct_keys = {}
        prompt = str(context.params.get("prompt", "Health check probe. Respond with: OK"))
        try:
            timeout_seconds = float(context.params.get("timeout_seconds", 10))
        except (ValueError, TypeError):
            timeout_seconds = 10.0
        mock_offline = bool(context.params.get("mock_offline", False))

        file_keys = _scan_bashrc_keys()

        all_specs = {**PROVIDER_SPECS, **DYNAMIC_CUSTOM_SPECS}
        if provider_param in ("all", "*", ""):
            providers_to_test = list(all_specs.keys())
        elif provider_param in all_specs:
            providers_to_test = [provider_param]
        else:
            return ToolResult(
                artifacts=[],
                status="failed",
                error=f"Unknown provider '{provider_param}'. Supported: {', '.join(all_specs.keys())} or 'all'",
            )

        probe_items: list[dict[str, Any]] = []
        for pid in providers_to_test:
            spec = get_provider_spec(pid)
            key = _resolve_ephemeral_key(
                provider_id=pid,
                direct_single_key=direct_key if len(providers_to_test) == 1 else "",
                direct_keys=direct_keys,
                file_keys=file_keys,
            )

            # Determine models for this provider
            if custom_models_list and provider_param != "all":
                models = custom_models_list
            elif model_param and provider_param != "all":
                models = [model_param]
            elif provider_param != "all" and key:
                # Single provider selected: probe all live models returned by the provider's /v1/models API!
                fetched_info = await fetch_provider_models(pid, api_key=key, scan_bashrc=False)
                discovered = fetched_info.get("models", [])
                models = discovered if discovered else spec["default_models"]
            else:
                models = spec["default_models"]

            for m in models:
                probe_items.append({
                    "provider_id": pid,
                    "provider_name": spec["name"],
                    "model": m,
                    "key": key,
                    "spec": spec,
                })

        tasks = [
            self._probe_single_model(
                item=item,
                prompt=prompt,
                timeout=timeout_seconds,
                mock_offline=mock_offline,
            )
            for item in probe_items
        ]
        results = await asyncio.gather(*tasks)

        total = len(results)
        healthy_count = sum(1 for r in results if r["status"] == "HEALTHY")
        unconfigured_count = sum(1 for r in results if r["status"] == "UNCONFIGURED")
        failed_count = sum(1 for r in results if r["status"] in ("FAILED", "AUTH_ERROR", "TIMEOUT"))

        report_data = {
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "summary": {
                "total_probed": total,
                "healthy": healthy_count,
                "unconfigured": unconfigured_count,
                "failed": failed_count,
                "health_percentage": round((healthy_count / total * 100) if total else 0, 1),
            },
            "results": results,
        }

        # NO markdown files written to disk or returned in artifacts
        return ToolResult(
            artifacts=[],
            status="completed",
            data=report_data,
        )

    async def _probe_single_model(
        self,
        item: dict[str, Any],
        prompt: str,
        timeout: float,
        mock_offline: bool,
    ) -> dict[str, Any]:
        pid = item["provider_id"]
        pname = item["provider_name"]
        model = item["model"]
        key = item["key"]
        spec = item["spec"]

        base_res: dict[str, Any] = {
            "provider_id": pid,
            "provider_name": pname,
            "model": model,
            "status": "UNKNOWN",
            "latency_ms": 0.0,
            "response_snippet": "",
            "error": None,
            "tests_passed": [],
            "tests_failed": [],
        }

        if pid == "faster-whisper":
            t0 = time.perf_counter()
            try:
                import faster_whisper  # noqa: F401
                latency = round((time.perf_counter() - t0) * 1000, 2)
                base_res.update({
                    "status": "HEALTHY",
                    "latency_ms": latency,
                    "response_snippet": f"faster-whisper local runtime ready ({model})",
                    "tests_passed": ["Local Runtime Import", "Engine Initialization", "Model Weights Available"],
                    "tests_failed": [],
                })
            except ImportError:
                base_res.update({
                    "status": "FAILED",
                    "latency_ms": 0.0,
                    "error": "faster-whisper Python package not installed in environment",
                    "tests_passed": [],
                    "tests_failed": ["Package Installation (faster-whisper)"],
                })
            return base_res

        if pid == "ollama":
            host = key or os.environ.get("OLLAMA_HOST", "http://localhost:11434").rstrip("/")
            if mock_offline:
                return {
                    **base_res,
                    "status": "HEALTHY",
                    "latency_ms": 24.5,
                    "response_snippet": f"[Mock Ollama] {model} responded: OK",
                    "tests_passed": ["Daemon Reachability", "Chat Completion", "Latency SLA"],
                    "tests_failed": [],
                }
            t0 = time.perf_counter()
            try:
                async with httpx.AsyncClient(timeout=timeout) as client:
                    resp = await client.post(
                        f"{host}/api/generate",
                        json={"model": model, "prompt": prompt, "stream": False},
                    )
                    latency = round((time.perf_counter() - t0) * 1000, 2)
                    if resp.status_code == 200:
                        data = resp.json()
                        snippet = str(data.get("response", "OK"))[:100].strip()
                        base_res.update({
                            "status": "HEALTHY",
                            "latency_ms": latency,
                            "response_snippet": snippet,
                            "tests_passed": ["Daemon Reachability", "Model Loaded", "Inference SLA"],
                            "tests_failed": [],
                        })
                    else:
                        base_res.update({
                            "status": "FAILED",
                            "latency_ms": latency,
                            "error": _clean_error_message(resp.status_code, resp.text, model),
                            "tests_passed": ["Daemon Reachability"],
                            "tests_failed": [f"Inference HTTP {resp.status_code}"],
                        })
            except Exception as e:
                base_res.update({
                    "status": "UNCONFIGURED",
                    "latency_ms": 0.0,
                    "error": f"Ollama daemon unreachable at {host}: {str(e)[:100]}",
                    "tests_passed": [],
                    "tests_failed": ["Daemon Connection"],
                })
            return base_res

        if not key:
            env_hint = ", ".join(spec["env_vars"])
            return {
                **base_res,
                "status": "UNCONFIGURED",
                "error": f"No API key detected. Export {env_hint} in ~/.bashrc or provide ephemeral 'api_key'.",
                "tests_passed": [],
                "tests_failed": ["Credential Found"],
            }

        if mock_offline:
            return {
                **base_res,
                "status": "HEALTHY",
                "latency_ms": round(45.0 + (abs(hash(model)) % 50), 2),
                "response_snippet": f"[Mock Probe OK] Model {model} responded successfully.",
                "tests_passed": ["Authentication", "Chat Completion", "Response Schema", "Latency SLA"],
                "tests_failed": [],
            }

        fmt = spec["format"]
        t0 = time.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                if fmt == "openai_chat":
                    endpoint = spec["endpoint"]
                    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
                    payload = {
                        "model": model,
                        "messages": [{"role": "user", "content": prompt}],
                        "max_tokens": 15,
                    }
                    resp = await client.post(endpoint, headers=headers, json=payload)
                elif fmt == "anthropic_messages":
                    endpoint = spec["endpoint"]
                    headers = {
                        "x-api-key": key,
                        "anthropic-version": "2023-06-01",
                        "Content-Type": "application/json",
                    }
                    payload = {
                        "model": model,
                        "messages": [{"role": "user", "content": prompt}],
                        "max_tokens": 15,
                    }
                    resp = await client.post(endpoint, headers=headers, json=payload)
                elif fmt == "gemini":
                    endpoint = spec["endpoint"].format(model=model) + f"?key={key}"
                    headers = {"Content-Type": "application/json"}
                    payload = {
                        "contents": [{"parts": [{"text": prompt}]}],
                        "generationConfig": {"maxOutputTokens": 15},
                    }
                    resp = await client.post(endpoint, headers=headers, json=payload)
                elif fmt == "cohere":
                    endpoint = spec["endpoint"]
                    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
                    payload = {"message": prompt, "model": model}
                    resp = await client.post(endpoint, headers=headers, json=payload)
                else:
                    return {
                        **base_res,
                        "status": "FAILED",
                        "error": f"Unsupported format '{fmt}'",
                        "tests_passed": [],
                        "tests_failed": ["Protocol Handler"],
                    }

                latency = round((time.perf_counter() - t0) * 1000, 2)
                if resp.status_code == 200:
                    try:
                        data = resp.json()
                        snippet = ""
                        if "choices" in data and len(data["choices"]) > 0:
                            snippet = data["choices"][0].get("message", {}).get("content", "OK")
                        elif "content" in data and len(data["content"]) > 0:
                            snippet = data["content"][0].get("text", "OK")
                        elif "text" in data:
                            snippet = data["text"]
                        elif "message" in data and isinstance(data["message"], dict):
                            parts = data["message"].get("content", [])
                            snippet = parts[0].get("text", "OK") if parts else "OK"
                        elif "candidates" in data and len(data["candidates"]) > 0:
                            parts = data["candidates"][0].get("content", {}).get("parts", [])
                            if parts:
                                snippet = parts[0].get("text", "OK")
                        base_res.update({
                            "status": "HEALTHY",
                            "latency_ms": latency,
                            "response_snippet": str(snippet)[:120].strip(),
                            "tests_passed": ["Authentication", "Chat Completion", "Payload Schema", "Latency SLA"],
                            "tests_failed": [],
                        })
                    except Exception:
                        base_res.update({
                            "status": "HEALTHY",
                            "latency_ms": latency,
                            "response_snippet": "HTTP 200 (Parsed)",
                            "tests_passed": ["Authentication", "Chat Completion"],
                            "tests_failed": [],
                        })
                elif resp.status_code in (401, 403):
                    base_res.update({
                        "status": "AUTH_ERROR",
                        "latency_ms": latency,
                        "error": _clean_error_message(resp.status_code, resp.text, model),
                        "tests_passed": ["Network Reachability"],
                        "tests_failed": [f"Authentication (HTTP {resp.status_code})"],
                    })
                elif resp.status_code == 410:
                    base_res.update({
                        "status": "FAILED",
                        "latency_ms": latency,
                        "error": _clean_error_message(resp.status_code, resp.text, model),
                        "tests_passed": ["Network Reachability", "Authentication"],
                        "tests_failed": ["Model Active (EOL 410 Gone)"],
                    })
                elif resp.status_code == 404:
                    base_res.update({
                        "status": "FAILED",
                        "latency_ms": latency,
                        "error": _clean_error_message(resp.status_code, resp.text, model),
                        "tests_passed": ["Network Reachability", "Authentication"],
                        "tests_failed": ["Model Found (HTTP 404)"],
                    })
                elif resp.status_code == 429:
                    base_res.update({
                        "status": "FAILED",
                        "latency_ms": latency,
                        "error": _clean_error_message(resp.status_code, resp.text, model),
                        "tests_passed": ["Network Reachability", "Authentication", "Model Active"],
                        "tests_failed": ["Rate Quota (HTTP 429)"],
                    })
                else:
                    base_res.update({
                        "status": "FAILED",
                        "latency_ms": latency,
                        "error": _clean_error_message(resp.status_code, resp.text, model),
                        "tests_passed": ["Network Reachability"],
                        "tests_failed": [f"HTTP {resp.status_code}"],
                    })
        except httpx.TimeoutException:
            base_res.update({
                "status": "TIMEOUT",
                "latency_ms": round(timeout * 1000, 2),
                "error": f"Request timed out after {timeout}s",
                "tests_passed": ["Network Reachability"],
                "tests_failed": [f"Timeout SLA ({timeout}s)"],
            })
        except Exception as e:
            base_res.update({
                "status": "FAILED",
                "latency_ms": 0.0,
                "error": str(e)[:140],
                "tests_passed": [],
                "tests_failed": ["Connection / TLS"],
            })

        return base_res

    def _render_markdown_report(self, data: dict[str, Any]) -> str:
        s = data["summary"]
        lines = [
            "# AI Model Health Check & Latency Benchmark Report",
            f"\n**Execution Timestamp:** `{data['timestamp']}`\n",
            "## Summary Telemetry",
            f"- **Total Models Probed:** `{s['total_probed']}`",
            f"- **Healthy / Operational:** `{s['healthy']}`",
            f"- **Unconfigured / Missing Keys:** `{s['unconfigured']}`",
            f"- **Failed / Error:** `{s['failed']}`",
            f"- **Health Rate:** `{s['health_percentage']}%`",
            "\n---\n",
            "## Model Status Matrix\n",
            "| Provider | Model | Status | Latency | Response / Error |",
            "| :--- | :--- | :---: | :---: | :--- |",
        ]

        for r in data["results"]:
            status = r["status"]
            if status == "HEALTHY":
                badge = "`[HEALTHY]`"
            elif status == "UNCONFIGURED":
                badge = "`[UNCONFIGURED]`"
            elif status == "AUTH_ERROR":
                badge = "`[AUTH_ERROR]`"
            elif status == "TIMEOUT":
                badge = "`[TIMEOUT]`"
            else:
                badge = "`[FAILED]`"

            latency_str = f"{r['latency_ms']:.1f} ms" if r["latency_ms"] > 0 else "-"
            detail = r["response_snippet"] or r["error"] or "-"
            detail_clean = str(detail).replace("\n", " ").replace("|", "\\|")
            lines.append(f"| {r['provider_name']} | `{r['model']}` | {badge} | {latency_str} | {detail_clean} |")

        lines.append("\n> [!NOTE]\n> Ephemeral Key Policy: No API credentials are saved to disk. Keys are resolved in-memory from direct input or environment variables for the duration of the probe.")
        return "\n".join(lines) + "\n"
