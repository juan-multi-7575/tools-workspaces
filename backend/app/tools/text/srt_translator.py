from __future__ import annotations

import asyncio
import re
from dataclasses import dataclass
from pathlib import Path

from app.paths import resolve_input_file, run_dir, tool_downloads_dir
from app.tools.base import Artifact, PortKind, ToolManifest, ToolResult, ToolRunContext
from app.tools.model_health_tool import _scan_bashrc_keys
from app.tools.text.llm_translator import LANG_CODE_MAP, LlmTranslatorTool


@dataclass
class SubtitleCue:
    index: int
    timing: str
    text: str


def parse_srt_content(content: str) -> list[SubtitleCue]:
    """Parse SubRip (.srt) content into SubtitleCue objects."""
    cues: list[SubtitleCue] = []
    normalized = content.replace("\r\n", "\n").replace("\r", "\n").strip()
    if not normalized:
        return cues

    blocks = re.split(r"\n\s*\n", normalized)
    for block in blocks:
        lines = [line.strip() for line in block.split("\n") if line.strip()]
        if len(lines) < 2:
            continue
        try:
            cue_idx = int(lines[0])
            timing_line = lines[1]
            text_lines = lines[2:]
        except ValueError:
            if "-->" in lines[0]:
                cue_idx = len(cues) + 1
                timing_line = lines[0]
                text_lines = lines[1:]
            else:
                continue

        if "-->" not in timing_line:
            continue

        cues.append(
            SubtitleCue(
                index=cue_idx,
                timing=timing_line,
                text=" ".join(text_lines),
            )
        )
    return cues


def parse_vtt_content(content: str) -> list[SubtitleCue]:
    """Parse WebVTT (.vtt) content into SubtitleCue objects."""
    normalized = content.replace("\r\n", "\n").replace("\r", "\n").strip()
    if not normalized:
        return []

    lines = normalized.split("\n")
    body_lines: list[str] = []
    in_note = False
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("WEBVTT"):
            continue
        if stripped.startswith("NOTE"):
            in_note = True
            continue
        if in_note:
            if not stripped:
                in_note = False
            continue
        body_lines.append(line)

    body = "\n".join(body_lines).strip()
    blocks = re.split(r"\n\s*\n", body)
    cues: list[SubtitleCue] = []

    for block in blocks:
        block_lines = [b.strip() for b in block.split("\n") if b.strip()]
        if not block_lines:
            continue

        cue_idx = len(cues) + 1
        timing_line = ""
        text_lines: list[str] = []

        if "-->" in block_lines[0]:
            timing_line = block_lines[0]
            text_lines = block_lines[1:]
        elif len(block_lines) > 1 and "-->" in block_lines[1]:
            try:
                cue_idx = int(block_lines[0])
            except ValueError:
                cue_idx = len(cues) + 1
            timing_line = block_lines[1]
            text_lines = block_lines[2:]

        if not timing_line or "-->" not in timing_line:
            continue

        cues.append(
            SubtitleCue(
                index=cue_idx,
                timing=timing_line,
                text=" ".join(text_lines),
            )
        )
    return cues


def format_cues_to_srt(cues: list[SubtitleCue]) -> str:
    """Reconstruct an .srt formatted string from cues."""
    blocks = []
    for i, cue in enumerate(cues, start=1):
        timing = cue.timing.replace(".", ",")
        blocks.append(f"{i}\n{timing}\n{cue.text}\n")
    return "\n".join(blocks).strip() + "\n"


def format_cues_to_vtt(cues: list[SubtitleCue]) -> str:
    """Reconstruct a WebVTT formatted string from cues."""
    blocks = ["WEBVTT\n"]
    for i, cue in enumerate(cues, start=1):
        timing = cue.timing.replace(",", ".")
        blocks.append(f"{i}\n{timing}\n{cue.text}\n")
    return "\n".join(blocks).strip() + "\n"


class SrtTranslatorTool(LlmTranslatorTool):
    manifest = ToolManifest(
        id="subtitle.translate.srt",
        name="SRT Subtitle Translator",
        description="Translate subtitle files (.srt, .vtt) into English or other languages using LLMs (Groq, NVIDIA, DeepSeek, OpenAI) while strictly preserving timestamps and line sequencing.",
        category="AI & Tutoring",
        tags=["subtitles", "translation", "srt", "vtt", "translator", "ai", "llm", "korean", "english"],
        input_kinds=[PortKind.document, PortKind.any],
        output_kinds=[PortKind.document, PortKind.text],
        parameters_schema={
            "input_path": {
                "type": "string",
                "title": "Subtitle File",
                "description": "Path to .srt or .vtt file to translate.",
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
                "description": "Language to translate the subtitles into.",
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
                "description": "Original language of the subtitles (auto-detected if 'auto').",
            },
            "provider": {
                "type": "string",
                "title": "AI Translation Provider",
                "enum": ["auto", "groq", "nvidia", "deepseek", "openai", "gemini", "anthropic"],
                "enumLabels": {
                    "auto": "⚡ Auto (Fastest Available: Groq ➔ NVIDIA ➔ OpenAI)",
                    "groq": "Groq (Llama 3.3 70B - Ultra Fast Subtitle Translation)",
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
            "batch_size": {
                "type": "number",
                "title": "Subtitle Batch Size",
                "default": 50,
                "description": "Number of subtitle cues to translate per batch (recommended 40-60).",
            },
        },
    )

    async def execute(self, context: ToolRunContext) -> ToolResult:
        input_path = context.params.get("input_path")
        input_paths = context.params.get("input_paths") or []
        if input_path:
            input_paths = [input_path] + [p for p in input_paths if p != input_path]
        if not input_paths:
            return ToolResult(artifacts=[], status="failed", error="input_path is required (select a .srt or .vtt file)")

        target_lang = context.params.get("target_lang", "English").strip() or "English"
        source_lang = context.params.get("source_lang", "auto").strip() or "auto"
        provider = context.params.get("provider", "auto")
        model = context.params.get("model", "auto")
        try:
            batch_size = max(10, min(150, int(context.params.get("batch_size", 50))))
        except (TypeError, ValueError):
            batch_size = 50

        dest = Path(context.destination) if getattr(context, "destination", None) else (tool_downloads_dir("subtitle.translate.srt") if context.kind == "standalone" else run_dir(context.workspace_id or "tmp", context.run_id or "tmp"))
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
                    return ToolResult(
                        artifacts=artifacts,
                        status="failed",
                        error=f"unsupported input type: {src.name} (subtitle.translate.srt expects .srt/.vtt subtitle files with timed cues)",
                    )
            else:
                return ToolResult(
                    artifacts=artifacts,
                    status="failed",
                    error=f"unsupported input type: {src.name} (subtitle.translate.srt expects .srt/.vtt subtitle files; use text.translate.llm for plain text)",
                )

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

    async def _translate_cues(
        self,
        cues: list[SubtitleCue],
        target_lang: str,
        source_lang: str,
        provider: str,
        key: str,
        model: str,
        batch_size: int,
    ) -> list[SubtitleCue]:
        """Translate subtitle cues in batches preserving exact cue timing and IDs."""
        import logging
        logger = logging.getLogger("subtitle_translator")
        translated: list[SubtitleCue] = []

        for i in range(0, len(cues), batch_size):
            chunk = cues[i : i + batch_size]
            prompt_lines = [f"[{c.index}] {c.text}" for c in chunk]
            batch_input = "\n".join(prompt_lines)

            lang_hint = f"from {source_lang} " if source_lang != "auto" else ""
            system_prompt = (
                f"You are a professional audiovisual translator. Translate the following subtitles {lang_hint}into natural, fluent {target_lang}.\n"
                "CRITICAL RULES:\n"
                "1. Preserve the EXACT bracketed cue ID for each line (e.g. [1], [2]).\n"
                "2. Maintain natural spoken dialogue, brevity, and tone appropriate for on-screen subtitles.\n"
                "3. Do not combine, skip, or create cue IDs.\n"
                "4. Output ONLY the numbered cues in the format: '[id] <translated text>'. Do NOT include any intro, commentary, or markdown blocks."
            )

            try:
                response_text = await self._call_llm_chat(provider, key, model, system_prompt, batch_input)
                parsed_translations = self._parse_batch_response(response_text)

                for c in chunk:
                    new_text = parsed_translations.get(c.index, c.text)
                    translated.append(SubtitleCue(index=c.index, timing=c.timing, text=new_text))
            except Exception as e:
                logger.warning("Subtitle translation batch %d failed (%s): %s", i // batch_size + 1, type(e).__name__, e)
                for c in chunk:
                    translated.append(c)

            if i + batch_size < len(cues):
                await asyncio.sleep(1.2)

        return translated

    def _parse_batch_response(self, text: str) -> dict[int, str]:
        """Extracts {index: text} mappings from LLM response."""
        res: dict[int, str] = {}
        for line in text.split("\n"):
            line = line.strip()
            if not line:
                continue
            m = re.match(r"^(?:\[\s*(\d+)\s*\]|(\d+)[:\.\-\)])\s*(.+)$", line)
            if m:
                idx_str = m.group(1) or m.group(2)
                val = m.group(3).strip()
                try:
                    res[int(idx_str)] = val
                except ValueError:
                    pass
        return res
