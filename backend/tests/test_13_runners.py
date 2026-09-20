import asyncio
import sys
import pytest
from pathlib import Path
from app.runners.subprocess_runner import AsyncSubprocessRunner
from app.tools.declarative import CommandTool
from app.tools.base import PortKind, ToolManifest, ToolRunContext


@pytest.mark.anyio
async def test_async_subprocess_runner_success(tmp_path):
    cmd = [sys.executable, "-c", "import sys; print('hello world'); sys.stderr.write('logged\\n')"]
    runner = AsyncSubprocessRunner(command=cmd, cwd=tmp_path)
    res = await runner.run()

    assert res.exit_code == 0
    assert "hello world" in res.stdout
    assert "logged" in res.stderr
    assert res.timed_out is False
    assert res.cancelled is False


@pytest.mark.anyio
async def test_async_subprocess_runner_timeout(tmp_path):
    cmd = [sys.executable, "-c", "import time; time.sleep(5)"]
    runner = AsyncSubprocessRunner(command=cmd, cwd=tmp_path, timeout=0.3)
    res = await runner.run()

    assert res.timed_out is True
    assert res.cancelled is False


@pytest.mark.anyio
async def test_async_subprocess_runner_cancellation(tmp_path):
    cmd = [sys.executable, "-c", "import time; time.sleep(5)"]
    runner = AsyncSubprocessRunner(command=cmd, cwd=tmp_path)
    cancel_event = asyncio.Event()

    async def _cancel_soon():
        await asyncio.sleep(0.2)
        cancel_event.set()

    task = asyncio.create_task(_cancel_soon())
    res = await runner.run(cancel_event=cancel_event)
    await task

    assert res.cancelled is True


@pytest.mark.anyio
async def test_declarative_command_tool(tmp_path):
    class EchoTool(CommandTool):
        manifest = ToolManifest(
            id="echo_tool",
            name="Echo Tool",
            description="Writes message to a file",
            category="Data",
            input_kinds=[PortKind.any],
            output_kinds=[PortKind.text],
            parameters_schema={"msg": {"type": "string"}},
        )
        command_tokens = [
            sys.executable,
            "-c",
            "import sys; open('{destination}/out.txt', 'w').write('{msg}')",
        ]

    tool = EchoTool()
    dest = tmp_path / "standalone_out"
    ctx = ToolRunContext(
        kind="standalone",
        destination=str(dest),
        params={"msg": "test-content"},
    )
    result = await tool.execute(ctx)

    assert result.status == "completed"
    assert len(result.artifacts) == 1
    assert result.artifacts[0].name == "out.txt"
    assert Path(result.artifacts[0].path).read_text() == "test-content"
