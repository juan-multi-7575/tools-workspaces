"""Task 5: workspace visibility flags and per-pipeline timeline.

- Run manifests carry pipeline_run_id, pipeline_name, visibility, preset_id.
- list_runs surfaces them; list_pipeline_runs groups by pipeline_run_id
  with failed > running > completed rollup.
"""

from app import workspaces


def test_run_manifest_carries_visibility_and_pipeline(client):
    body = client.post("/api/tools/mediainfo/execute",
                       json={"kind": "standalone", "destination": "", "params": {}}).json()
    assert body["status"] in ("completed", "failed")

    ws = client.post("/api/workspaces", json={"name": "Visibility"}).json()
    ws_id = ws["id"]
    resp = client.post(
        f"/api/workspaces/{ws_id}/pipeline/run",
        json={"steps": [{"tool_id": "mediainfo", "params": {}}]},
    )
    assert resp.status_code == 200
    results = resp.json()["results"]
    assert len(results) == 1
    rec = results[0]
    assert rec["status"] in ("completed", "failed")
    run_id = rec.get("run_id") or rec.get("id")
    assert run_id
    # The four timeline keys ride on every step record.
    assert rec.get("pipeline_run_id")
    assert rec.get("visibility") == "success"
    assert "pipeline_name" in rec and "preset_id" in rec

    manifest = workspaces.get_run_manifest(ws_id, run_id)
    assert manifest is not None
    assert manifest["pipeline_run_id"] == rec["pipeline_run_id"]
    assert manifest["visibility"] == "success"
    assert "pipeline_name" in manifest and "preset_id" in manifest

    runs = client.get(f"/api/workspaces/{ws_id}/runs").json()["runs"]
    item = next(r for r in runs if r["id"] == run_id)
    assert item["pipeline_run_id"] == rec["pipeline_run_id"]
    assert item["visibility"] == "success"
    assert "pipeline_name" in item and "preset_id" in item


def test_pipeline_groups_roll_up_failed_status():
    from app import workspaces
    ws_id = workspaces.create_workspace("youtube")["id"]
    assert ws_id == "youtube"
    pipe_id = "pipe_visibility_1"
    seeds = [
        ("run_ok", "completed"),
        ("run_bad", "failed"),
    ]
    for i, (rid, status) in enumerate(seeds):
        workspaces.save_run_meta(
            ws_id,
            rid,
            {
                "id": rid,
                "run_id": rid,
                "tool_id": "mediainfo",
                "status": status,
                "pipeline_run_id": pipe_id,
                "pipeline_name": "probe",
                "visibility": "success",
                "preset_id": None,
                "timestamp": 2000 + i,
                "artifacts": [],
            },
        )
    groups = workspaces.list_pipeline_runs("youtube")
    target = next(g for g in groups if g["pipeline_run_id"] == pipe_id)
    assert "pipeline_run_id" in target and "steps" in target and "status" in target
    assert len(target["steps"]) == 2
    assert target["status"] == "failed"


def test_starter_templates_use_dotted_ids_and_composite_preset():
    chains = [t["chain"] for t in workspaces.DEFAULT_STARTER_TEMPLATES]
    flat = [c for chain in chains for c in chain]
    assert "media.download.yt-dlp" in flat
    assert "audio_processor" in flat
    assert "text.translate.llm" in flat
    assert not any(c in ("downloader", "media.audio.process") for c in flat)
    preset = next(
        t for t in workspaces.DEFAULT_STARTER_TEMPLATES
        if t.get("preset_id") == "media.youtube_to_mp4" or t.get("name") == "media.youtube_to_mp4"
    )
    assert preset["chain"] == [
        "media.download.resolve",
        "media.download.format_select",
        "media.subtitle.fetch",
    ]


def test_gc_dry_run_lists_but_keeps():
    from app import workspaces
    ws_id = workspaces.create_workspace("gc probe")["id"]
    workspaces.save_run_meta(
        ws_id, "gc_old_failed",
        {"id": "gc_old_failed", "tool_id": "mediainfo", "status": "failed",
         "visibility": "success", "timestamp": 1, "artifacts": []},
    )
    workspaces.save_run_meta(
        ws_id, "gc_fresh_ok",
        {"id": "gc_fresh_ok", "tool_id": "mediainfo", "status": "completed",
         "visibility": "success", "timestamp": 9999999999, "artifacts": []},
    )
    res = workspaces.gc_runs(ws_id, older_than_days=3650, dry_run=True)
    assert "candidates" in res and "deleted" in res
    assert res["deleted"] == []
    assert "gc_old_failed" in res["candidates"]
    assert "gc_fresh_ok" not in res["candidates"]
    assert workspaces.get_run_manifest(ws_id, "gc_old_failed") is not None
