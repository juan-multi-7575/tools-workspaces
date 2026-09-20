from __future__ import annotations

import asyncio
import json
import signal
import sys
from pathlib import Path
from typing import Any

import click
from click.exceptions import NoArgsIsHelpError

from app.paths import tool_downloads_dir
from app.registry import REGISTRY, get
from app.tools.base import ToolRunContext

PARTIAL_SUFFIXES = {".part", ".ytd"}


def _coerce(spec: dict[str, Any], value: Any) -> Any:
    if value is None:
        return None
    spec_type = spec.get("type", "string")
    if spec_type == "array":
        if isinstance(value, str):
            try:
                return json.loads(value)
            except Exception:
                return [v.strip() for v in value.split(",") if v.strip()]
        return value
    if spec_type in ("number", "float"):
        try:
            return float(value)
        except (ValueError, TypeError):
            return value
    if spec_type in ("integer", "int"):
        try:
            return int(value)
        except (ValueError, TypeError):
            return value
    if spec_type == "boolean":
        if isinstance(value, str):
            return value.lower() in ("true", "1", "yes", "y")
        return bool(value)
    return value


def _make_command(tool):
    manifest = tool.manifest
    input_param = getattr(tool, "input_param", "input_path")
    params = [
        click.Option(["--destination"], default=None, help="Output directory (default: downloads/<tool>)"),
    ]
    if manifest.id not in ("downloader", "media.download.yt-dlp") and input_param not in manifest.parameters_schema:
        flag = f"--{input_param.replace('_', '-')}"
        params.append(click.Option([flag], default=None, type=click.STRING, help="Input file / artifact"))

    for name, spec in manifest.parameters_schema.items():
        flag = f"--{name.replace('_', '-')}"
        params.append(click.Option([flag], default=None, type=click.STRING, help=spec.get("description", name)))

    def callback(**kwargs):
        params_dict = {
            name: _coerce(manifest.parameters_schema[name], kwargs.get(name))
            for name in manifest.parameters_schema
            if kwargs.get(name) is not None
        }
        if manifest.id not in ("downloader", "media.download.yt-dlp") and input_param not in manifest.parameters_schema:
            if kwargs.get(input_param) is not None:
                params_dict[input_param] = kwargs.get(input_param)
        return run_tool(manifest.id, params_dict, kwargs.get("destination"))

    return click.Command(
        name=manifest.id,
        help=f"[{manifest.category}] {manifest.name}\n\n{manifest.description}",
        params=params,
        callback=callback,
    )


def build_cli() -> click.Group:
    @click.group()
    def cli():
        """Universal Multi-Tool Platform CLI — execute any utility standalone."""

    for key, tool in REGISTRY.items():
        cmd = _make_command(tool)
        cmd.name = key
        cli.add_command(cmd)
    return cli


async def _pump(queue: asyncio.Queue[dict[str, Any]]) -> None:
    while True:
        msg = await queue.get()
        status = msg.get("status")
        if status == "downloading":
            line = f"\r{msg.get('percent')}%"
            if msg.get("speed"):
                line += f" at {msg['speed']}"
            if msg.get("eta"):
                line += f" ETA {msg['eta']}"
            sys.stdout.write(line)
            sys.stdout.flush()
        elif status in ("completed", "failed", "cancelled"):
            sys.stdout.write("\n")
            sys.stdout.flush()
            break


async def _run_async(tool, params: dict, dest: Path, cancel_event, progress_queue):
    ctx = ToolRunContext(
        kind="standalone",
        destination=str(dest),
        params=params,
        cancel_event=cancel_event,
        progress_queue=progress_queue,
    )
    pump = asyncio.create_task(_pump(progress_queue))
    try:
        result = await tool.execute(ctx)
    finally:
        pump.cancel()
        _drain(progress_queue)
    return result


def _drain(queue: asyncio.Queue[dict[str, Any]]) -> None:
    while not queue.empty():
        msg = queue.get_nowait()
        if msg.get("status") == "downloading":
            line = f"\r{msg.get('percent')}%"
            if msg.get("speed"):
                line += f" at {msg['speed']}"
            if msg.get("eta"):
                line += f" ETA {msg['eta']}"
            sys.stdout.write(line)
            sys.stdout.flush()
        elif msg.get("status") in ("completed", "failed", "cancelled"):
            sys.stdout.write("\n")
            sys.stdout.flush()


def _cleanup_partials(dest: Path) -> None:
    if not dest.exists():
        return
    for p in dest.iterdir():
        if p.is_file() and p.suffix in PARTIAL_SUFFIXES:
            p.unlink(missing_ok=True)


def run_tool(tool_id: str, params: dict, destination: str | None = None) -> int:
    tool = get(tool_id)
    dest = Path(destination) if destination else tool_downloads_dir(tool_id)
    dest.mkdir(parents=True, exist_ok=True)

    cancel_event = asyncio.Event()
    progress_queue: asyncio.Queue = asyncio.Queue()

    def _on_signal(signum, frame):
        cancel_event.set()

    previous = signal.signal(signal.SIGINT, _on_signal)
    try:
        result = asyncio.run(_run_async(tool, params, dest, cancel_event, progress_queue))
    finally:
        signal.signal(signal.SIGINT, previous)

    if result.status == "cancelled":
        _cleanup_partials(dest)
        click.echo("cancelled", err=True)
        return 130
    if result.status != "completed":
        _cleanup_partials(dest)
        click.echo(f"failed: {result.error}", err=True)
        return 1
    for artifact in result.artifacts:
        click.echo(artifact.path)
    return 0


def main(argv=None) -> int:
    cli = build_cli()
    try:
        return cli.main(args=argv, prog_name="toolkit", standalone_mode=False)
    except NoArgsIsHelpError as e:
        click.echo(e.format_message())
        return 0


if __name__ == "__main__":
    sys.exit(main())
