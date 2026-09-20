from __future__ import annotations

import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any, Literal
import httpx


def _sanitize_api_filename(p: Path) -> str:
    """Return ASCII-safe filename for Groq/NVIDIA multipart upload.
    Preserves sanitized stem (or fallback) and forces .wav since asr_input is always 16k mono wav.
    Strategy B: no unidecode dep — chunk_*.wav preserved, Korean → fallback 'audio'.
    """
    stem = p.stem
    # Preserve chunk_*.wav pattern exactly
    if stem.startswith("chunk_") and p.suffix.lower() == ".wav":
        return p.name
    # Sanitize: keep ASCII alnum, -, _, replace others (including Korean) with _
    safe_stem = "".join(c if c.isascii() and c.isalnum() or c in "-_" else "_" for c in stem)
    safe_stem = re.sub(r"_+", "_", safe_stem).strip("_")[:48] or "audio"
    # asr_input is always wav (see downloader.py:859-868), so force .wav
    return f"{safe_stem}.wav"


def format_srt_timestamp(seconds: float) -> str:
    """Format seconds into SRT timestamp: 00:00:00,000"""
    ms = max(0, int(round(seconds * 1000)))
    h, rem = divmod(ms, 3600000)
    m, rem = divmod(rem, 60000)
    s, ms = divmod(rem, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def format_vtt_timestamp(seconds: float) -> str:
    """Format seconds into WebVTT timestamp: 00:00:00.000"""
    ms = max(0, int(round(seconds * 1000)))
    h, rem = divmod(ms, 3600000)
    m, rem = divmod(rem, 60000)
    s, ms = divmod(rem, 1000)
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"


def segment_text_to_lines(text: str, max_chars_per_line: int = 42, max_lines: int = 2) -> list[str]:
    """Break text into lines adhering to broadcast CPL (Characters Per Line) constraints."""
    words = text.split()
    if not words:
        return []

    lines: list[str] = []
    current_line: list[str] = []
    current_len = 0

    for word in words:
        added_len = len(word) + (1 if current_line else 0)
        if current_len + added_len <= max_chars_per_line:
            current_line.append(word)
            current_len += added_len
        else:
            if current_line:
                lines.append(" ".join(current_line))
            current_line = [word]
            current_len = len(word)

    if current_line:
        lines.append(" ".join(current_line))

    return lines[:max_lines] if len(lines) <= max_lines else lines


def build_smart_subtitles(
    raw_segments: list[dict[str, Any]],
    style: Literal["broadcast", "compact", "raw"] = "broadcast",
    min_duration: float = 1.0,
    max_duration: float = 6.0,
) -> tuple[str, str, str, str]:
    """Processes ASR transcription segments into:
    1. srt_content: SubRip format (.srt) with 37-42 char lines and natural breaks.
    2. vtt_content: WebVTT format (.vtt).
    3. clean_text: Clean paragraphs without timestamps for reading or summarizing.
    4. timestamped_text: Transcript with [HH:MM:SS] headers.
    """
    max_cpl = 30 if style == "compact" else 42
    max_lines = 1 if style == "compact" else 2

    srt_blocks: list[str] = []
    vtt_blocks: list[str] = ["WEBVTT\n"]
    clean_paragraphs: list[str] = []
    timestamped_lines: list[str] = []

    block_index = 1
    current_paragraph: list[str] = []

    for seg in raw_segments:
        text = str(seg.get("text", "")).strip()
        if not text:
            continue

        start = float(seg.get("start", 0.0))
        end = float(seg.get("end", start + 1.0))

        duration = end - start
        if duration < min_duration:
            end = start + min_duration

        current_paragraph.append(text)
        time_tag = format_srt_timestamp(start).split(",")[0]
        timestamped_lines.append(f"[{time_tag}] {text}")

        if style == "raw":
            wrapped_text = text
        else:
            lines = segment_text_to_lines(text, max_chars_per_line=max_cpl, max_lines=max_lines)
            wrapped_text = "\n".join(lines)

        srt_start = format_srt_timestamp(start)
        srt_end = format_srt_timestamp(end)
        srt_blocks.append(f"{block_index}\n{srt_start} --> {srt_end}\n{wrapped_text}\n")

        vtt_start = format_vtt_timestamp(start)
        vtt_end = format_vtt_timestamp(end)
        vtt_blocks.append(f"{block_index}\n{vtt_start} --> {vtt_end}\n{wrapped_text}\n")

        block_index += 1

        if text.endswith((".", "!", "?")):
            clean_paragraphs.append(" ".join(current_paragraph))
            current_paragraph = []

    if current_paragraph:
        clean_paragraphs.append(" ".join(current_paragraph))

    srt_content = "\n".join(srt_blocks)
    vtt_content = "\n".join(vtt_blocks)
    clean_text = "\n\n".join(clean_paragraphs)
    timestamped_text = "\n".join(timestamped_lines)

    return srt_content, vtt_content, clean_text, timestamped_text


def get_audio_duration(file_path: Path) -> float:
    """Extract audio duration in seconds using ffprobe."""
    try:
        cmd = [
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", str(file_path)
        ]
        res = subprocess.run(cmd, capture_output=True, text=True, check=True)
        return float(res.stdout.strip())
    except Exception:
        return 0.0


def split_audio_into_chunks(file_path: Path, chunk_duration: float = 600.0) -> list[tuple[Path, float]]:
    """Splits audio into duration chunks if exceeding chunk_duration (10 min) or 24MB API limit."""
    duration = get_audio_duration(file_path)
    file_size = file_path.stat().st_size if file_path.exists() else 0

    if (duration > 0 and duration <= chunk_duration) and file_size < 24 * 1024 * 1024:
        return [(file_path, 0.0)]

    chunks_dir = file_path.parent / f"{file_path.stem}_chunks"
    chunks_dir.mkdir(parents=True, exist_ok=True)
    pattern = str(chunks_dir / "chunk_%03d.wav")

    cmd = [
        "ffmpeg", "-y", "-i", str(file_path),
        "-f", "segment", "-segment_time", str(int(chunk_duration)),
        "-reset_timestamps", "1",
        "-ar", "16000", "-ac", "1",
        pattern
    ]
    try:
        subprocess.run(cmd, capture_output=True, check=True)
        sorted_chunks = sorted(chunks_dir.glob("chunk_*.wav"))
        if not sorted_chunks:
            return [(file_path, 0.0)]

        result: list[tuple[Path, float]] = []
        accumulated_offset = 0.0
        for cp in sorted_chunks:
            c_dur = get_audio_duration(cp)
            result.append((cp, accumulated_offset))
            accumulated_offset += c_dur if c_dur > 0 else chunk_duration
        return result
    except Exception:
        return [(file_path, 0.0)]


async def transcribe_with_nvidia(
    file_path: Path,
    api_key: str,
    model: str = "openai/whisper-large-v3",
    task: str = "transcribe",
    timeout: float = 180.0,
) -> list[dict[str, Any]]:
    """Transcribe or translate audio using NVIDIA NIM Whisper endpoint."""
    url = "https://integrate.api.nvidia.com/v1/audio/transcriptions"
    headers = {"Authorization": f"Bearer {api_key}"}

    async with httpx.AsyncClient(timeout=timeout) as client:
        with open(file_path, "rb") as f:
            safe_name = _sanitize_api_filename(file_path)
            files = {"file": (safe_name, f, "audio/wav")}
            data = {
                "model": model,
                "response_format": "verbose_json",
                "temperature": 0.0,
            }
            if task == "translate":
                data["task"] = "translate"
            resp = await client.post(url, headers=headers, files=files, data=data)
            if resp.status_code >= 400:
                body = resp.text[:800]
                raise RuntimeError(f"NVIDIA {resp.status_code} {body}")
            res_data = resp.json()

    segments = []
    if "segments" in res_data:
        for s in res_data["segments"]:
            segments.append({
                "start": float(s.get("start", 0.0)),
                "end": float(s.get("end", 0.0)),
                "text": s.get("text", "").strip(),
            })
    elif "text" in res_data:
        segments.append({"start": 0.0, "end": 5.0, "text": res_data["text"].strip()})

    return segments


async def transcribe_with_groq(
    file_path: Path,
    api_key: str,
    model: str = "whisper-large-v3-turbo",
    task: str = "transcribe",
    timeout: float = 120.0,
) -> list[dict[str, Any]]:
    """Transcribe or translate audio using Groq Whisper endpoint."""
    endpoint = "translations" if task == "translate" else "transcriptions"
    url = f"https://api.groq.com/openai/v1/audio/{endpoint}"
    headers = {"Authorization": f"Bearer {api_key}"}

    async with httpx.AsyncClient(timeout=timeout) as client:
        with open(file_path, "rb") as f:
            safe_name = _sanitize_api_filename(file_path)
            files = {"file": (safe_name, f, "audio/wav")}
            data = {
                "model": model,
                "response_format": "verbose_json",
                "temperature": 0.0,
            }
            resp = await client.post(url, headers=headers, files=files, data=data)
            if resp.status_code >= 400:
                body = resp.text[:800]
                raise RuntimeError(f"Groq {resp.status_code} {body}")
            res_data = resp.json()

    segments = []
    if "segments" in res_data:
        for s in res_data["segments"]:
            segments.append({
                "start": float(s.get("start", 0.0)),
                "end": float(s.get("end", 0.0)),
                "text": s.get("text", "").strip(),
            })
    elif "text" in res_data:
        segments.append({"start": 0.0, "end": 5.0, "text": res_data["text"].strip()})

    return segments
