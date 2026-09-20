from __future__ import annotations

from pathlib import Path

from app.paths import resolve_input_file, run_dir, tool_downloads_dir
from app.tools.base import Artifact, PortKind, ToolManifest, ToolResult, ToolRunContext
from app.tools.model_health_tool import _scan_bashrc_keys
from app.tools.text.llm_translator import LANG_CODE_MAP
from app.tools.text.srt_translator import (
    SrtTranslatorTool,
    SubtitleCue,
    format_cues_to_srt,
    format_cues_to_vtt,
    parse_srt_content,
    parse_vtt_content,
)

__all__ = [
    "SubtitleTranslatorTool",
    "SubtitleCue",
    "parse_srt_content",
    "parse_vtt_content",
    "format_cues_to_srt",
    "format_cues_to_vtt",
    "LANG_CODE_MAP",
]


class SubtitleTranslatorTool(SrtTranslatorTool):
    """Thin backwards-compatible facade over the split text tools.

    Canonical id is now ``subtitle.translate.srt`` (inherited); the legacy
    ``subtitle_translator`` id is registered as a dict-level alias in
    ``app.tools``. Combined SRT/VTT + plain-text behaviour is preserved here
    by delegating to :class:`SrtTranslatorTool` / :class:`LlmTranslatorTool`
    helpers; new code should use ``text.translate.llm`` or
    ``subtitle.translate.srt`` directly.
    """

    manifest = ToolManifest(
        id="subtitle.translate.srt",
        name="Subtitle & Document Translator (SRT / VTT / Text)",
        description="Translate subtitle files (.srt, .vtt) or text documents into English or other languages using LLMs (Groq, NVIDIA, DeepSeek, OpenAI) while strictly preserving timestamps and line sequencing.",
        category="AI & Tutoring",
        tags=["subtitles", "translation", "srt", "vtt", "translator", "ai", "llm", "korean", "english"],
        input_kinds=[PortKind.document, PortKind.text, PortKind.any],
        output_kinds=[PortKind.document, PortKind.text],
        parameters_schema=SrtTranslatorTool.manifest.parameters_schema,
    )

    async def execute(self, context: ToolRunContext) -> ToolResult:
        input_path = context.params.get("input_path")
        input_paths = context.params.get("input_paths") or []
        if input_path:
            input_paths = [input_path] + [p for p in input_paths if p != input_path]
        if not input_paths:
            return ToolResult(artifacts=[], status="failed", error="input_path is required (select a .srt, .vtt, or .txt file)")

        target_lang = context.params.get("target_lang", "English").strip() or "English"
        source_lang = context.params.get("source_lang", "auto").strip() or "auto"
        provider = context.params.get("provider", "auto")
        model = context.params.get("model", "auto")
        try:
            batch_size = max(10, min(150, int(context.params.get("batch_size", 50))))
        except (TypeError, ValueError):
            batch_size = 50

        dest = Path(context.destination) if getattr(context, "destination", None) else (tool_downloads_dir("subtitle_translator") if context.kind == "standalone" else run_dir(context.workspace_id or "tmp", context.run_id or "tmp"))
        dest.mkdir(parents=True, exist_ok=True)

        bashrc_keys = _scan_bashrc_keys()
        resolved_provider, resolved_key, chosen_model = self._resolve_llm(provider, model, bashrc_keys)

        if not resolved_key:
            return ToolResult(
                artifacts=[],
                status="failed",
                error="No active AI API key found. Please export GROQ_API_KEY, NVIDIA_API_KEY, or OPENAI_API_KEY in ~/.bashrc.",
            )

        artifacts: list[Artifact] = []
        lang_code = LANG_CODE_MAP.get(target_lang.lower(), target_lang[:2].lower())

        for p in input_paths:
            resolved = resolve_input_file(p)
            if not resolved or not resolved.exists():
                return ToolResult(artifacts=artifacts, status="failed", error=f"input file not found: {p}")
            src = resolved

            text_content = src.read_text(encoding="utf-8", errors="replace")
            is_srt = src.suffix.lower() == ".srt" or ("-->" in text_content and ("\n1\n" in text_content or text_content.startswith("1\n")))
            is_vtt = src.suffix.lower() == ".vtt" or "WEBVTT" in text_content

            cues = []
            if is_srt or is_vtt:
                cues = parse_srt_content(text_content) if is_srt else parse_vtt_content(text_content)
                if not cues:
                    is_srt = is_vtt = False

            if is_srt or is_vtt:
                translated_cues = await self._translate_cues(
                    cues=cues,
                    target_lang=target_lang,
                    source_lang=source_lang,
                    provider=resolved_provider,
                    key=resolved_key,
                    model=chosen_model,
                    batch_size=batch_size,
                )

                srt_out_content = format_cues_to_srt(translated_cues)
                vtt_out_content = format_cues_to_vtt(translated_cues)
                clean_lines = [c.text for c in translated_cues]
                clean_text = "\n\n".join(clean_lines)

                stem = src.stem
                for suffix in [".ko", ".ja", ".zh", ".es", ".fr", ".de", ".kr", ".en"]:
                    if stem.endswith(suffix):
                        stem = stem[: -len(suffix)]
                        break

                out_srt = dest / f"{stem}.{lang_code}.srt"
                out_vtt = dest / f"{stem}.{lang_code}.vtt"
                out_txt = dest / f"{stem}_{lang_code}_clean.txt"

                out_srt.write_text(srt_out_content, encoding="utf-8")
                out_vtt.write_text(vtt_out_content, encoding="utf-8")
                out_txt.write_text(clean_text, encoding="utf-8")

                artifacts.append(Artifact(path=str(out_srt), kind=PortKind.document, name=out_srt.name))
                artifacts.append(Artifact(path=str(out_vtt), kind=PortKind.document, name=out_vtt.name))
                artifacts.append(Artifact(path=str(out_txt), kind=PortKind.text, name=out_txt.name))

            else:
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
