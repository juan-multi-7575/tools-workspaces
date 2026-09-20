import subprocess, sys
from pathlib import Path


def test_scaffold_dry_run_lists_files(tmp_path):
    out = subprocess.run(
        [sys.executable, "backend/tools/make-tool.py", "--id", "media.silence.detect",
         "--kind", "audio", "--in", "audio", "--out", "text", "--dry-run"],
        capture_output=True, text=True, cwd=Path(".").resolve(),
    )
    assert out.returncode == 0
    assert "silence_detect.py" in out.stdout
    assert "silence_detect.manifest.yaml" in out.stdout
