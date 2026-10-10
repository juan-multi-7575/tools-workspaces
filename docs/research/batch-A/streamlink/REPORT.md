# Streamlink — Batch A

Files: `frontend/src/sites/streamlink/{StreamlinkSite.tsx,Hero.tsx,Workspace.tsx,site.ts,streamlink.css}` and `frontend/src/tests/streamlinkSite.test.tsx`.

Reference: NASA. Institutional blue-black, wide Archivo authority, Public Sans data, large state board, white control ink and a single orange-red alarm. No NASA branding or unrelated space imagery; this status board has no feed image until a recording exists. OFF AIR renders the real error once. Cancellation, a streamlink timeout before fallback, or an artifact-read failure do not falsely claim both CLIs ran.

Measurements: hero/workspace at 1440×900, 768×1024, 390×844: zero overflowing elements, no page overflow, no forbidden chrome. Install bottom: 873/900, 997/1024, 819/844. A real installation failure initially pushed Retry below the phone viewport; the scoped dock was corrected and all three retry measurements now pass. Contrast: near-white/ground 17.36:1; secondary/ground 9.92:1; blue-black/alarm red 5.55:1.

Real execution: `real-run.json` is the actual response for `http://example.com/live`: failed, no artifacts, truthy error: a traceback ending `ModuleNotFoundError: No module named 'yt_dlp'`. `missing-run.json` records the same failure for an invalid URL. The real backend test test_streamlink_standalone passed (backend-test.txt). The OFF AIR renderer is tested against the actual returned error, plus the invariant that completed status without a verified artifact never renders CAPTURED.

Availability: installation through the pinned control failed. The API's verbatim message is `micromamba exited with 1: critical libmamba Could not solve for environment specs`. The full installer events show `streamlink =* * does not exist (perhaps a typo or a missing channel)`. This stops the batch before yt-dlp installation. The page shows that real install error and leaves capture disabled. No recording or successful capture was fabricated.

Screenshot review: opened all six hero/empty workspace views and desktop/phone real installation-failure views. Wide status, clear URL intake, strong institutional typography. The mobile dock keeps Retry visible, while dependency notes and error text scroll within it.

Verification: npm run verify passed: 136/136 tests, TypeScript passed, lint passed with 20 existing warnings. git diff --check passed. Backend focused test: 1 passed, 7 deselected, one existing Starlette warning.

Limitations: real successful capture and binary snapshot/download behavior could not be exercised because the managed streamlink package is unavailable. A tiny real HLS fixture was generated and served at localhost:8765, but no installed capture binary could process it. The success path fetches the returned artifact from disk, checks HTTP success and nonempty bytes, and only then permits CAPTURED. The backend overwrites stream.mp4; saved downloads retain byte snapshots only until leaving/reloading. Large recordings require enough browser memory. Backend unchanged.
