from pathlib import Path

from app.paths import run_dir
from app.workspaces import create_workspace, list_workspace_media, save_run_meta


def test_scratch_hidden():
    ws = "test_scratch_hide"
    create_workspace(ws)
    r = run_dir(ws, "run1")
    r.mkdir(parents=True, exist_ok=True)
    (r / "video.mp4").write_bytes(b"x")
    (r / "video_asr_scratch.wav").write_bytes(b"x")
    (r / "a_b.srt").write_bytes(b"x")
    save_run_meta(
        ws,
        "run1",
        {
            "id": "run1",
            "tool_id": "transcriber",
            "status": "completed",
            "params": {},
            "artifacts": [
                {"name": "video.mp4", "path": str(r / "video.mp4")},
                {"name": "video_asr_scratch.wav", "path": str(r / "video_asr_scratch.wav")},
            ],
        },
    )
    res = list_workspace_media(ws)
    names = [f["name"] for f in res["all_files"]]
    assert "video.mp4" in names
    assert "video_asr_scratch.wav" not in names
    # also ensure scratch not in packages
    pkg_names = [f["name"] for pkg in res["packages"] for f in pkg["all_files"]]
    assert "video_asr_scratch.wav" not in pkg_names
    # ensure normal srt still present
    assert "a_b.srt" in names


def test_scratch_prefix_hidden():
    ws = "test_scratch_prefix"
    create_workspace(ws)
    r = run_dir(ws, "run1")
    r.mkdir(parents=True, exist_ok=True)
    (r / "scratch_video.wav").write_bytes(b"x")
    (r / "keep.mp4").write_bytes(b"x")
    save_run_meta(ws, "run1", {"id": "run1", "tool_id": "transcriber", "status": "completed", "params": {}, "artifacts": []})
    res = list_workspace_media(ws)
    names = [f["name"] for f in res["all_files"]]
    assert "scratch_video.wav" not in names
    assert "keep.mp4" in names
