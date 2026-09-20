# Code Review — Outputs Organization, Error Presentation & Workspace Decongest

**source set:** review
**agent name:** code-reviewer (muse-spark-1.2)
**date:** 2026-09-19
**scope:** `frontend/src/components/workspaces/UnifiedMediaRunsHub.tsx`, `frontend/src/pages/WorkspaceDetailPage.tsx`, `backend/app/workspaces.py`, `backend/app/core/cache.py`
**commit context:** diff against `main` (eae2d1c) — untracked `UnifiedMediaRunsHub.tsx`, `core/cache.py`, modified `WorkspaceDetailPage.tsx` + `workspaces.py`

## Summary

Overall direction is strong: tabbed Latest/Timeline/Files cleans up the former pile-up, failed vs completed separation improves error visibility, and filesystem-verified cache closes a real stale-cache bug. Most issues are correctness edge-cases and React lifecycle traps rather than style. Two blockers around unvalidated glob deletes and cache false-positives, several suggestions around stale closures/effects, and a handful of nits on types and perf.

**What's good:**
- Deduplication by resolved path + `lower_name` removes the duplicated subtitle card regression.
- Browse path skips broken symlinks / zero-byte placeholders instead of surfacing ghost files.
- `relativeTime` + `formatDate` + `dateGroupLabel` give humane recency without heavy deps.
- `prevPipelineIdsRef` avoids dep-loop for auto-focus — right instinct.
- Param-sensitive cache with `stat().st_size==0` guard is a real fix for manual `rm`.

---

## 🔴 Blockers (Must Fix)

### 1. 🔴 Security — Unsanitized glob in media delete allows wildcard expansion
**evidence:** `backend/app/workspaces.py:243`, `backend/app/workspaces.py:251`
```py
for f in runs_dir.glob(f"*/artifacts/{filename}"):
for f in media_dir.glob(f"**/{filename}"):
```
**Why:** `filename` comes from `api.deleteWorkspaceMedia(id, filename)` (user-controlled). If it contains `*`, `?`, `[`, the glob expands. `filename="*"` would match and delete every artifact in every run. `../`-style not caught by glob but still risky.
**Suggestion:** Validate `filename` (`Path(filename).name == filename` and `"/" not in filename`, `glob.escape` or just iterate and exact-match `f.name == filename`). Reject `*?[]` early; return 400. Use `Path(name).name` comparison instead of glob pattern.

### 2. 🔴 Security / Correctness — `mux_subtitles_to_video` subtitle filter injection via `replace(':', r'\:')` insufficient
**evidence:** `backend/app/workspaces.py:503`
**Why:** `-vf subtitles='...'` escapes only `:`. A subtitle path with `'` or `\` or `,` can break out. `paths.resolve_input_file` may return a user-controlled filename with spaces/quotes.
**Suggestion:** Use `subtitles=filename\=` escaping via ffmpeg's `subtitles` filter escaping helper or pass via `subtitles=file='...'` with proper quoting, or better use `ffmpeg -i` + `lavfi`? At minimum `str(s_src).replace("'", r"\'").replace("\\", r"\\")` and wrap properly.

### 3. 🔴 Correctness — Cache false-positive via loose substring stem match
**evidence:** `backend/app/core/cache.py:112`, `backend/app/core/cache.py:125`
```py
input_stem = Path(str(input_path)).stem.lower()
elif input_stem and input_stem in art["name"].lower() and art.get("tool_id")==tool_id
```
**Why:** `video` stem matches any artifact containing `video` (e.g., `video_en.srt` matches `my_video_final.mp4`). A translator run with `input_path=/tmp/a.mp4` could incorrectly claim `b_video.srt` as cache hit, skipping work. Short stems (3-4 chars) amplify.
**Suggestion:** Require exact stem equality or `art["name"].lower().startswith(input_stem + ".")` / `input_stem == Path(art["name"]).stem.lower()` or compare against `art_input` exact match only. Remove substring fallback unless paired with bundle-aware check.

### 4. 🔴 Correctness — Workspace switch leaks `prevPipelineIdsRef` causing spurious auto-switch
**evidence:** `frontend/src/pages/WorkspaceDetailPage.tsx:66`, `frontend/src/pages/WorkspaceDetailPage.tsx:74-85`
**Why:** `prevPipelineIdsRef` is never reset when `id` changes. Navigating A→B: `pipeline_runs` from B are filtered against A's IDs, so every run looks "new", triggering `setView('media_hub')` + banner even though user just opened B. Distracting and interrupts canvas.
**Suggestion:** Add `useEffect(() => { prevPipelineIdsRef.current = new Set(); setJustCompletedRunId(null); setOutputBanner(null); }, [id])`.

---

## 🟡 Suggestions (Should Fix)

### 5. 🟡 Stale closure / Infinite loop — `refreshRuns` depends on `selectedRun`
**evidence:** `frontend/src/pages/WorkspaceDetailPage.tsx:68-96`, `frontend/src/pages/WorkspaceDetailPage.tsx:102`
**Why:** `refreshRuns` lists `selectedRun` in deps, but inside it calls `setSelectedRun`. That recreates `refreshRuns` each time `selectedRun` changes, which re-triggers `useEffect(refreshRuns, [refreshRuns])` → extra fetch loop. Also reads stale `selectedRun` value inside closure rather than latest `runs`.
**Suggestion:** Remove `selectedRun` from deps; use functional check `setSelectedRun(prev => ...)` or a `selectedRunRef`. Pattern:
```ts
const refreshRuns = useCallback(() => { ... if (runs.length>0) setSelectedRun(prev => (!prev || !runs.some(r=>r.id===prev) ? runs[0].id : prev)) }, [id])
```

### 6. 🟡 Effect misuse — `useEffect(refreshRuns, [refreshRuns])` should be arrow wrapper
**evidence:** `frontend/src/pages/WorkspaceDetailPage.tsx:102`
**Why:** Passing `refreshRuns` directly as effect function works but React expects `() => void | cleanup`. If `refreshRuns` ever returned a cleanup, it would be misinterpreted. Lint rules flag this.
**Suggestion:** `useEffect(() => { refreshRuns() }, [refreshRuns])`.

### 7. 🟡 Timer leak — banner `setTimeout` without cleanup
**evidence:** `frontend/src/pages/WorkspaceDetailPage.tsx:83`
**Why:** If component unmounts or new banner replaces old within 8s, prior timer still fires `setOutputBanner(null)` on unmounted component (React warning) and may clear the newer banner early.
**Suggestion:** Store `const timerRef = useRef<number|null>(null)`; clear before setting new one; cleanup in `useEffect` return.

### 8. 🟡 Double fetch on mount — `UnifiedMediaRunsHub` loads media twice
**evidence:** `frontend/src/components/workspaces/UnifiedMediaRunsHub.tsx:130-136`
**Why:** Two effects both call `loadMedia()` on mount: one on `workspaceId`, one on `pipelineRuns.length`. Initial render triggers both.
**Suggestion:** Merge: `useEffect(() => { loadMedia() }, [workspaceId, pipelineRuns.length, highlightRunId])` or debounce. Also wrap `loadMedia` in `useCallback` with proper deps (`highlightRunId`, `pipelineRuns`, `activeMediaPackage.title`) to avoid stale `activeMediaPackage` (see #9).

### 9. 🟡 Stale `activeMediaPackage` inside `loadMedia` closure
**evidence:** `frontend/src/components/workspaces/UnifiedMediaRunsHub.tsx:104-128`
**Why:** `loadMedia` captures `activeMediaPackage` from render at creation time but is called from effects that don't list it as dep. After a refresh that deletes the active package, `stillExists` check may use stale title.
**Suggestion:** Make `loadMedia` a `useCallback` with `activeMediaPackage?.title` dep, or read via ref: `activeMediaRef.current`.

### 10. 🟡 Props mismatch — `runs` prop declared but never destructured/used
**evidence:** `frontend/src/components/workspaces/UnifiedMediaRunsHub.tsx:82-92`, `frontend/src/pages/WorkspaceDetailPage.tsx:312`
**Why:** Interface declares `runs: Run[]` but destructuring omits it; `WorkspaceDetailPage` passes it, so it's silently dropped. Dead prop, confusion with `pipelineRuns`. TS `noUnused` would hide; consumers expect it to matter.
**Suggestion:** Remove `runs` from interface or destructure and use (or document as deprecated). If needed for legacy, alias `const { runs: _runs } = props`.

### 11. 🟡 Timeline delete/log targets wrong step
**evidence:** `frontend/src/components/workspaces/UnifiedMediaRunsHub.tsx:454-458`, `frontend/src/components/workspaces/UnifiedMediaRunsHub.tsx:266`
**Why:** Per-group delete/log uses `group.steps[0].id` unconditionally. For a failed pipeline with 3 steps, the failed step may be `steps[2]`; View Logs should point to `failedStep.id`. Delete will only remove first step's run folder, leaving orphaned artifacts and incomplete group state.
**Suggestion:** `onInspectRun(failedStep?.id || group.steps[0].id)` for failed; for delete, either delete entire `pipeline_run_id` via new endpoint or loop `group.steps.forEach(s=>onRemoveRun(s.id))` and confirm once.

### 12. 🟡 Over-aggressive filename dedup hides distinct outputs
**evidence:** `backend/app/workspaces.py:352-355`
```py
lower_name = f.name.lower()
if lower_name in seen_names: continue
```
**Why:** Common names like `output.mp4`, `transcript.txt`, `subtitles.srt` across different runs: only newest kept, older runs become invisible in Files/Packages. Intent was to fix duplicate cards, but trades correctness for one case. Two legitimate runs producing `output.mp4` from different YouTube URLs will appear as one file.
**Suggestion:** Dedup by `(lower_name, file_size, pipeline_run_id?)` or keep both and dedup only when `resolved` path identical or `bundle_name` identical. If dedup intended strictly for reruns of same source, key by `(lower_name, bundle_name)` or content hash (first 4k).

### 13. 🟡 `detect_existing_artifacts` lenient URL cache ignores `format_preset` intentionally but leaves translator silent failure
**evidence:** `backend/app/core/cache.py:103-106`, `backend/app/core/cache.py:128-129`
**Why:** Comment says downloader allows reuse with different `format_preset`. That's intentional decongest, but for translator `target_lang` must be strict — it is, via `_params_compatible`. However `_params_compatible` ignores `url`/`input_path`, so URL case checks only sig params beyond URL. If node has no sig params (just URL), any completed download for same URL reuses, even if earlier run used different `language` for downstream transcriber that produced artifact with same name. This may be desired, but document edge.
**Suggestion:** Add explicit test for this branch; ensure at least `tool_id` check plus comment clarifies.

### 14. 🟡 Missing `clipboard` guard + promise rejection
**evidence:** `frontend/src/components/workspaces/UnifiedMediaRunsHub.tsx:138-142`
**Why:** `navigator.clipboard.writeText` throws in non-secure context / without permission; unhandled rejection.
**Suggestion:** `navigator.clipboard?.writeText(path).catch(()=>{ /* fallback toast */ })`.

### 15. 🟡 `formatSize` / pagination `filesPerPage` not responsive; `pagedFiles` recomputed every render
**evidence:** `frontend/src/components/workspaces/UnifiedMediaRunsHub.tsx:102`, `frontend/src/components/workspaces/UnifiedMediaRunsHub.tsx:179-180`
**Why:** `filteredFiles.slice(0, filesPage * filesPerPage)` is fine but `filteredFiles` itself filtered inline every render without `useMemo` → O(n) on each keystroke. Small now, scales poorly to 1000s.
**Suggestion:** Wrap `filteredFiles`/`pagedFiles`/`groupedRuns`/`successCount/failedCount` already memoized? Only `groupedRuns` is, others aren't -> memoize.

---

## 💭 Nits (Nice to Have)

### 16. 💭 Type safety — `activeMediaPackage` fallback could be `undefined` not `null`
**evidence:** `frontend/src/components/workspaces/UnifiedMediaRunsHub.tsx:159-170`
```ts
if (!packages.length) return null
if (!latestIsFailed) return activeMediaPackage || packages[0]
return packages.find(p=>p.video) || packages[0]
```
**Why:** When `packages.length===0` returns `null`, else may return `undefined` if `packages.find` fails and `packages[0]` is undefined (shouldn't but type says `MediaPackage | undefined`). `useMemo` return type inconsistent.
**Suggestion:** `|| null` or `?? null` at end.

### 17. 💭 Naming — `WorkspaceDetailPage` `view` union `'pipeline' | 'media_hub'` vs child `activeTab` `'latest'|'timeline'|'files'` — consider enum reuse
**evidence:** `frontend/src/pages/WorkspaceDetailPage.tsx:32`, `frontend/src/components/workspaces/UnifiedMediaRunsHub.tsx:99`

### 18. 💭 Inconsistent error handling — `loadMedia().catch(()=>setLoadingMedia(false))` silences errors
**evidence:** `frontend/src/components/workspaces/UnifiedMediaRunsHub.tsx:127` — show toast or `setError`.

### 19. 💭 `deleteRun`/`removeMediaItem` missing `try/catch` + loading state
**evidence:** `frontend/src/pages/WorkspaceDetailPage.tsx:109-125` — concurrent deletes can race with `refreshRuns`.

### 20. 💭 `dateGroupLabel` uses `toDateString` which is locale-dependent; group labels may collide across years; consider `Intl` or key by `YYYY-MM-DD`
**evidence:** `frontend/src/components/workspaces/UnifiedMediaRunsHub.tsx:62-71`

### 21. 💭 `relativeTime` future timestamps produce negative diff → still shows "just now" ; handle `diff <0` → "in future"
**evidence:** `frontend/src/components/workspaces/UnifiedMediaRunsHub.tsx:52-60`

### 22. 💭 Backend `list_workspace_media` calls `f.stat()` twice (size+mtime) — cache once
**evidence:** `backend/app/workspaces.py:340,360-361`

### 23. 💭 `filesCategoryFilter` counts computed inline via `allFiles.filter` 4× per render — memoize
**evidence:** `frontend/src/components/workspaces/UnifiedMediaRunsHub.tsx:516-519`

### 24. 💭 `outputBanner` forced `setView('media_hub')` may interrupt user mid-draw on canvas — consider opt-in toast with "View Outputs" only, don't force tab switch
**evidence:** `frontend/src/pages/WorkspaceDetailPage.tsx:81`

---

## Checklist against prompt

- [x] correctness, edge cases, error handling — covered #1-4, #8-14
- [x] stale closures, useEffect deps, infinite loops — #5-9
- [x] type safety, null checks — #10, #16
- [x] performance, memory — #8, #15, #22-23
- [x] security — #1-2, glob escaping
- [x] project style — nits #17-24

## Next steps (prioritized)

1. Patch `delete_workspace_media_file` glob sanitization immediately (#1).
2. Reset `prevPipelineIdsRef` on workspace change and fix deps loop (#4, #5).
3. Decide dedup policy for `lower_name` vs package-aware (#12) — product decision.
4. Harden cache substring match (#3) and add tests for `test_22_cache_and_stop.py` covering same-name different-source case.
5. Clean up effects/timers in both frontend files (#6-9).

---
*Generated by code-reviewer agent • no files edited*
