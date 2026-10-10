"""Regression tests for P3 #13 of the 2026-10-04 UI audit.

Two standalone ``script_runner`` runs shared one destination directory, and the
runner opened ``output.log`` in append mode, so run 2 reported run 1's stdout and
run 1's files as its own output. The page could then show text and artifacts the
user's script never produced.

``test_second_standalone_run_reports_only_its_own_output_and_artifacts`` is the
behavioural guarantee. ``test_log_truncation_is_opt_in_per_call`` pins the contract
that makes it possible without changing ``declarative.py``, which deliberately
shares one ``execution.log`` across the steps of a single run.
"""

from __future__ import annotations

import sys

import pytest

from app.registry import get
from app.runners.subprocess_runner import AsyncSubprocessRunner
from app.tools.base import ToolRunContext

RUN_ONE_MARKER = "RUN-ONE-MARKER-9f2c"
RUN_TWO_MARKER = "RUN-TWO-MARKER-4b71"


@pytest.mark.anyio
async def test_second_standalone_run_reports_only_its_own_output_and_artifacts(tmp_path):
    tool = get("script_runner")

    first = await tool.execute(
        ToolRunContext(
            kind="standalone",
            destination=str(tmp_path / "out1"),
            params={
                "language": "python",
                "code": (
                    f"print({RUN_ONE_MARKER!r})\n"
                    "open('artifact_from_run_one.txt', 'w').write('run one payload')\n"
                ),
            },
        )
    )
    assert first.status == "completed", first.error
    assert RUN_ONE_MARKER in (first.output_text or "")
    assert "artifact_from_run_one.txt" in {a.name for a in first.artifacts}

    second = await tool.execute(
        ToolRunContext(
            kind="standalone",
            destination=str(tmp_path / "out2"),
            params={"language": "python", "code": f"print({RUN_TWO_MARKER!r})\n"},
        )
    )
    assert second.status == "completed", second.error

    reported = second.output_text or ""
    assert RUN_TWO_MARKER in reported
    assert RUN_ONE_MARKER not in reported, "run 2 reported run 1's stdout as its own output"
    assert (second.data or {}).get("stdout") == reported

    names = {a.name for a in second.artifacts}
    assert "artifact_from_run_one.txt" not in names, f"run 1 files reported by run 2: {sorted(names)}"


@pytest.mark.anyio
async def test_log_truncation_is_opt_in_per_call(tmp_path):
    """Append stays the default because ``declarative.py`` reuses one log per run."""
    script = tmp_path / "echo.py"
    script.write_text("import sys\nprint(sys.argv[1])\n", encoding="utf-8")
    log = tmp_path / "output.log"

    async def run_once(marker: str, *, truncate: bool) -> None:
        runner = AsyncSubprocessRunner(
            command=[sys.executable, str(script), marker],
            cwd=tmp_path,
        )
        res = await runner.run(log_file=log, truncate_log=truncate)
        assert res.exit_code == 0

    await run_once("APPEND-ONE", truncate=False)
    await run_once("APPEND-TWO", truncate=False)
    appended = log.read_text(encoding="utf-8")
    assert "APPEND-ONE" in appended and "APPEND-TWO" in appended

    await run_once("TRUNCATED-ONE", truncate=True)
    truncated = log.read_text(encoding="utf-8")
    assert "TRUNCATED-ONE" in truncated
    assert "APPEND-ONE" not in truncated and "APPEND-TWO" not in truncated