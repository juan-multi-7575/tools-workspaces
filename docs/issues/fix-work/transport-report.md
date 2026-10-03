# Backend and API transport report

Implemented #3 transport lifecycle, #4 public errors, #7 backend health, and #10 read cancellation/catalog sharing.

- Added `ApiError(status, code, message)`, `errorMessage`, structured HTTP parsing, and a separate SSE transport module. `runPipelineStream` accepts the specified fourth `{signal, idleTimeoutMs}` argument; default idle limit is 45 seconds. Heartbeats reset the limit. Premature EOF/network failures reject with `STREAM_INTERRUPTED`, stalls with `STREAM_STALLED`, and consumer failures propagate. Reader cancellation/release and abort-listener cleanup run on every exit.
- Added backend heartbeats every 15 seconds and no-buffer/no-cache headers. Transport loss leaves execution available to the backend Stop endpoint while preventing unbounded disconnected event queues. GET `/pipeline/status` and `api.pipelineStatus(workspaceId, signal?)` return `{active:boolean}`. Atomic route reservations reject simultaneous stream/nonstream starts with `PIPELINE_ALREADY_RUNNING` (409). Status polling checks remote execution and refreshes outputs; it does not reattach SSE.
- Added `/api/health` returning `{status:'ok', version:app.version}`, using one backend version source.
- Added sanitized structured errors to HTTP exceptions, unexpected exceptions, SSE events, direct tool results and nonstream pipeline results. Unexpected exceptions log tracebacks. Legitimate artifact paths are preserved. URL preview returns structured dependency/environment errors. Missing branch runs now return `RUN_NOT_FOUND` (404).
- Workspace read helpers accept optional AbortSignal. The catalog request is shared/cached for the session, retries after failure, and cancellation of one consumer does not cancel other consumers.
- Updated existing assertions to retain original missing-input/duplicate-name checks under the new structured error contract.

## Verification

- Initial frontend regression run reproduced premature-EOF success, swallowed consumer exceptions and discarded HTTP status/code. Follow-up reader-disconnect reproduction failed before normalization. Added cancellation, timeout, heartbeat/multiline frames and catalog/read-signal coverage.
- Initial backend test attempt under sandbox hung in FastAPI TestClient's AnyIO portal startup (confirmed with faulthandler); rerunning outside sandbox was required. New URL dependency-code reproduction failed before implementation. Independent review found nonstream errors and remote recovery gaps; three added reproductions failed before fixes.
- `PYTHONPATH=backend .venv/bin/python -m pytest backend/tests -q` outside sandbox: **165 passed, 1 skipped, 1 warning**, 5.58 seconds. Earlier full runs exposed two legacy plain-error assertions and then five tool-result error assertions; these were migrated to status/code/message without dropping behavior checks. The remaining warning is Starlette's existing httpx TestClient deprecation.
- `npm test` (frontend): transport tests pass; final integrated verify run reported **45 passing assertions** (test files changed concurrently).
- Final `npm run verify` passed after the forms owner adapted structured-error consumers: tests and TypeScript succeeded; lint passed with existing/component-export warnings and no errors. Coordinator owns final integrated build and browser checks.
- `git diff --check` found one generated blank-line whitespace occurrence, corrected before delivery.

## Limits

Browser restart/disconnect checks and toolbar recovery are coordinated with the canvas owner. Reconnect status supports polling plus output refresh; live SSE replay is not implemented or claimed. The changes preserve existing artifact-path responses and persisted diagnostic records; sanitization is applied to public execution/error response boundaries rather than rewriting artifact data.
