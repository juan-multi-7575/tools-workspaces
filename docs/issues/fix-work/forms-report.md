# Forms, recovery and health UI

Implemented shared custom-form dispatch in `lib/toolForms.tsx`, with a manifest-schema adapter for unknown tools. Catalog and node inspector both use `ToolForm`; downloader, translator and health canonical IDs and legacy aliases resolve identically. `lib/toolIds.ts` holds pure alias resolution so graph/starter code does not import form UI. Registry lookup checks own properties to avoid accidental inherited-property resolution.

Added reusable error boundaries with Reload view and Copy diagnostics. Catalog and run-dialog JSX renders below their boundary using `BoundaryContent`, keeping their hook state mounted during render recovery. Parameter forms have narrower boundaries; application routes, activity and audio player are isolated. Route navigation clears a failed route boundary. Diagnostics contain a fixed code, view, time, sanitized last error name/message and component stack; credential patterns, URL locations and absolute paths are removed. Raw details are absent from fallback UI. The workspace agent owns separate studio-pane boundaries and preservation of graph state.

Added shared `useHealth` polling of `api.health(signal)`: connecting/online/offline, backend version and host resolved from `API_BASE` or same-origin deployment. App status and both brand version labels use this source. Multiple displays share a poller; last unsubscribe aborts work, generation guards discard stale responses, timeout reports offline, and later successful polling restores online. Timeout closes over its own controller so an old request cannot abort a new poll.

Run URL previews now branch on structured `PREVIEW_UNAVAILABLE` and `DEPENDENCY_UNAVAILABLE` codes. Removed Python exception substring matching; other errors use transport `errorMessage` or a generic lookup failure.

## Verification

- Added regression expectations first: new form-registry tests failed to import the absent registry. Initial shared `npm test` also exposed four concurrently added transport/layout failures before those agents implemented fixes.
- `npm test` after implementation: 33 passing assertions, 0 failures (includes other agents' tests present at that time).
- New seven assertions cover all canonical/alias form mappings, schema fallback rendering and retained values, shared health polling/disconnect/reconnect/teardown, timeout/stale-generation isolation, API host resolution, sanitized diagnostic context and copy/reload behavior.
- `npm run verify` after final recovery-render changes: tests pass; TypeScript fails only in concurrently edited canvas/workspace files. No remaining TypeScript errors in files owned by this task. Coordinator performs final integrated verification.
- `git diff --check` identified three trailing-whitespace lines in concurrent PipelineCanvas work; none in Task 3 files.

## Limits

Recovery tests exercise class lifecycle, fallback rendering, diagnostic copy and child remount generation without a browser DOM. A deliberate browser render throw plus inspection of preserved canvas/parameter state remains an integration check. Health state-machine tests use injected responses; an actual backend stop/restart browser test remains an integration check. Root handles final typography/color token migration and visual inspection of these files after release.

## Integration follow-up

After executeTool adopted structured errors, normalized the failure once through `errorMessage` before it reaches catalog progress/activity state; inspector step output also uses `errorMessage` so structured errors never become `[object Object]`. Added a global boundary around `AppShell`, in addition to its route/activity/player isolation. Hook owners for catalog/dialog remain above their recoverable JSX renderer.

`npm --prefix frontend run verify` after these fixes: exit 0; 45 assertions passed, TypeScript passed, lint reported warnings only (including existing hook dependency warnings and Fast Refresh mixed-export warnings). This replaces the earlier concurrent-build limitation above; browser fault injection remains coordinator-owned verification.
