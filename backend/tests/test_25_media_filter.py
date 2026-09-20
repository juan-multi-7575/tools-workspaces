from pathlib import Path

from app.paths import run_dir
from app.workspaces import create_workspace, list_pipeline_runs, list_workspace_media, save_run_meta


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


def test_pipeline_grouping():
    ws = "test_group"
    create_workspace(ws)
    # simulate DAG with 3 steps sharing same pipeline_run_id
    for i, tool in enumerate(["downloader", "audio_processor", "transcriber"]):
        rid = f"run_{i}"
        r = run_dir(ws, rid)
        r.mkdir(parents=True, exist_ok=True)
        (r / "out.txt").write_bytes(b"x")
        save_run_meta(
            ws,
            rid,
            {
                "id": rid,
                "tool_id": tool,
                "status": "completed",
                "pipeline_run_id": "pipe_123",
                "pipeline_name": "YouTube\u2192English",
                "timestamp": 1000 + i,
                "artifacts": [],
            },
        )
    res = list_pipeline_runs(ws)
    assert len(res) == 1
    assert res[0]["pipeline_run_id"] == "pipe_123"
    assert len(res[0]["steps"]) == 3


def test_sanitize_api_filename():
    from app.tools.subtitles import _sanitize_api_filename

    assert _sanitize_api_filename(Path("lecture_&_test.mp3")) == "lecture_test.wav"
    assert _sanitize_api_filename(Path("장난감 안 사주는 & | .wav")) == "audio.wav"
    assert _sanitize_api_filename(Path("my-video_01.m4a")) == "my-video_01.wav"
    assert _sanitize_api_filename(Path("chunk_001.wav")) == "chunk_001.wav"
    assert _sanitize_api_filename(Path("custom lecture (final).wav")) == "custom_lecture_final.wav"
    # content is always wav, so mp4 input still yields .wav
    assert _sanitize_api_filename(Path("video.mp4")) == "video.wav"
