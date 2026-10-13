# Browser accessibility & UI/UX audit — 2026-10-02

> **⚠ STALE — pre-dates redesign merge `b8234442`.** This first-pass CDP audit ran on 2026-10-02, *before* the batch A–E UX redesign merge (`b8234442`) re-landed sub-12px text and raw hex. Its passing typography/overflow/#14 readings describe the **pre-redesign** UI and must not be cited as current-UI evidence. Since this pass: the icon-only close buttons, canvas-node `aria-label`s (`PipelineCanvas.tsx:204`), and the three Settings input labels (`SettingsPage.tsx:164,289,308`) listed as defects 2–4 below are **fixed** (confirmed in the second pass); the standalone-modal focus-trap and WCAG 2.2 gaps remain and are now tracked in GitHub [#2](https://github.com/juan-multi-7575/tools-workspaces/issues/2) / [#3](https://github.com/juan-multi-7575/tools-workspaces/issues/3). **No post-redesign browser audit exists.** Companion second pass: [`browser-a11y-audit-2.md`](browser-a11y-audit-2.md). Standing correction: [`2026-10-13-verification-corrections.md`](2026-10-13-verification-corrections.md) (Correction 3).

Method: browser-harness (CDP) against the dev servers at 1440×900. Real Tab/Enter/Escape key dispatch, accessibility-tree queries, computed-style and contrast measurements, and a backend stop/restart cycle. Screenshots in `/tmp/opencode/a11y-*.png`.

## Verified passing (browser evidence)

- **Landmarks & headings:** `header`/`aside`/`nav`/`main`, exactly one `h1` per view (catalog, studio).
- **Names & labels (catalog):** all 40 buttons have accessible names; no unlabeled inputs; no images without alt; no `aria-hidden` focusables.
- **Sub-12px text (#14):** zero on catalog, workspaces, studio, and settings. Single exception: the 10px "React Flow" attribution watermark (third-party license notice).
- **Horizontal overflow (#14):** none at 1440×900 on catalog, workspaces list, studio, or settings (`scrollWidth === clientWidth`).
- **Focus visibility (#6):** 18/18 sampled Tab stops render a visible outline, settling to `2px solid` caramel (`--color-focus-ring`) + 3px offset. (Computed values initially read as scaled/odd colors — resolved: `transition-all` mid-animation readings plus the host's 1.25 device-pixel-ratio scaling getComputedStyle lengths; an `about:blank` probe confirmed the environment factor.)
- **Keyboard → tool modal:** Tab to a card's Run, Enter opens it; `role=dialog`, `aria-modal=true`, `aria-labelledby`; focus lands on the first field; Escape closes and focus returns to the Run trigger.
- **Keyboard node selection (#6/#9, review fix verified live):** canvas nodes are `tabindex=0 role=group`; Enter selects → inspector switches from the empty state to the selected node's canonical parameter form (DownloaderForm for `media.download.yt-dlp` — also live-verifies #2's registry). Pane click clears selection.
- **Run Pipeline modal:** traps focus correctly (25-stroke cycle stays inside), `aria-modal`, labelled; Escape closes. `role=status` live region present on the backend-run status ("Backend run: idle / Reconnect status").
- **Contrast (WCAG AA):** headings/nav 11.92:1, body copy 6.66:1, cream-on-caramel buttons 4.63:1 — all pass.
- **Health indicators (#7 manual check — now verified):** killed uvicorn → sidebar shows `ENGINE STATUS ● OFFLINE` (red dot), brand shows `VERSION UNAVAILABLE`, catalog shows "Failed to fetch — Unable to connect to the backend tools engine at http://127.0.0.1:8000 … Retry Connection". Restarted backend + clicked Retry → `ONLINE`, `V0.1.0`, "25 Registered Tools" restored.

## Defects found

1. **Standalone tool modal (ToolsPage) does not trap focus.** `aria-modal="true"`, but Tab from "Execute Tool" escapes to the background (Activity & Records → sidebar nav → page). The Run Pipeline modal traps correctly — the two modal implementations are inconsistent. WCAG 2.4.3 / WAI dialog pattern.
2. **Icon-only close buttons lack accessible names** (screen reader announces "button"):
   - `frontend/src/components/pipeline/UniversalPipelineRunModal.tsx:566` — modal close X
   - `frontend/src/pages/ToolsPage.tsx:408` — search-field clear X
   - `frontend/src/pages/ToolsPage.tsx:982` — tool modal close X
3. **Canvas nodes have no accessible name.** `role="group"` with empty `aria-label`; AT hears an unnamed group. Should carry the tool name (e.g. `aria-label="Media Downloader"`).
4. **Settings: 3 unlabeled inputs.** The number input beside "Save", the Browser Cookies Extraction select, and the Player Client Preset select have visible section headings but no programmatic association (`label for` / `aria-labelledby`).
5. **88 tab stops before the first canvas node.** The 28-item tool palette dominates the tab order (each item contributes expand/add stops). Not a hard WCAG failure, but a significant keyboard-usability burden; consider a skip link, landmark jumping, or roving tabindex in the palette.
6. **Escape-to-deselect was inconsistent across two trials** (cleared once, persisted once). Pane click reliably clears. Worth a focused re-check of the Escape handling path.
7. **Nit:** the enabled Run button computes `cursor: default` instead of `pointer`.

## Not exercised in this pass

Real pipeline execution (needs a media URL), error-boundary throw injection (#5 manual check), branch-and-rerun flow (#13 manual check), and screen-reader output (NVDA/VoiceOver). The first Tab-through of the full keyboard run (`Tools → modal → run → workspace → select → edit → run`) stopped before execution.
