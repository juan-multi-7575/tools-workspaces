import pytest
from pathlib import Path

from app.paths import run_dir
from app.workspaces import create_workspace


def test_delete_media_glob_injection():
    ws = "test_sec_ws"
    create_workspace(ws)
    r_dir = run_dir(ws, "run_sec")
    r_dir.mkdir(parents=True, exist_ok=True)
    (r_dir / "keep.txt").write_text("keep")
    (r_dir / "other.txt").write_text("other")
    from app.workspaces import delete_workspace_media_file

    # "*" should NOT delete both; should return False and leave files
    assert delete_workspace_media_file(ws, "*") is False
    assert (r_dir / "keep.txt").exists()
    assert (r_dir / "other.txt").exists()
    # "../" traversal should be sanitized
    assert delete_workspace_media_file(ws, "../keep.txt") is False


def test_ffmpeg_subtitle_escape():
    # subtitle path with single quote should not break command
    ws = "test_sec_ws2"
    create_workspace(ws)
    # create dummy video/subtitle with quote in name
    v = Path("uploads/video.mp4")
    v.parent.mkdir(exist_ok=True)
    v.write_bytes(b"\x00")
    s = Path("uploads/a'b.srt")
    s.write_text("1\n00:00:00 --> 00:00:01\nHi")
    # mux with burn_in True should not raise injection error
    try:
        from app.workspaces import mux_subtitles_to_video

        # mock ffmpeg not needed; check command building via escaping function
        from app.tools.downloader import _escape_ffmpeg_path  # to be created

        escaped = _escape_ffmpeg_path(str(s))
        assert "'" not in escaped or "\\'" in escaped
    except ImportError:
        pytest.skip("helper not yet implemented")
