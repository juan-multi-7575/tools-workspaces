import json
from typing import Any

from app.paths import CONFIG, providers_path

BUILTIN_PROVIDERS = {
    "faster-whisper": {
        "name": "faster-whisper (local)",
        "type": "local",
        "models": ["tiny", "base", "small", "medium", "large-v3"],
        "needs_key": False,
    },
    "groq": {
        "name": "Groq",
        "type": "cloud",
        "models": ["whisper-large-v3-turbo", "whisper-large-v3", "distil-whisper-large-v3-en"],
        "needs_key": True,
        "env_var": "GROQ_API_KEY",
    },
    "openai": {
        "name": "OpenAI Whisper API",
        "type": "cloud",
        "models": ["whisper-1"],
        "needs_key": True,
        "env_var": "OPENAI_API_KEY",
    },
}


def list_providers() -> dict[str, Any]:
    return {pid: {k: v for k, v in info.items() if k != "env_var"} for pid, info in BUILTIN_PROVIDERS.items()}


def get_provider(provider_id: str) -> dict[str, Any] | None:
    info = BUILTIN_PROVIDERS.get(provider_id)
    if info is None:
        return None
    return {k: v for k, v in info.items() if k != "env_var"}


def _load_keys() -> dict[str, str]:
    path = providers_path()
    if not path.exists():
        return {}
    return json.loads(path.read_text())


def _save_keys(keys: dict[str, str]) -> None:
    CONFIG.mkdir(parents=True, exist_ok=True)
    providers_path().write_text(json.dumps(keys, indent=2))


def list_keys() -> list[str]:
    return list(_load_keys().keys())


def save_key(provider_id: str, key: str) -> None:
    keys = _load_keys()
    keys[provider_id] = key
    _save_keys(keys)


def get_key(provider_id: str) -> str | None:
    return _load_keys().get(provider_id)


def detect_local_models() -> list[str]:
    """Auto-detect locally cached faster-whisper models."""
    cache = CONFIG.parent / "models" / "faster-whisper"
    if not cache.exists():
        return []
    return [p.name for p in cache.iterdir() if p.is_dir()]
