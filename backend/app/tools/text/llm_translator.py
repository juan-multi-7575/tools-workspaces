from __future__ import annotations

import asyncio
import os
from pathlib import Path

import httpx

from app.paths import resolve_input_file, run_dir, tool_downloads_dir
from app.providers import get_key as get_saved_key
from app.tools.base import Artifact, PortKind, Tool, ToolManifest, ToolResult, ToolRunContext
from app.tools.model_health_tool import PROVIDER_SPECS, _scan_bashrc_keys


LANG_CODE_MAP = {
    "english": "en",
    "korean": "ko",
    "japanese": "ja",
    "spanish": "es",
    "french": "fr",
    "german": "de",
    "chinese": "zh",
    "hindi": "hi",
    "portuguese": "pt",
    "italian": "it",
    "arabic": "ar",
    "russian": "ru",
}


class LlmTranslatorTool(Tool):
    manifest = ToolManifest(
        id="text.translate.llm",
        name="LLM Document & Text Translator",
        description="Translate plain-text documents into English or other languages using LLMs (Groq, NVIDIA, DeepSeek, OpenAI) while preserving markdown headings, bullet points, and paragraph structure.",
        category="AI & Tutoring",
        tags=["translation", "translator", "ai", "llm", "text", "document", "korean", "english"],
        input_kinds=[PortKind.text, PortKind.document, PortKind.any],
        output_kinds=[PortKind.text, PortKind.document],
        parameters_schema={
            "input_path": {
                "type": "string",
                "title": "Text / Document File",
                "description": "Path to .txt (or other plain-text) file to translate.",
                "default": "",
            },
            "target_lang": {
                "type": "string",
                "title": "Target Language",
                "enum": [
                    "English",
                    "Korean",
                    "Japanese",
                    "Spanish",
                    "French",
                    "German",
                    "Chinese",
                    "Hindi",
                    "Portuguese",
                    "Italian",
                    "Arabic",
                    "Russian",
                ],
                "default": "English",
                "description": "Language to translate the document into.",
            },
            "source_lang": {
                "type": "string",
                "title": "Source Language",
                "enum": [
                    "auto",
                    "Korean",
                    "Japanese",
                    "Chinese",
                    "Spanish",
                    "French",
                    "German",
                    "Hindi",
                    "English",
                ],
                "default": "auto",
                "description": "Original language of the document (auto-detected if 'auto').",
            },
            "provider": {
                "type": "string",
                "title": "AI Translation Provider",
                "enum": ["auto", "groq", "nvidia", "deepseek", "openai", "gemini", "anthropic"],
                "enumLabels": {
                    "auto": "⚡ Auto (Fastest Available: Groq ➔ NVIDIA ➔ OpenAI)",
                    "groq": "Groq (Llama 3.3 70B - Ultra Fast Translation)",
                    "nvidia": "NVIDIA NIM (Llama 3.1 70B / Nemotron)",
                    "deepseek": "DeepSeek (DeepSeek-V3 Chat)",
                    "openai": "OpenAI (GPT-4o-mini / GPT-4o)",
                    "gemini": "Google Gemini (Gemini 2.0 Flash)",
                    "anthropic": "Anthropic (Claude 3.5 Haiku)",
                },
                "default": "auto",
            },
            "model": {
                "type": "string",
                "title": "Model Name Override",
                "default": "auto",
                "description": "Specific LLM model override (or leave 'auto' for optimal default).",
            },
        },
    )

    async def execute(self, context: ToolRunContext) -> ToolResult:
        input_path = context.params.get("input_path")
        input_paths = context.params.get("input_paths") or []
        if input_path:
            input_paths = [input_path] + [p for p in input_paths if p != input_path]
        if not input_paths:
            return ToolResult(artifacts=[], status="failed", error="input_path is required (select a .txt file)")

        target_lang = context.params.get("target_lang", "English").strip() or "English"
        source_lang = context.params.get("source_lang", "auto").strip() or "auto"
        provider = context.params.get("provider", "auto")
        model = context.params.get("model", "auto")

        dest = Path(context.destination) if getattr(context, "destination", None) else (tool_downloads_dir("text.translate.llm") if context.kind == "standalone" else run_dir(context.workspace_id or "tmp", context.run_id or "tmp"))
        dest.mkdir(parents=True, exist_ok=True)

        bashrc_keys = _scan_bashrc_keys()
        resolved_provider, resolved_key, chosen_model = self._resolve_llm(provider, model, bashrc_keys)

        if not resolved_key:
            return ToolResult(
                artifacts=[],
                status="failed",
                error="No active AI API key found. Save a provider key in Settings or export GROQ_API_KEY, NVIDIA_API_KEY, or OPENAI_API_KEY in ~/.bashrc.",
            )

        artifacts: list[Artifact] = []
        lang_code = LANG_CODE_MAP.get(target_lang.lower(), target_lang[:2].lower())

        for p in input_paths:
            resolved = resolve_input_file(p)
            if not resolved or not resolved.exists():
                return ToolResult(artifacts=artifacts, status="failed", error=f"input file not found: {p}")
            src = resolved

            text_content = src.read_text(encoding="utf-8", errors="replace")
            translated_text = await self._translate_plain_text(
                text=text_content,
                target_lang=target_lang,
                source_lang=source_lang,
                provider=resolved_provider,
                key=resolved_key,
                model=chosen_model,
            )
            stem = src.stem
            out_doc = dest / f"{stem}_{lang_code}.txt"
            out_doc.write_text(translated_text, encoding="utf-8")
            artifacts.append(Artifact(path=str(out_doc), kind=PortKind.text, name=out_doc.name))

        return ToolResult(
            artifacts=artifacts,
            status="completed",
            data={
                "target_lang": target_lang,
                "provider": resolved_provider,
                "model": chosen_model,
                "artifacts_count": len(artifacts),
            },
        )

    def _resolve_llm(
        self,
        provider: str,
        model: str,
        bashrc_keys: dict[str, tuple[str, str]],
    ) -> tuple[str, str, str]:
        """Resolves the best provider, API key, and model for translation."""
        def get_key(provider_id: str, var_names: list[str]) -> str:
            saved_key = (get_saved_key(provider_id) or "").strip()
            if saved_key:
                return saved_key
            for v in var_names:
                key = os.environ.get(v, "").strip()
                if key:
                    return key
            for v in var_names:
                if v in bashrc_keys and bashrc_keys[v][0].strip():
                    return bashrc_keys[v][0].strip()
            return ""

        if provider == "auto":
            groq_key = get_key("groq", ["GROQ_API_KEY"])
            if groq_key:
                return "groq", groq_key, "qwen/qwen3.8-27b" if model == "auto" else model

            nvidia_key = get_key("nvidia", ["NVIDIA_API_KEY", "NVAPI_KEY"])
            if nvidia_key:
                return "nvidia", nvidia_key, "nvidia/llama-3.1-nemotron-70b-instruct" if model == "auto" else model

            openai_key = get_key("openai", ["OPENAI_API_KEY"])
            if openai_key:
                return "openai", openai_key, "gpt-4o-mini" if model == "auto" else model

            deepseek_key = get_key("deepseek", ["DEEPSEEK_API_KEY"])
            if deepseek_key:
                return "deepseek", deepseek_key, "deepseek-chat" if model == "auto" else model

            return "none", "", ""

        BEST_MODELS = {
            "groq": "qwen/qwen3.8-27b",
            "nvidia": "nvidia/llama-3.1-nemotron-70b-instruct",
            "openai": "gpt-4o-mini",
            "deepseek": "deepseek-chat",
            "gemini": "gemini-2.0-flash",
            "anthropic": "claude-3-5-haiku-20241022",
        }

        spec = PROVIDER_SPECS.get(provider, {})
        key = get_key(provider, spec.get("env_vars", [f"{provider.upper()}_API_KEY"]))
        default_model = BEST_MODELS.get(provider) or (spec.get("default_models", [""])[0] if spec.get("default_models") else "default")
        chosen_model = default_model if model == "auto" else model
        return provider, key, chosen_model

    async def _translate_plain_text(
        self,
        text: str,
        target_lang: str,
        source_lang: str,
        provider: str,
        key: str,
        model: str,
    ) -> str:
        """Translates plain text document content."""
        lang_hint = f"from {source_lang} " if source_lang != "auto" else ""
        system_prompt = (
            f"You are a master document translator. Translate the following text {lang_hint}into fluent, accurate {target_lang}.\n"
            "Preserve markdown headings, bullet points, and paragraph structure. Return only the translated text."
        )
        return await self._call_llm_chat(provider, key, model, system_prompt, text)

    async def _call_llm_chat(
        self,
        provider: str,
        key: str,
        model: str,
        system_prompt: str,
        user_prompt: str,
        timeout: float = 120.0,
    ) -> str:
        """Performs an asynchronous chat completion request to the resolved provider."""
        spec = PROVIDER_SPECS.get(provider, {})
        endpoint = spec.get("endpoint", "")

        if provider == "groq":
            endpoint = "https://api.groq.com/openai/v1/chat/completions"
        elif provider == "nvidia":
            endpoint = "https://integrate.api.nvidia.com/v1/chat/completions"
        elif provider == "openai":
            endpoint = "https://api.openai.com/v1/chat/completions"
        elif provider == "deepseek":
            endpoint = "https://api.deepseek.com/chat/completions"

        headers = {
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.2,
        }

        last_err = None
        for attempt in range(4):
            try:
                async with httpx.AsyncClient(timeout=timeout) as client:
                    resp = await client.post(endpoint, headers=headers, json=payload)
                    if resp.status_code == 429 and attempt < 3:
                        retry_after_hdr = resp.headers.get("retry-after")
                        try:
                            wait_s = float(retry_after_hdr) if retry_after_hdr else (2.5 * (attempt + 1))
                        except ValueError:
                            wait_s = 2.5 * (attempt + 1)
                        await asyncio.sleep(min(wait_s, 10.0))
                        continue
                    resp.raise_for_status()
                    data = resp.json()
                    return data["choices"][0]["message"]["content"].strip()
            except (httpx.HTTPStatusError, httpx.RequestError) as e:
                last_err = e
                if isinstance(e, httpx.HTTPStatusError) and e.response.status_code == 429 and attempt < 3:
                    await asyncio.sleep(2.5 * (attempt + 1))
                    continue
                if attempt == 3:
                    raise
        if last_err:
            raise last_err
        raise RuntimeError("Failed to obtain LLM chat response")
