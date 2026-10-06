import asyncio
import os
import re
import subprocess
import time
from collections import deque
from pathlib import Path
from typing import Any

from app.depmgr.environ import env_for
from app.paths import tool_downloads_dir, run_dir, resolve_input_file
from app.tools.base import Artifact, PortKind, Tool, ToolManifest, ToolRunContext, ToolResult

def _ytdlp_env() -> dict[str, str]:
    """yt-dlp is launched with plain subprocess (not AsyncSubprocessRunner) so the
    download loop can poll its own deadline. It still needs the app-owned deps root
    on PATH, otherwise a managed yt-dlp/ffmpeg is invisible to it.

    Computed per call, not at import: the deps root follows app.paths.ROOT, which
    tests relocate. os.environ itself is only read, never written.
    """
    return {**os.environ, **env_for("media.download.yt-dlp")}


def _safe_put(queue: Any, msg: dict, loop: asyncio.AbstractEventLoop | None = None) -> None:
    if queue is None:
        return
    if loop is not None and loop.is_running():
        try:
            loop.call_soon_threadsafe(queue.put_nowait, msg)
            return
        except Exception:
            pass
    try:
        queue.put_nowait(msg)
    except AttributeError:
        try:
            queue.put(msg)
        except Exception:
            pass
    except Exception:
        pass



FORMAT_PRESETS = {
    "best": "bestvideo+bestaudio/best",
    "4k": "bestvideo[height<=2160]+bestaudio/best[height<=2160]",
    "1440p": "bestvideo[height<=1440]+bestaudio/best[height<=1440]",
    "1080p": "bestvideo[height<=1080]+bestaudio/best[height<=1080]",
    "720p": "bestvideo[height<=720]+bestaudio/best[height<=720]",
    "480p": "bestvideo[height<=480]+bestaudio/best[height<=480]",
    "360p": "bestvideo[height<=360]+bestaudio/best[height<=360]",
    "audio": "bestaudio/best",
    "video_only_best": "bestvideo/best",
    "video_only_1080p": "bestvideo[height<=1080]/best[height<=1080]",
    "video_only_720p": "bestvideo[height<=720]/best[height<=720]",
    "video_only_480p": "bestvideo[height<=480]/best[height<=480]",
    "h264": "bestvideo[vcodec^=avc1]+bestaudio/best",
    "vp9": "bestvideo[vcodec^=vp9]+bestaudio/best",
    "av1": "bestvideo[vcodec^=av01]+bestaudio/best",
}

AUDIO_QUALITY = {
    "best": "0",
    "320": "320",
    "256": "256",
    "192": "192",
    "128": "128",
    "96": "96",
}

CLI_FLAG_MAP: dict[str, str] = {
    "outtmpl": "-o",
    "output_template": "-o",
    "format": "-f",
    "format_preset": "-f",
    "extractaudio": "-x",
    "extract_audio": "-x",
    "audioformat": "--audio-format",
    "audio_format": "--audio-format",
    "audioquality": "--audio-quality",
    "audio_quality": "--audio-quality",
    "writesubtitles": "--write-subs",
    "write_subtitles": "--write-subs",
    "writeautomaticsub": "--write-auto-subs",
    "write_auto_subs": "--write-auto-subs",
    "subtitleslangs": "--sub-langs",
    "sub_langs": "--sub-langs",
    "embed_subs": "--embed-subs",
    "embed_thumbnail": "--embed-thumbnail",
    "write_thumbnail": "--write-thumbnail",
    "embed_metadata": "--embed-metadata",
    "embed_chapters": "--embed-chapters",
    "playlist_items": "--playlist-items",
    "no_playlist": "--no-playlist",
    "max_downloads": "--max-downloads",
    "playlist_start": "--playlist-start",
    "playlist_end": "--playlist-end",
    "playlist_reverse": "--playlist-reverse",
    "merge_output_format": "--merge-output-format",
    "limit_rate": "--limit-rate",
    "concurrent_fragments": "--concurrent-fragments",
    "retries": "--retries",
    "socket_timeout": "--socket-timeout",
    "keep_video": "--keep-video",
    "restrict_filenames": "--restrict-filenames",
    "windows_filenames": "--windows-filenames",
    "force_overwrites": "--force-overwrites",
    "noprogress": "--no-progress",
    "newline": "--newline",
    "cookies_from_browser": "--cookies-from-browser",
    "cookies_file": "--cookies",
    "extractor_args": "--extractor-args",
    "user_agent": "--user-agent",
    "impersonate": "--impersonate",
}


def build_ydl_opts(params: dict, outtmpl: str) -> dict:
    opts: dict[str, Any] = {"outtmpl": outtmpl, "noprogress": False, "newline": True}
    mode = params.get("download_mode", "video_audio")

    if mode == "audio_only" or params.get("extract_audio"):
        opts["extractaudio"] = True
        opts["audioformat"] = params.get("audio_format", "best")
        aq = AUDIO_QUALITY.get(str(params.get("audio_quality", "best")), "0")
        opts["audioquality"] = aq
        preset = params.get("format_preset")
        if preset and preset in FORMAT_PRESETS:
            opts["format"] = FORMAT_PRESETS[preset]
        elif params.get("format"):
            opts["format"] = params["format"]
        else:
            opts["format"] = FORMAT_PRESETS["audio"]
    elif mode == "video_only":
        preset = params.get("format_preset", "best")
        if preset == "best":
            opts["format"] = "bestvideo/best"
        elif preset in ("4k", "1440p", "1080p", "720p", "480p", "360p"):
            res = preset.replace("4k", "2160").replace("1440p", "1440").replace("p", "")
            opts["format"] = f"bestvideo[height<={res}]/best[height<={res}]"
        elif preset in FORMAT_PRESETS:
            opts["format"] = FORMAT_PRESETS[preset]
        elif params.get("format"):
            opts["format"] = params["format"]
    else:
        preset = params.get("format_preset") or "best"
        if preset and preset in FORMAT_PRESETS:
            opts["format"] = FORMAT_PRESETS[preset]
        elif params.get("format"):
            opts["format"] = params["format"]
        else:
            opts["format"] = FORMAT_PRESETS["best"]

    if params.get("keep_video"):
        opts["keep_video"] = True

    if params.get("writesubtitles"):
        opts["writesubtitles"] = True
        if params.get("subtitleslangs"):
            opts["subtitleslangs"] = params["subtitleslangs"]

    if params.get("writeautomaticsub"):
        opts["writeautomaticsub"] = True

    if params.get("embed_subs"):
        opts["embed_subs"] = True

    if params.get("embed_thumbnail"):
        opts["embed_thumbnail"] = True

    if params.get("write_thumbnail"):
        opts["write_thumbnail"] = True

    if params.get("embed_metadata"):
        opts["embed_metadata"] = True

    if params.get("embed_chapters"):
        opts["embed_chapters"] = True

    if params.get("playlist_items"):
        opts["playlist_items"] = str(params["playlist_items"])

    if params.get("no_playlist"):
        opts["no_playlist"] = True

    if params.get("max_downloads"):
        opts["max_downloads"] = str(params["max_downloads"])

    if params.get("playlist_start"):
        opts["playlist_start"] = str(params["playlist_start"])

    if params.get("playlist_end"):
        opts["playlist_end"] = str(params["playlist_end"])

    if params.get("playlist_reverse"):
        opts["playlist_reverse"] = True

    if params.get("merge_output_format"):
        opts["merge_output_format"] = params["merge_output_format"]
    elif mode == "video_audio":
        opts["merge_output_format"] = "mp4"

    if params.get("limit_rate"):
        opts["limit_rate"] = params["limit_rate"]

    if params.get("concurrent_fragments"):
        opts["concurrent_fragments"] = str(params["concurrent_fragments"])

    if params.get("retries"):
        opts["retries"] = str(params["retries"])

    if params.get("socket_timeout"):
        opts["socket_timeout"] = str(params["socket_timeout"])

    if params.get("restrict_filenames"):
        opts["restrict_filenames"] = True

    if params.get("windows_filenames"):
        opts["windows_filenames"] = True

    if params.get("force_overwrites"):
        opts["force_overwrites"] = True

    if params.get("output_template"):
        opts["outtmpl"] = params["output_template"]

    # Global and per-download anti-403 settings
    ytdlp_settings = {}
    try:
        from app.settings_store import load_settings
        ytdlp_settings = load_settings().get("ytdlp", {})
    except Exception:
        pass

    cookies_browser = params.get("cookies_from_browser") or ytdlp_settings.get("cookies_from_browser")
    if cookies_browser and cookies_browser != "none":
        opts["cookies_from_browser"] = cookies_browser

    cookies_file = params.get("cookies_file") or ytdlp_settings.get("cookies_file_path")
    if cookies_file:
        opts["cookies_file"] = cookies_file

    extractor_args = params.get("extractor_args") or ytdlp_settings.get("extractor_args")
    if extractor_args and str(extractor_args).strip():
        opts["extractor_args"] = str(extractor_args).strip()

    user_agent = params.get("user_agent") or ytdlp_settings.get("user_agent")
    if user_agent:
        opts["user_agent"] = user_agent

    if params.get("impersonate"):
        opts["impersonate"] = params["impersonate"]

    return opts


def resolve_media_url(url: str, timeout: float = 30.0) -> dict[str, Any]:
    """Lightweight pre-run URL check: dump single-video metadata without downloading.

    Returns {"ok": True, title, duration_seconds, uploader, extractor, thumbnail}
    or {"ok": False, "error": ...}. Never raises.
    """
    from urllib.parse import urlparse

    try:
        parts = urlparse((url or '').strip())
    except Exception:
        return {"ok": False, "error": "Malformed URL."}
    if parts.scheme not in ("http", "https") or not parts.netloc:
        return {"ok": False, "error": "URL must start with http:// or https://."}
    cmd = [
        "yt-dlp",
        "--dump-single-json",
        "--no-download",
        "--skip-download",
        "--no-playlist",
        "--no-warnings",
        "--socket-timeout",
        "10",
        (url or '').strip(),
    ]
    try:
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=timeout, env=_ytdlp_env())
    except FileNotFoundError:
        return {"ok": False, "error": "yt-dlp is not installed on the server.", "error_code": "DEPENDENCY_UNAVAILABLE"}
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": f"Timed out after {timeout:.0f}s waiting for metadata.", "error_code": "PREVIEW_UNAVAILABLE"}
    except Exception as exc:
        from app.errors import unexpected_error
        unexpected_error(exc)
        return {"ok": False, "error": "Metadata lookup is currently unavailable.", "error_code": "PREVIEW_UNAVAILABLE"}
    if proc.returncode != 0:
        err = (proc.stderr or '').strip().splitlines()
        msg = err[-1].strip() if err else f"yt-dlp exited with code {proc.returncode}."
        # Trim the common "ERROR: " prefix for display
        if msg.startswith("ERROR: "):
            msg = msg[len("ERROR: "):]
        return {"ok": False, "error": msg[:300]}
    try:
        import json as _json

        info = _json.loads(proc.stdout or '{}')
    except Exception:
        return {"ok": False, "error": "Could not parse video metadata."}
    thumbs = info.get("thumbnails") or []
    thumb = thumbs[-1].get("url") if thumbs and isinstance(thumbs[-1], dict) else None
    return {
        "ok": True,
        "title": info.get("title") or "Untitled",
        "duration_seconds": info.get("duration"),
        "uploader": info.get("uploader") or info.get("channel"),
        "extractor": info.get("extractor"),
        "thumbnail": thumb,
        "is_live": bool(info.get("is_live")),
    }


def _to_cli(ydl_opts: dict) -> list[str]:
    cmd = ["yt-dlp"]
    for key, value in ydl_opts.items():
        flag = CLI_FLAG_MAP.get(key, f"--{key.replace('_', '-')}")
        if isinstance(value, bool):
            if value:
                cmd.append(flag)
        elif isinstance(value, list):
            cmd.extend([flag, ",".join(str(v) for v in value)])
        elif value is not None and value != "":
            cmd.extend([flag, str(value)])
    return cmd


_RAW_ARGS_ALLOWLIST = frozenset({
    "--no-mtime",
    "--geo-bypass",
    "--no-check-certificates",
    "--ignore-errors",
    "--no-warnings",
    "--newline",
    "--progress",
    "--encoding",
    "--playlist-random",
    "--break-per-input",
    "--output-na-placeholder",
    "--trim-filenames",
    "--embed-thumbnail",
    "--cookies-from-browser",
    "--cookies",
    "--extractor-args",
    "--user-agent",
    "--impersonate",
})

_RAW_ARGS_VALUE_FLAGS = frozenset({
    "--encoding",
    "--output-na-placeholder",
    "--trim-filenames",
    "--cookies-from-browser",
    "--cookies",
    "--extractor-args",
    "--user-agent",
    "--impersonate",
})


def validate_raw_args(raw: str) -> tuple[bool, str]:
    if any(ch in raw for ch in (";", "|", "&", "$", "`", "<", ">", "\n", "\r")):
        return False, "raw args contain shell metacharacters"
    tokens = raw.split()
    i = 0
    while i < len(tokens):
        token = tokens[i]
        if token.startswith("--"):
            if "=" in token:
                parts = token.split("=", 1)
                flag = parts[0]
                if flag not in _RAW_ARGS_ALLOWLIST or flag not in _RAW_ARGS_VALUE_FLAGS:
                    return False, f"unsupported raw flag: {token}"
            else:
                if token not in _RAW_ARGS_ALLOWLIST:
                    return False, f"unsupported raw flag: {token}"
                if token in _RAW_ARGS_VALUE_FLAGS:
                    if i + 1 >= len(tokens) or tokens[i + 1].startswith("--"):
                        return False, f"unsupported raw flag: {token}"
                    i += 2
                    continue
        else:
            return False, f"unsupported raw flag: {token}"
        i += 1
    return True, ""


def split_raw_args(raw: str) -> list[str]:
    return raw.split()


class YdlCancelledError(RuntimeError):
    """Raised when a download is cancelled by the user (subclass of RuntimeError)."""


def execute_ydl(
    url: str,
    params: dict,
    outdir: Path,
    progress_queue: Any = None,
    cancel_event: Any = None,
    timeout: float | None = 3600,
    loop: asyncio.AbstractEventLoop | None = None,
) -> list[Path]:
    outtmpl = str(outdir / "%(title)s.%(ext)s")
    ydl_opts = build_ydl_opts(params, outtmpl)
    cmd = _to_cli(ydl_opts)
    cmd += [
        "--progress-template",
        "download:[download] __YTDLP_PROGRESS__ %(progress._percent_str)s of %(progress.downloaded_bytes)s/%(progress.total_bytes)s at %(progress._speed_str)s ETA %(progress._eta_str)s",
    ]
    raw = params.get("raw_args")
    if raw:
        ok, err = validate_raw_args(raw)
        if not ok:
            raise ValueError(err)
        cmd += split_raw_args(raw)
    cmd += [url]
    produced: list[Path] = []
    deadline = time.monotonic() + timeout if timeout else None
    error_lines: deque[str] = deque(maxlen=10)

    existing_files = {p.resolve(): p.stat().st_mtime for p in outdir.iterdir() if p.is_file()}
    start_time = time.time()

    downloaded_targets: list[Path] = []

    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=_ytdlp_env())
    try:
        assert proc.stdout is not None
        for line in proc.stdout:
            if deadline is not None and time.monotonic() > deadline:
                proc.terminate()
                raise RuntimeError(f"yt-dlp timed out after {timeout:.0f}s")
            if cancel_event is not None and getattr(cancel_event, "is_set", lambda: False)():
                proc.terminate()
                raise YdlCancelledError("cancelled")
            msg = _parse_progress(line)
            if msg is not None:
                _safe_put(progress_queue, msg, loop=loop)
            else:
                clean = line.strip()
                if clean:
                    error_lines.append(clean)
                    if "has already been downloaded" in clean:
                        target_str = clean.split("[download]")[-1].split("has already been downloaded")[0].strip()
                        p = Path(target_str)
                        if not p.is_absolute():
                            p = outdir / p.name
                        if p.exists() and p.is_file():
                            downloaded_targets.append(p)
                    elif "Merging formats into \"" in clean:
                        target_str = clean.split("Merging formats into \"")[-1].split("\"")[0].strip()
                        p = Path(target_str)
                        if not p.is_absolute():
                            p = outdir / p.name
                        if p.exists() and p.is_file():
                            downloaded_targets.append(p)
                    elif "Destination: " in clean:
                        target_str = clean.split("Destination: ")[-1].strip()
                        p = Path(target_str)
                        if not p.is_absolute():
                            p = outdir / p.name
                        if p.exists() and p.is_file():
                            downloaded_targets.append(p)
        proc.wait()
        if proc.returncode != 0:
            err_msg = "\n".join(error_lines)
            if err_msg:
                raise RuntimeError(f"yt-dlp exited with code {proc.returncode}: {err_msg}")
            raise RuntimeError(f"yt-dlp exited with code {proc.returncode}")
        produced = [
            p for p in outdir.iterdir()
            if p.is_file()
            and p.suffix not in (".part", ".ytd")
            and (p.resolve() not in existing_files or p.stat().st_mtime > existing_files[p.resolve()] or p.stat().st_mtime >= start_time - 1)
        ]
        if not produced and downloaded_targets:
            seen = set()
            valid_targets = []
            for t in downloaded_targets:
                if t.exists() and t.is_file() and t.resolve() not in seen and t.suffix not in (".part", ".ytd"):
                    seen.add(t.resolve())
                    valid_targets.append(t)
            if valid_targets:
                produced = valid_targets

        if not produced:
            candidates = [
                p for p in outdir.iterdir()
                if p.is_file() and p.suffix not in (".part", ".ytd") and p.stat().st_mtime >= start_time - 2
            ]
            if candidates:
                produced = candidates
            elif not existing_files:
                produced = [p for p in outdir.iterdir() if p.is_file() and p.suffix not in (".part", ".ytd")]
        _safe_put(progress_queue, {"status": "completed", "percent": 100}, loop=loop)
    except Exception:
        for p in outdir.iterdir():
            if p.suffix == ".part" or p.suffix == ".ytd":
                p.unlink(missing_ok=True)
        raise
    return produced


def _parse_progress(line: str) -> dict | None:
    line = line.strip()
    marker = "[download] __YTDLP_PROGRESS__ "
    if not line.startswith(marker):
        return None
    line = "[download] " + line[len(marker):]
    percent_match = re.match(
        r"\[download\]\s*([-+]?(?:\d+(?:\.\d*)?|\.\d+))%",
        line,
    )
    byte_match = re.match(
        r"\[download\]\s+(?:[-+]?(?:\d+(?:\.\d*)?|\.\d+)%|N/A%|NA)\s+of\s+(\d+)/(\d+|NA|None)\b",
        line,
        re.IGNORECASE,
    )
    if percent_match is None and byte_match is None:
        return None
    msg: dict[str, Any] = {"status": "downloading"}
    if percent_match is not None:
        msg["percent"] = float(percent_match.group(1))
    speed = _extract_field(line, " at ", "ETA")
    eta = _extract_field(line, "ETA ", None)
    if speed is not None:
        msg["speed"] = speed
    if eta is not None:
        msg["eta"] = eta
    if byte_match is not None:
        msg["downloaded_bytes"] = int(byte_match.group(1))
        if byte_match.group(2).isdigit():
            msg["total_bytes"] = int(byte_match.group(2))
    return msg


def _extract_field(line: str, start: str, end: str | None) -> str | None:
    if start not in line:
        return None
    rest = line.split(start, 1)[1]
    if end and end in rest:
        rest = rest.split(end)[0]
    return rest.strip() or None


def _escape_ffmpeg_subtitle(p: str) -> str:
    return p.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")


def _escape_ffmpeg_path(p: str) -> str:
    return _escape_ffmpeg_subtitle(p)


class DownloaderTool(Tool):
    manifest = ToolManifest(
        id="media.download.yt-dlp",
        name="Video & Media Downloader (YouTube / yt-dlp)",
        description="High-performance media downloader supporting YouTube, Soundcloud, Vimeo, and 1000+ sites via yt-dlp.",
        category="Media",
        tags=["media", "youtube", "video", "audio", "downloader", "ytdlp"],
        input_kinds=[PortKind.any],
        output_kinds=[PortKind.video, PortKind.audio, PortKind.any],
        parameters_schema={
            "url": {
                "type": "string",
                "title": "Media / Video URL",
                "description": "Direct URL of the video, playlist, stream, or audio to download (YouTube, Soundcloud, Vimeo, Twitch, etc.)",
                "placeholder": "https://www.youtube.com/watch?v=... or playlist URL",
            },
            "download_mode": {
                "type": "string",
                "title": "Download Mode",
                "enum": ["video_audio", "audio_only", "video_only"],
                "enumLabels": {
                    "video_audio": "🎬 Video + Audio (Default/Full Video)",
                    "audio_only": "🎵 Audio Only (Extract MP3/WAV/FLAC)",
                    "video_only": "📹 Video Only (No Audio Track)",
                },
                "default": "video_audio",
                "description": "Select whether to download complete video, extract audio only, or video only.",
            },
            "format_preset": {
                "type": "string",
                "title": "Resolution / Format Preset",
                "enum": ["best", "4k", "1440p", "1080p", "720p", "480p", "360p", "audio", "h264", "vp9", "av1"],
                "enumLabels": {
                    "best": "Best Available (Highest Quality)",
                    "4k": "4K Ultra HD (2160p)",
                    "1440p": "2K Quad HD (1440p)",
                    "1080p": "Full HD (1080p)",
                    "720p": "HD (720p)",
                    "480p": "SD (480p)",
                    "360p": "Low Res (360p)",
                    "audio": "Audio Only Stream",
                    "h264": "H.264 / AVC (Maximum Compatibility)",
                    "vp9": "VP9 Codec",
                    "av1": "AV1 Next-Gen Codec",
                },
                "default": "best",
            },
            "audio_format": {
                "type": "string",
                "title": "Audio Extraction Format",
                "enum": ["best", "mp3", "m4a", "flac", "wav", "opus", "ogg", "aac"],
                "enumLabels": {
                    "best": "Best Native Audio",
                    "mp3": "MP3 (Most Compatible)",
                    "m4a": "M4A / AAC (Apple / iOS)",
                    "flac": "FLAC (Lossless Quality)",
                    "wav": "WAV (Uncompressed PCM)",
                    "opus": "Opus (Modern High-Efficiency)",
                    "ogg": "OGG Vorbis",
                    "aac": "AAC",
                },
                "default": "best",
            },
            "audio_quality": {
                "type": "string",
                "title": "Audio Bitrate / Quality",
                "enum": ["best", "320", "256", "192", "128", "96"],
                "enumLabels": {
                    "best": "Best (VBR 0 / Maximum Bitrate)",
                    "320": "320 kbps (CBR Studio Quality)",
                    "256": "256 kbps (Very High)",
                    "192": "192 kbps (High)",
                    "128": "128 kbps (Standard)",
                    "96": "96 kbps (Voice / Low Size)",
                },
                "default": "best",
            },
            "merge_output_format": {
                "type": "string",
                "title": "Video Container Format",
                "enum": ["mp4", "mkv", "webm", "ogg"],
                "default": "mp4",
                "enumLabels": {
                    "mp4": "MP4 (Universal standard)",
                    "mkv": "MKV (Matroska / Subtitle friendly)",
                    "webm": "WebM (Open Web format)",
                    "ogg": "OGG",
                },
            },
            "extract_audio": {
                "type": "boolean",
                "title": "Extract Audio",
                "description": "Convert video directly to audio file via FFmpeg",
            },
            "keep_video": {
                "type": "boolean",
                "title": "Keep Original Video",
                "description": "Retain video file on disk after extracting audio",
            },
            "writesubtitles": {
                "type": "boolean",
                "title": "Download Subtitles",
                "description": "Download official subtitle tracks",
            },
            "writeautomaticsub": {
                "type": "boolean",
                "title": "Download Auto-Generated Subtitles",
                "description": "Download auto-generated / speech-to-text captions",
            },
            "subtitleslangs": {
                "type": "string",
                "title": "Subtitle Languages",
                "placeholder": "en,es,fr,de,ja (or 'all')",
                "description": "Comma-separated subtitle language codes",
            },
            "embed_subs": {
                "type": "boolean",
                "title": "Embed Subtitles into Video",
                "description": "Hard-mux subtitles into MP4/MKV container",
            },
            "embed_thumbnail": {
                "type": "boolean",
                "title": "Embed Thumbnail Cover Art",
                "description": "Embed video thumbnail into audio/video file metadata",
            },
            "write_thumbnail": {
                "type": "boolean",
                "title": "Save Thumbnail Image",
                "description": "Save video thumbnail as separate JPG/PNG file",
            },
            "embed_metadata": {
                "type": "boolean",
                "title": "Embed Metadata & Chapters",
                "description": "Write video title, uploader, date, and chapter markers into media tags",
            },
            "playlist_items": {
                "type": "string",
                "title": "Playlist Item Selection",
                "placeholder": "1,2,5-10 or 1:5",
                "description": "Comma-separated playlist indices or range to download",
            },
            "no_playlist": {
                "type": "boolean",
                "title": "Single Video Only (Ignore Playlist)",
                "description": "Download only the referenced video if URL points to a playlist",
            },
            "max_downloads": {
                "type": "integer",
                "title": "Max Downloads Limit",
                "placeholder": "10",
                "minimum": 1,
                "description": "Maximum number of files to download from a playlist/channel",
            },
            "limit_rate": {
                "type": "string",
                "title": "Download Speed Limit",
                "placeholder": "5M, 500K, 10M",
                "description": "Throttle download bandwidth (e.g. 5M for 5MB/s)",
            },
            "concurrent_fragments": {
                "type": "integer",
                "title": "Concurrent Fragments",
                "placeholder": "4",
                "minimum": 1,
                "description": "Number of parallel threads for dash/hls stream downloads",
            },
            "output_template": {
                "type": "string",
                "title": "Custom Filename Template",
                "placeholder": "%(title)s.%(ext)s",
                "description": "yt-dlp output template (e.g. %(uploader)s/%(title)s.%(ext)s)",
            },
            "cookies_from_browser": {
                "type": "string",
                "title": "Browser Cookies (Anti-403)",
                "enum": ["none", "chrome", "firefox", "edge", "brave", "safari", "opera"],
                "enumLabels": {
                    "none": "None (No Browser Cookies)",
                    "chrome": "Google Chrome",
                    "firefox": "Mozilla Firefox",
                    "edge": "Microsoft Edge",
                    "brave": "Brave Browser",
                    "safari": "Apple Safari",
                    "opera": "Opera Browser",
                },
                "default": "none",
                "description": "Load session cookies directly from browser to bypass 403 Forbidden / bot checks",
            },
            "cookies_file": {
                "type": "string",
                "title": "Cookies File Path",
                "placeholder": "/path/to/cookies.txt",
                "description": "Path to Netscape formatted cookies.txt file",
            },
            "extractor_args": {
                "type": "string",
                "title": "Extractor Arguments (Player Client)",
                "placeholder": "youtube:player_client=ios,web",
                "description": "Override player clients or pass PO tokens (e.g. youtube:player_client=mweb)",
            },
            "restrict_filenames": {
                "type": "boolean",
                "title": "Sanitize Filenames (ASCII Only)",
                "description": "Restrict output filename to ASCII characters and avoid spaces",
            },
            "raw_args": {
                "type": "string",
                "title": "Raw yt-dlp CLI Flags",
                "placeholder": "--no-mtime --geo-bypass",
                "description": "Additional safe command line parameters",
            },
        },
    )

    async def execute(self, context: ToolRunContext) -> ToolResult:
        url = context.params.get("url")
        if not url:
            return ToolResult(artifacts=[], status="failed", error="url is required")
        output_template = context.params.get("output_template")
        if output_template and (".." in str(output_template) or Path(str(output_template)).is_absolute()):
            return ToolResult(artifacts=[], status="failed", error="output_template must be a relative filename template")
        dest = tool_downloads_dir("downloader") if context.kind == "standalone" else run_dir(
            context.workspace_id or "tmp", context.run_id or "tmp"
        )
        try:
            loop = None
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                pass
            produced = await asyncio.to_thread(
                execute_ydl, url, context.params, dest, context.progress_queue, context.cancel_event, 3600, loop
            )
        except YdlCancelledError:
            return ToolResult(artifacts=[], status="cancelled", error="cancelled")
        except RuntimeError as e:
            return ToolResult(artifacts=[], status="failed", error=str(e))
        except Exception as e:
            return ToolResult(artifacts=[], status="failed", error=str(e))
        if not produced:
            return ToolResult(artifacts=[], status="failed", error="yt-dlp produced no files")
        artifacts = [Artifact(path=str(p), kind=PortKind.any, name=p.name) for p in produced]
        return ToolResult(artifacts=artifacts, status="completed")


class TrimmerTool(Tool):
    manifest = ToolManifest(
        id="trimmer",
        name="Media & Audio Trimmer (FFmpeg)",
        description="Precision audio and video trimming and splitting using waveform regions and timestamps.",
        category="Media",
        tags=["audio", "video", "trimmer", "ffmpeg", "cutter"],
        input_kinds=[PortKind.audio, PortKind.video, PortKind.any],
        output_kinds=[PortKind.audio],
        parameters_schema={"regions": {"type": "array"}},
    )

    async def execute(self, context: ToolRunContext) -> ToolResult:
        input_path = context.params.get("input_path")
        regions = context.params.get("regions", [])
        if not input_path:
            return ToolResult(artifacts=[], status="failed", error="input_path is required")
        src = Path(input_path)
        if not src.exists():
            return ToolResult(artifacts=[], status="failed", error=f"input file not found: {input_path}")
        if not regions:
            return ToolResult(artifacts=[], status="failed", error="regions is required")
        dest = tool_downloads_dir("trimmer") if context.kind == "standalone" else run_dir(
            context.workspace_id or "tmp", context.run_id or "tmp"
        )
        dest.mkdir(parents=True, exist_ok=True)
        out = []
        for i, region in enumerate(regions):
            out_path = dest / f"{src.stem}_seg_{i}{src.suffix}"
            try:
                await asyncio.to_thread(
                    subprocess.run,
                    [
                        "ffmpeg", "-y", "-i", str(src),
                        "-ss", str(region.get("start", 0)),
                        "-to", str(region.get("end", 0)),
                        str(out_path),
                    ],
                    check=True,
                    capture_output=True,
                    timeout=300,
                )
                out.append(Artifact(path=str(out_path), kind=PortKind.audio, name=out_path.name))
            except subprocess.TimeoutExpired:
                return ToolResult(artifacts=out, status="failed", error="ffmpeg timed out after 300s")
            except Exception as e:
                return ToolResult(artifacts=out, status="failed", error=str(e))
        return ToolResult(artifacts=out, status="completed")


class TranscriberTool(Tool):
    manifest = ToolManifest(
        id="transcriber",
        name="Audio to Text & Subtitles (Speech-to-Text / SRT)",
        description="Transcribe speech into clean text (.txt) and broadcast-grade subtitles (.srt / .vtt) using NVIDIA NIM, Groq, or Faster-Whisper.",
        category="AI & Tutoring",
        tags=["audio", "transcriber", "subtitles", "srt", "vtt", "whisper", "speech-to-text", "nvidia", "groq"],
        input_kinds=[PortKind.audio, PortKind.video, PortKind.any],
        output_kinds=[PortKind.document, PortKind.text],
        parameters_schema={
            "provider": {
                "type": "string",
                "title": "ASR Provider",
                "enum": ["auto", "nvidia", "groq", "faster-whisper"],
                "default": "auto",
                "description": "Speech-to-Text provider. 'auto' selects NVIDIA NIM from ~/.bashrc, then Groq, then local Faster-Whisper.",
            },
            "model": {
                "type": "string",
                "title": "Model Name",
                "default": "auto",
                "description": "Model override (e.g. openai/whisper-large-v3, whisper-large-v3-turbo, or base).",
            },
            "output_mode": {
                "type": "string",
                "title": "Output Format Mode",
                "enum": ["both", "subtitles", "clean_text", "timestamped_text"],
                "default": "both",
                "description": "Choose whether to generate timed subtitles (.srt & .vtt), clean reading text (.txt), or both.",
            },
            "subtitle_style": {
                "type": "string",
                "title": "Subtitle Style Preset",
                "enum": ["broadcast", "compact", "raw"],
                "default": "broadcast",
                "description": "Enforces professional line length (broadcast: max 42 chars/line; compact: max 30 chars/line).",
            },
            "task": {
                "type": "string",
                "title": "Task Mode",
                "enum": ["transcribe", "translate"],
                "enumLabels": {
                    "transcribe": "Transcribe (Original Spoken Language)",
                    "translate": "Translate to English (Auto-detect speech & translate directly to English)",
                },
                "default": "transcribe",
                "description": "Select 'translate' to translate spoken audio directly into English subtitles and text via Whisper.",
            },
        },
    )

    async def execute(self, context: ToolRunContext) -> ToolResult:
        import os
        from app.tools.subtitles import (
            build_smart_subtitles,
            split_audio_into_chunks,
            transcribe_with_nvidia,
            transcribe_with_groq,
        )

        provider = context.params.get("provider", "auto")
        model = context.params.get("model", "auto")
        output_mode = context.params.get("output_mode", "both")
        subtitle_style = context.params.get("subtitle_style", "broadcast")
        task = context.params.get("task", "transcribe")
        input_path = context.params.get("input_path")
        input_paths = context.params.get("input_paths") or []
        if input_path:
            input_paths = [input_path] + list(input_paths)
        if not input_paths:
            return ToolResult(artifacts=[], status="failed", error="input_path is required")

        valid_providers = {"auto", "nvidia", "groq", "faster-whisper"}
        if provider not in valid_providers:
            return ToolResult(artifacts=[], status="failed", error=f"unsupported provider: {provider} (supported: {', '.join(sorted(valid_providers))})")

        dest = Path(context.destination) if getattr(context, "destination", None) else (tool_downloads_dir("transcriber") if context.kind == "standalone" else run_dir(context.workspace_id or "tmp", context.run_id or "tmp"))
        dest.mkdir(parents=True, exist_ok=True)

        if provider == "faster-whisper":
            try:
                whisper_model = "base" if model == "auto" else model
                artifacts = await asyncio.to_thread(self._transcribe, input_paths, whisper_model, dest)
                return ToolResult(artifacts=artifacts, status="completed")
            except Exception as e:
                return ToolResult(artifacts=[], status="failed", error=str(e))

        from app.tools.model_health_tool import _scan_bashrc_keys
        bashrc_keys = _scan_bashrc_keys()
        nvidia_key = os.environ.get("NVIDIA_API_KEY") or (bashrc_keys.get("NVIDIA_API_KEY", (None, None))[0])
        groq_key = os.environ.get("GROQ_API_KEY") or (bashrc_keys.get("GROQ_API_KEY", (None, None))[0])

        artifacts: list[Artifact] = []

        for p in input_paths:
            resolved = resolve_input_file(p)
            if not resolved or not resolved.exists():
                return ToolResult(artifacts=artifacts, status="failed", error=f"input file not found: {p}")
            src = resolved

            scratch_audio = dest / f"{src.stem}_asr_scratch.wav"
            try:
                await asyncio.to_thread(
                    subprocess.run,
                    ["ffmpeg", "-y", "-i", str(src), "-vn", "-ar", "16000", "-ac", "1", str(scratch_audio)],
                    check=True,
                    capture_output=True,
                    timeout=180,
                )
                asr_input = scratch_audio
            except Exception:
                asr_input = src

            chunks = split_audio_into_chunks(asr_input, chunk_duration=600.0)
            raw_segments: list[dict[str, Any]] = []
            err_msg = ""
            chunk_failed = False

            for chunk_path, chunk_offset in chunks:
                chunk_segs = None
                if provider in ("auto", "nvidia"):
                    if nvidia_key:
                        try:
                            chosen_model = "openai/whisper-large-v3" if model == "auto" else model
                            chunk_segs = await transcribe_with_nvidia(chunk_path, nvidia_key, chosen_model, task=task)
                        except Exception as e:
                            err_msg = f"NVIDIA NIM failed: {e}"
                            if provider == "nvidia":
                                chunk_failed = True
                                break

                if not chunk_segs and provider in ("auto", "groq"):
                    if groq_key:
                        try:
                            # Groq turbo does NOT support translate — must use whisper-large-v3 for translate
                            if model == "auto":
                                chosen_model = "whisper-large-v3" if task == "translate" else "whisper-large-v3-turbo"
                            else:
                                chosen_model = model
                            chunk_segs = await transcribe_with_groq(chunk_path, groq_key, chosen_model, task=task)
                        except Exception as e:
                            err_msg += f" Groq failed: {e}"
                            if provider == "groq":
                                chunk_failed = True
                                break

                if not chunk_segs and provider in ("auto", "faster-whisper"):
                    try:
                        chosen_model = "base" if model == "auto" else model
                        chunk_segs = await asyncio.to_thread(self._transcribe_local, chunk_path, chosen_model, task)
                    except Exception as e:
                        err_msg += f" Local faster-whisper failed ({e})."
                        if provider == "faster-whisper":
                            chunk_failed = True
                            break

                if not chunk_segs:
                    chunk_failed = True
                    break

                for seg in chunk_segs:
                    raw_segments.append({
                        "start": seg["start"] + chunk_offset,
                        "end": seg["end"] + chunk_offset,
                        "text": seg["text"],
                    })

            # Cleanup chunks directory if generated
            if chunks and chunks[0][0] != asr_input:
                import shutil
                shutil.rmtree(chunks[0][0].parent, ignore_errors=True)

            if chunk_failed or not raw_segments:
                return ToolResult(
                    artifacts=artifacts,
                    status="failed",
                    error=f"No ASR provider succeeded. Check NVIDIA_API_KEY / GROQ_API_KEY in ~/.bashrc or local faster-whisper. {err_msg}".strip(),
                )

            srt_content, vtt_content, clean_text, ts_text = build_smart_subtitles(
                raw_segments, style=subtitle_style
            )

            stem = src.stem
            is_trans = task == "translate"

            if output_mode in ("both", "subtitles"):
                srt_file = dest / (f"{stem}.en.srt" if is_trans else f"{stem}.srt")
                vtt_file = dest / (f"{stem}.en.vtt" if is_trans else f"{stem}.vtt")
                srt_file.write_text(srt_content, encoding="utf-8")
                vtt_file.write_text(vtt_content, encoding="utf-8")
                artifacts.append(Artifact(path=str(srt_file), kind=PortKind.document, name=srt_file.name))
                artifacts.append(Artifact(path=str(vtt_file), kind=PortKind.document, name=vtt_file.name))

                if is_trans:
                    # Also write canonical {stem}.srt for downstream compatibility
                    canon_srt = dest / f"{stem}.srt"
                    if canon_srt != srt_file:
                        canon_srt.write_text(srt_content, encoding="utf-8")
                        artifacts.append(Artifact(path=str(canon_srt), kind=PortKind.document, name=canon_srt.name))

            if output_mode in ("both", "clean_text"):
                suffix = "_en_clean.txt" if is_trans else ("_clean.txt" if output_mode == "both" else ".txt")
                txt_file = dest / f"{stem}{suffix}"
                txt_file.write_text(clean_text, encoding="utf-8")
                artifacts.append(Artifact(path=str(txt_file), kind=PortKind.text, name=txt_file.name))

            if output_mode == "timestamped_text":
                suffix = "_en_timestamped.txt" if is_trans else "_timestamped.txt"
                ts_file = dest / f"{stem}{suffix}"
                ts_file.write_text(ts_text, encoding="utf-8")
                artifacts.append(Artifact(path=str(ts_file), kind=PortKind.text, name=ts_file.name))

            if scratch_audio.exists():
                try:
                    scratch_audio.unlink()
                except OSError:
                    pass

        return ToolResult(artifacts=artifacts, status="completed")

    def _transcribe(self, input_paths: list[str], model: str, dest: Path) -> list[Artifact]:
        try:
            from faster_whisper import WhisperModel
        except ImportError:
            raise RuntimeError("faster-whisper is not installed (pip install faster-whisper)")
        whisper = WhisperModel(model)
        artifacts = []
        for p in input_paths:
            src = Path(p)
            if not src.exists():
                raise FileNotFoundError(f"input file not found: {p}")
            segments, _info = whisper.transcribe(str(src), beam_size=5)
            from app.tools.subtitles import format_srt_timestamp
            text_lines: list[str] = []
            srt_blocks: list[str] = []
            for i, seg in enumerate(segments, start=1):
                text = seg.text.strip()
                text_lines.append(text)
                srt_blocks.append(f"{i}\n{format_srt_timestamp(seg.start)} --> {format_srt_timestamp(seg.end)}\n{text}\n")
            txt_out = dest / f"{src.stem}.txt"
            srt_out = dest / f"{src.stem}.srt"
            txt_out.write_text("\n".join(text_lines), encoding="utf-8")
            srt_out.write_text("\n".join(srt_blocks), encoding="utf-8")
            artifacts.append(Artifact(path=str(txt_out), kind=PortKind.text, name=txt_out.name))
            artifacts.append(Artifact(path=str(srt_out), kind=PortKind.document, name=srt_out.name))
        return artifacts

    def _transcribe_local(self, audio_path: Path, model: str, task: str = "transcribe") -> list[dict[str, Any]]:
        try:
            from faster_whisper import WhisperModel
        except ImportError:
            raise RuntimeError("faster-whisper is not installed (pip install faster-whisper)")
        whisper = WhisperModel(model)
        segments, _info = whisper.transcribe(str(audio_path), task=task, beam_size=5)
        out = []
        for seg in segments:
            out.append({
                "start": float(seg.start),
                "end": float(seg.end),
                "text": seg.text.strip(),
            })
        return out


class PackagerTool(Tool):
    manifest = ToolManifest(
        id="packager",
        name="Archive Packager (ZIP)",
        description="Bundle workspace outputs and artifacts into a compressed ZIP archive.",
        category="General",
        tags=["archive", "zip", "packager", "bundle"],
        input_kinds=[PortKind.any],
        output_kinds=[PortKind.any, PortKind.binary],
        parameters_schema={"paths": {"type": "array"}},
    )

    async def execute(self, context: ToolRunContext) -> ToolResult:
        import zipfile
        paths = context.params.get("paths", [])
        if not paths:
            return ToolResult(artifacts=[], status="failed", error="paths is required")
        dest = tool_downloads_dir("packager") if context.kind == "standalone" else run_dir(
            context.workspace_id or "tmp", context.run_id or "tmp"
        )
        out = dest / "bundle.zip"
        try:
            with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
                for p in paths:
                    zf.write(p, Path(p).name)
        except Exception as e:
            return ToolResult(artifacts=[], status="failed", error=str(e))
        return ToolResult(artifacts=[Artifact(path=str(out), kind=PortKind.binary, name=out.name)], status="completed")
