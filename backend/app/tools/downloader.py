import subprocess
from pathlib import Path
from typing import Any

from app.paths import tool_downloads_dir, run_dir
from app.tools.base import Artifact, PortKind, Tool, ToolManifest, ToolRunContext, ToolResult


FORMAT_PRESETS = {
    "best": "bestvideo+bestaudio/best",
    "1080p": "bestvideo[height<=1080]+bestaudio/best[height<=1080]",
    "720p": "bestvideo[height<=720]+bestaudio/best[height<=720]",
    "480p": "bestvideo[height<=480]+bestaudio/best[height<=480]",
    "audio": "bestaudio/best",
    "h264": "bestvideo[vcodec^=avc1]+bestaudio/best",
    "vp9": "bestvideo[vcodec^=vp9]+bestaudio/best",
    "av1": "bestvideo[vcodec^=av01]+bestaudio/best",
}

AUDIO_QUALITY = {"best": "0", "128": "128", "192": "192", "256": "256", "320": "320"}


def build_ydl_opts(params: dict, outtmpl: str) -> dict:
    opts = {"outtmpl": outtmpl, "noprogress": False, "newline": True}
    preset = params.get("format_preset")
    if preset and preset in FORMAT_PRESETS:
        opts["format"] = FORMAT_PRESETS[preset]
    elif params.get("format"):
        opts["format"] = params["format"]

    if params.get("extract_audio"):
        opts["extractaudio"] = True
        opts["audioformat"] = params.get("audio_format", "best")
        aq = AUDIO_QUALITY.get(params.get("audio_quality", "best"), "0")
        opts["audioquality"] = aq

    if params.get("writesubtitles"):
        opts["writesubtitles"] = True
        if params.get("subtitleslangs"):
            opts["subtitleslangs"] = params["subtitleslangs"]

    if params.get("writeautomaticsub"):
        opts["writeautomaticsub"] = True

    if params.get("playlist_items"):
        opts["playlist_items"] = str(params["playlist_items"])

    if params.get("merge_output_format"):
        opts["merge_output_format"] = params["merge_output_format"]

    if params.get("limit_rate"):
        opts["limit_rate"] = params["limit_rate"]

    if params.get("output_template"):
        opts["outtmpl"] = params["output_template"]

    return opts


def _to_cli(ydl_opts: dict) -> list[str]:
    cmd = ["yt-dlp"]
    for key, value in ydl_opts.items():
        flag = f"--{key}"
        if isinstance(value, bool):
            if value:
                cmd.append(flag)
        elif isinstance(value, list):
            cmd.extend([flag, ",".join(str(v) for v in value)])
        else:
            cmd.extend([flag, str(value)])
    return cmd


_RAW_ARGS_DENYLIST = ("--exec", "--config", "--config-location", "--loader")


def validate_raw_args(raw: str) -> tuple[bool, str]:
    if any(ch in raw for ch in (";", "|", "&", "$", "`", "<", ">", "\n", "\r")):
        return False, "raw args contain shell metacharacters"
    for token in raw.split():
        if token in _RAW_ARGS_DENYLIST:
            return False, f"raw args contain forbidden flag: {token}"
    return True, ""


def split_raw_args(raw: str) -> list[str]:
    return raw.split()


def execute_ydl(url: str, params: dict, outdir: Path, progress_queue: Any = None, cancel_event: Any = None) -> list[Path]:
    outtmpl = str(outdir / "%(title)s.%(ext)s")
    ydl_opts = build_ydl_opts(params, outtmpl)
    cmd = _to_cli(ydl_opts)
    raw = params.get("raw_args")
    if raw:
        ok, err = validate_raw_args(raw)
        if not ok:
            raise ValueError(err)
        cmd += split_raw_args(raw)
    cmd += [url]
    produced: list[Path] = []

    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    try:
        assert proc.stdout is not None
        for line in proc.stdout:
            if cancel_event is not None and getattr(cancel_event, "is_set", lambda: False)():
                proc.terminate()
                raise RuntimeError("cancelled")
            msg = _parse_progress(line)
            if msg is not None and progress_queue is not None:
                progress_queue.put_nowait(msg)
        proc.wait()
        if proc.returncode != 0:
            raise RuntimeError(f"yt-dlp exited with code {proc.returncode}")
        produced = [p for p in outdir.iterdir() if p.is_file() and p.suffix != ".part"]
        if progress_queue is not None:
            progress_queue.put_nowait({"status": "completed", "percent": 100})
    except Exception:
        for p in outdir.iterdir():
            if p.suffix == ".part" or p.suffix == ".ytd":
                p.unlink(missing_ok=True)
        raise
    return produced


def _parse_progress(line: str) -> dict | None:
    line = line.strip()
    if not line.startswith("[download]"):
        return None
    if "%" not in line:
        return None
    try:
        pct_str = line.split("%")[0].split()[-1]
        percent = float(pct_str)
    except (ValueError, IndexError):
        return None
    speed = _extract_field(line, " at ", "ETA")
    eta = _extract_field(line, "ETA ", None)
    return {"status": "downloading", "percent": percent, "speed": speed, "eta": eta}


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
        id="downloader",
        name="Downloader",
        description="Download media via yt-dlp.",
        input_kinds=[PortKind.any],
        output_kinds=[PortKind.any],
        parameters_schema={
            "url": {"type": "string"},
            "format_preset": {"type": "string", "enum": ["best", "1080p", "720p", "480p", "audio", "h264", "vp9", "av1"]},
            "extract_audio": {"type": "boolean"},
            "audio_format": {"type": "string", "enum": ["best", "mp3", "m4a", "ogg", "wav", "flac"]},
            "audio_quality": {"type": "string", "enum": ["best", "128", "192", "256", "320"]},
            "writesubtitles": {"type": "boolean"},
            "subtitleslangs": {"type": "string"},
            "writeautomaticsub": {"type": "boolean"},
            "playlist_items": {"type": "string"},
            "merge_output_format": {"type": "string", "enum": ["mp4", "mkv", "webm", "ogg"]},
            "limit_rate": {"type": "string"},
            "output_template": {"type": "string"},
            "raw_args": {"type": "string"},
        },
    )

    async def execute(self, context: ToolRunContext) -> ToolResult:
        url = context.params.get("url")
        if not url:
            return ToolResult(artifacts=[], status="failed", error="url is required")
        dest = tool_downloads_dir("downloader") if context.kind == "standalone" else run_dir(
            context.workspace_id or "tmp", context.run_id or "tmp"
        )
        try:
            produced = execute_ydl(url, context.params, dest, context.progress_queue, context.cancel_event)
        except RuntimeError as e:
            if str(e) == "cancelled":
                return ToolResult(artifacts=[], status="cancelled", error="cancelled")
            return ToolResult(artifacts=[], status="failed", error=str(e))
        except Exception as e:
            return ToolResult(artifacts=[], status="failed", error=str(e))
        artifacts = [Artifact(path=str(p), kind=PortKind.any, name=p.name) for p in produced]
        return ToolResult(artifacts=artifacts, status="completed")


class TrimmerTool(Tool):
    manifest = ToolManifest(
        id="trimmer",
        name="Audio Trimmer",
        description="Trim or split audio using waveform regions.",
        input_kinds=[PortKind.audio],
        output_kinds=[PortKind.audio],
        parameters_schema={"regions": {"type": "array"}},
    )

    async def execute(self, context: ToolRunContext) -> ToolResult:
        input_path = context.params.get("input_path")
        regions = context.params.get("regions", [])
        if not input_path:
            return ToolResult(artifacts=[], status="failed", error="input_path is required")
        dest = tool_downloads_dir("trimmer") if context.kind == "standalone" else run_dir(
            context.workspace_id or "tmp", context.run_id or "tmp"
        )
        src = Path(input_path)
        out = []
        for i, region in enumerate(regions):
            out_path = dest / f"{src.stem}_seg_{i}{src.suffix}"
            try:
                subprocess.run(
                    [
                        "ffmpeg", "-y", "-i", str(src),
                        "-ss", str(region.get("start", 0)),
                        "-to", str(region.get("end", 0)),
                        str(out_path),
                    ],
                    check=True,
                    capture_output=True,
                )
                out.append(Artifact(path=str(out_path), kind=PortKind.audio, name=out_path.name))
            except Exception as e:
                return ToolResult(artifacts=out, status="failed", error=str(e))
        status = "completed" if out else "failed"
        return ToolResult(artifacts=out, status=status)


class TranscriberTool(Tool):
    manifest = ToolManifest(
        id="transcriber",
        name="Transcriber",
        description="Transcribe audio via provider registry.",
        input_kinds=[PortKind.audio],
        output_kinds=[PortKind.text],
        parameters_schema={"provider": {"type": "string"}, "model": {"type": "string"}},
    )

    async def execute(self, context: ToolRunContext) -> ToolResult:
        provider = context.params.get("provider", "faster-whisper")
        model = context.params.get("model", "base")
        input_path = context.params.get("input_path")
        input_paths = context.params.get("input_paths") or []
        if input_path:
            input_paths = [input_path] + list(input_paths)
        if not input_paths:
            return ToolResult(artifacts=[], status="failed", error="input_path is required")
        dest = tool_downloads_dir("transcriber") if context.kind == "standalone" else run_dir(
            context.workspace_id or "tmp", context.run_id or "tmp"
        )
        artifacts = []
        for p in input_paths:
            out = dest / f"{Path(p).stem}.txt"
            out.write_text(f"[{provider}:{model}] transcribed text for {p}")
            artifacts.append(Artifact(path=str(out), kind=PortKind.text, name=out.name))
        return ToolResult(artifacts=artifacts, status="completed")


class PackagerTool(Tool):
    manifest = ToolManifest(
        id="packager",
        name="Archive Packager",
        description="Bundle artifacts into a ZIP.",
        input_kinds=[PortKind.any],
        output_kinds=[PortKind.any],
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
        return ToolResult(artifacts=[Artifact(path=str(out), kind=PortKind.any, name=out.name)], status="completed")
