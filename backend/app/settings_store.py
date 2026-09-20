import json
from typing import Any

from app import paths


DEFAULTS: dict[str, Any] = {
    "download": {"max_concurrent": 2},
    "ytdlp": {
        "cookies_from_browser": "none",
        "cookies_file_path": "",
        "extractor_args": "",
        "user_agent": "",
        "update_channel": "stable",
    },
}


def load_settings() -> dict[str, Any]:
    path = paths.settings_path()
    if not path.exists():
        return json.loads(json.dumps(DEFAULTS))
    data = json.loads(path.read_text())
    merged = dict(DEFAULTS)
    merged.update(data)
    return merged


def save_settings(patch: dict[str, Any]) -> dict[str, Any]:
    data = load_settings()
    for key, value in patch.items():
        if isinstance(value, dict) and isinstance(data.get(key), dict):
            data[key].update(value)
        else:
            data[key] = value
    paths.CONFIG.mkdir(parents=True, exist_ok=True)
    paths.settings_path().write_text(json.dumps(data, indent=2))
    return data
