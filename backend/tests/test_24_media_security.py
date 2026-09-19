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
