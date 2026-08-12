import asyncio
from pathlib import Path

import pytest

from app.cli import _cleanup_partials, build_cli, main, run_tool
from app.registry import REGISTRY, list_manifests, register
from app.tools.base import Artifact, PortKind, Tool, ToolManifest, ToolResult


def test_cli_no_args_lists_subcommands(capsys):
    rc = main([])
    out = capsys.readouterr().out
    assert rc == 0
    for tool_id in ("audio_processor", "downloader", "trimmer", "transcriber", "mediainfo"):
        assert tool_id in out


def test_cli_subcommands_match_registry():
    cli = build_cli()
    registry_ids = {m.id for m in list_manifests()}
    assert set(cli.commands.keys()) == registry_ids


def test_cli_invokes_audio_processor(tmp_path, monkeypatch):
    captured = {}

    async def fake_execute(ctx):
        captured["params"] = dict(ctx.params)
        captured["kind"] = ctx.kind
        out = Path(ctx.destination) / "out.mp3"
        out.write_text("x")
        return ToolResult(
            artifacts=[Artifact(path=str(out), kind=PortKind.audio, name=out.name)],
            status="completed",
        )

    monkeypatch.setattr(REGISTRY["audio_processor"], "execute", fake_execute)
    rc = main(["audio_processor", "--format", "mp3", "--sample-rate", "44100", "--destination", str(tmp_path)])
    assert rc == 0
    assert captured["params"]["format"] == "mp3"
    assert captured["params"]["sample_rate"] == 44100
    assert captured["kind"] == "standalone"


def test_cli_array_param_json_parsed(tmp_path, monkeypatch):
    captured = {}

    async def fake_execute(ctx):
        captured["regions"] = ctx.params.get("regions")
        return ToolResult(artifacts=[], status="completed")

    monkeypatch.setattr(REGISTRY["trimmer"], "execute", fake_execute)
    rc = main(["trimmer", "--regions", '[{"start": 0, "end": 1}]'])
    assert rc == 0
    assert captured["regions"] == [{"start": 0, "end": 1}]


def test_cli_live_progress_printed(tmp_path, capsys, monkeypatch):
    async def fake_execute(ctx):
        for pct in (0, 50, 100):
            ctx.progress_queue.put_nowait({"status": "downloading", "percent": pct, "speed": "1MiB/s", "eta": "00:02"})
        ctx.progress_queue.put_nowait({"status": "completed", "percent": 100})
        return ToolResult(artifacts=[], status="completed")

    monkeypatch.setattr(REGISTRY["downloader"], "execute", fake_execute)
    rc = run_tool("downloader", {"url": "http://example.com"}, str(tmp_path))
    assert rc == 0
    out = capsys.readouterr().out
    assert "50" in out
    assert "1MiB/s" in out
    assert "ETA" in out


def test_cli_cancel_event_aborts_and_cleans_partials(tmp_path, monkeypatch):
    part = tmp_path / "video.part"
    part.write_text("partial")

    async def fake_execute(ctx):
        for pct in (0, 50):
            ctx.progress_queue.put_nowait({"status": "downloading", "percent": pct})
        ctx.cancel_event.set()
        ctx.progress_queue.put_nowait({"status": "cancelled"})
        return ToolResult(artifacts=[], status="cancelled")

    monkeypatch.setattr(REGISTRY["downloader"], "execute", fake_execute)
    rc = run_tool("downloader", {"url": "http://example.com"}, str(tmp_path))
    assert rc == 130
    assert not part.exists()


def test_cli_cleanup_partials_removes_part_and_ytd(tmp_path):
    (tmp_path / "a.part").write_text("x")
    (tmp_path / "b.ytd").write_text("x")
    (tmp_path / "keep.mp4").write_text("x")
    _cleanup_partials(tmp_path)
    assert not (tmp_path / "a.part").exists()
    assert not (tmp_path / "b.ytd").exists()
    assert (tmp_path / "keep.mp4").exists()


def test_cli_new_tool_appears_automatically(monkeypatch):
    class FakeTool(Tool):
        manifest = ToolManifest(
            id="fake-tool",
            name="Fake",
            description="Fake tool for CLI test.",
            input_kinds=[PortKind.any],
            output_kinds=[PortKind.any],
            parameters_schema={"opt": {"type": "string"}},
        )

        async def execute(self, context):
            return ToolResult(artifacts=[], status="completed")

    register(FakeTool())
    try:
        cli = build_cli()
        assert "fake-tool" in cli.commands
        assert "opt" in [p.name for p in cli.commands["fake-tool"].params]
        rc = main(["fake-tool", "--opt", "hello"])
        assert rc == 0
    finally:
        REGISTRY.pop("fake-tool", None)


def test_cli_failed_tool_returns_nonzero(tmp_path, monkeypatch):
    async def fake_execute(ctx):
        return ToolResult(artifacts=[], status="failed", error="boom")

    monkeypatch.setattr(REGISTRY["demucs"], "execute", fake_execute)
    rc = run_tool("demucs", {"input_path": "x"}, str(tmp_path))
    assert rc == 1
