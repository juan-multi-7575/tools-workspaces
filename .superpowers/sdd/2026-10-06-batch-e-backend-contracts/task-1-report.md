# Task 1 report: downloader byte events

## Changes

- Added a yt-dlp `--progress-template` that emits its reported percentage, `downloaded_bytes`, `total_bytes`, speed, and ETA in a parseable download event.
- Extended `_parse_progress` to preserve the existing status/percent/speed/ETA fields and include byte fields only when yt-dlp provides actual integer values. An unknown total (`NA` or `None`) is omitted; bytes are never inferred from percent.
- Added tests for known downloaded/total bytes and an unknown total.

## Verification

- TDD check: before the implementation, both new tests failed because byte fields were absent (20 existing tests passed).
- `PYTHONPATH=backend uv run --with pytest --with fastapi --with httpx --with pydantic --with click pytest backend/tests/test_04_downloader.py -q`: **22 passed**.
- `PYTHONPATH=backend uv run --with pytest --with fastapi --with httpx --with pydantic --with click pytest backend/tests -q`: **227 passed, 1 skipped**.
- `git diff --check`: passed.
- The bare `pytest` executable was unavailable; tests were run through `uv`. The first full-suite collection attempt also showed `click` was missing, so the successful regression run included it.

## Scope

Only `backend/app/tools/downloader.py` and `backend/tests/test_04_downloader.py` are included in the commit. The existing unrelated `frontend/src/sites/downloader/downloader.css` edit was left untouched.

## Reviewer follow-up: percent in downloaded filename

- Anchored percentage parsing to the start of the `[download]` progress event so a percent sign elsewhere in a filename cannot be mistaken for the progress value. Kept byte parsing anchored to the same progress field.
- Added a parser regression asserting `/tmp/50% off.mp4 has already been downloaded` is not progress, and changed the existing already-downloaded integration test to use `50% off.mp4`, confirming the file is still detected and returned.
- Regression reproduced before the parser fix: the parser test failed with `{'status': 'downloading', 'percent': 50.0}`, and the existing-file test returned no files. After the fix and expected filename update, the focused module passed.
- Command: `PYTHONPATH=backend uv run --with pytest --with fastapi --with httpx --with pydantic --with click pytest backend/tests/test_04_downloader.py -q`
- Output: `23 passed, 1 warning in 1.16s` (the warning is Starlette's httpx deprecation warning).
- `git diff --check`: passed.

## Reviewer follow-up: distinguish progress from percent-bearing filenames

- Added the explicit `__YTDLP_PROGRESS__` marker to the configured `--progress-template`; `_parse_progress` now requires that marker before interpreting progress fields. This prevents arbitrary yt-dlp `[download]` messages and filenames from becoming progress events.
- Updated progress-line fixtures to represent the configured output. Parser coverage confirms absolute (`/tmp/50% off.mp4`) and relative (`50% off.mp4`) already-downloaded messages are ignored as progress.
- Parameterized the already-downloaded integration test over absolute and relative reported paths for `50% off.mp4`, confirming both are still detected and returned.
- Command: `PYTHONPATH=backend uv run --with pytest --with fastapi --with httpx --with pydantic --with click pytest backend/tests/test_04_downloader.py -q`
- Output: `24 passed, 1 warning in 0.88s` (the warning is Starlette's httpx deprecation warning).
