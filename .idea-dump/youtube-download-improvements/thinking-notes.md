# Thinking Notes — YouTube Download Improvements

## Status: In progress (Green phase implementation)

## Decisions confirmed by user
1. Shared downloader module (tools + dataset profiles) — YES
2. Dataset playlist → one Source per video — YES
3. Root CLI uses shared downloader module — YES
4. Real-time SSE progress — YES
5. Tools: any host; Sources: YouTube validation — YES

## Green phase — downloader.py DONE
- `build_ydl_opts(url, profile="tools|dataset", **opts)` ✓
- `download_with_options(url, outdir, options, progress_queue, cancel_event)` ✓
- `download_source(url, outtmpl, audio_quality, progress_queue, cancel_event)` ✓
- `download_to_temp(url, cancel_event, audio_quality, progress_queue)` ✓
- `make_progress_hook(progress_queue, cancel_event)` ✓
- `cleanup_partial_files(dir)` ✓
- `extract_metadata(info)` ✓
- `download_from_youtube` kept as backward-compat alias ✓
- Tests: 18 passing ✓

## Next: tasks.py + main.py (progress streaming + per-task cancel)
- tasks.py: enqueue creates per-task cancel_event + progress_queue in task dict
- tasks.py: cancel_task sets per-task event, not shared
- main.py: _run_job drains progress_queue via background coroutine
- main.py: _run_project_download and _run_tools_download pass progress_queue + cancel_event
- main.py: SSE endpoint emits percent/eta/speed
- SSE poll interval: reduce from 1s to 0.1s for responsiveness

## Test changes needed
- test_sources.py: _fake_download needs to accept progress_queue kwargs
- test_tools.py: fake_download_with_options needs to accept progress_queue + cancel_event
- test_download_manager.py: add per-task cancel + SSE progress tests

## Implementation order
1. Write tests (red) for tasks.py + main.py changes
2. Update tasks.py (per-task cancel_event)
3. Update main.py (drain queue, pass to downloaders, SSE)
4. Update existing tests for new signatures
5. Run full suite
6. Then: playlist expansion in Sources endpoint
7. Then: root CLI unification
8. Then: full test suite
