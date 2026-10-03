# Browser accessibility & UX audit — second pass (2026-10-02)

Method: browser-harness (CDP) against the dev servers (`http://127.0.0.1:5173/`, backend `http://127.0.0.1:8000/`). Real `press_key` Tab/Enter/Escape, `Accessibility.getFullAXTree` probes, computed-style color measurements (contrast computed from foreground/background values), coordinate clicks, `Emulation.setDeviceMetricsOverride` for 1440×900 / 320 / dpr=2. Screenshots under `/tmp/opencode/audit2-*.png`. Harness notes: (1) `press_key("Tab")` only moved focus after `cdp("Target.activateTarget", targetId=…)` to re-foreground the tab — done before every keyboard probe; (2) catalog lives at `/` (`/tools` redirects to `/`); (3) the dpr=2 screenshot tiles 2×2 (harness artifact), so zoom checks were verified via bounding-box probes instead.

## Verified passing (with measured evidence)

**Theme & contrast**
- Text color palette is consistent across Tools (105 muted + 74 espresso), Workspaces, Remote, Settings views: only `rgb(78,34,15)` (espresso), `rgb(124,83,57)` (caramel-text), `rgb(253,251,247)` (cream-light), `rgb(168,50,50)` (error). No stray off-palette text colors observed.
- Contrast measurements (computed from live `getComputedStyle` values):
  - muted caramel-text on cream: **5.90:1** (AA pass)
  - chip "55" caramel-text on cream-dark `#EDE5CD`: **5.29:1** (pass)
  - error text `#A83232` on cream: **5.87:1** (pass)
  - disabled button espresso on cream-dark: **10.7:1** (pass)
  - error trace `#FF9999` on `#231212` (`--color-surface-dark-red`): **8.8:1** (pass)
  - neon `--color-wave-accent #3EF50B` on dark: **9.87:1** (pass)
- Focus indicator visibility (measured outline vs. adjacent background, WCAG 1.4.11/2.4.13 3:1 bar):
  - Caramel "Run" buttons: cream-light `rgb(253,251,247)` 2.4px outline on caramel `rgb(157,102,56)` — **4.63:1** (pass)
  - Sidebar nav (incl. active item): caramel outline 1.6px, 2.4px offset; offset places it on the cream sidebar — **4.23:1** (pass)
  - Settings textboxes/selects on white: caramel outline — **4.78:1** (pass)
  - (`outline: none` briefly read on the Player Client Preset select mid-`transition-all` — re-measured after settle as the same caramel ring; **not a defect**.)

**Reflow / zoom**
- 1440×900: `scrollWidth === clientWidth` on Tools, Workspaces, Remote, Settings, `/workspaces/subaudit`.
- 320px wide: no horizontal overflow on all five views.
- dpr=2 at 1440×900 (200%-zoom approximation): no overflow; artifacts dock bottom 871px and Activity pill bottom 880px both within the 900px viewport.

**Navigation**
- Deep-linking: a direct load of `/workspaces/subaudit` restores the Workbench (h1 "Workbench", "2 nodes · 1 edge", palette + inspector). Sane.
- Breadcrumb on workspace detail: "← Workspaces /" link → `/workspaces` (breadcrumb present).
- All four sidebar routes (Tools, Workspaces, Remote, Settings) render real views.
- Workspace switcher (`subaudit` button) opens a session menu via mouse; items are native buttons; **Escape closes it**.
- Activity & Records drawer **closes on Escape**; its close affordance is named "Close activity panel".
- Tool modal, Run Pipeline modal: Escape closes; focus returns (tool modal — Escape verified from dialog and from body).

**Empty/loading/error surfaces**
- Media, Runs & Assets tab: renders explicit empty states — "0 runs · 0 files · 0 successful · 0 failed · 0 packages", "No outputs yet", empty Timeline/Files lists.
- Artifacts dock expanded: "Packages (0) / All Files (0) / Execution Runs (0)" tabs with zero-state content.
- Tool modal execution shows a labeled in-progress state ("Executing… Validating parameters & preparing runtime environment… 29%").
- `role="alert"` present in ErrorBoundary and on the canvas-persistence failure banner.

## Defects found

1. **Standalone tool modal: focus never enters the dialog; Tab is dead while it is open.** When the tool modal opens from the catalog, `document.activeElement` lands outside the dialog (on the catalog search input); subsequent Tab presses cycle through background controls (background nav/category chips), i.e. no focus trap and no initial focus placement — exactly the class of issue concurrent fix (a) targets, so this may still be in progress. WCAG 2.4.3 / dialog pattern. Escape does close the modal (verified from inside the dialog and from body).
2. **No `prefers-reduced-motion` handling anywhere** — zero matches for the media query in `frontend/src`, while `transition-all` is used pervasively (≥10 components). Users with reduced-motion preferences still get all hover/transform transitions. WCAG 2.3.3 / 2.2.2 (motion).
3. **Placeholder text fails contrast.** Search input placeholder renders effective color `rgb(173,146,123)` (placeholder declared `oklab(0.480955 … / 0.6)` over cream) vs. cream `rgb(247,241,222)` = **2.59:1** < 4.5:1. WCAG 1.4.3.
4. **`document.title` is static** ("🐴 Tools Garage") on all routes — no per-route titles. WCAG 2.4.2 weak (page titled, but not descriptive per view).
5. **No skip-to-content link** anywhere in the shell; keyboard users must Tab through sidebar + palette (first audit counted 88 stops to the canvas) before reaching main controls. WCAG 2.4.1.
6. **Workspace switcher button has no popup semantics** — `aria-haspopup`, `aria-expanded`, `aria-controls`, and a menu/listbox role are all absent; the menu items are reachable by Tab and Escape closes it, but screen readers get no collapsed/expanded state. WCAG 4.1.2.
7. **Artifacts dock does not close on Escape** — inconsistent with the activity drawer, switcher, and both modals which do. (Dock toggle from the closed state still works; this is a consistency defect, not a blocker.)
8. **Activity & Records drawer is not exposed as a dialog** — no `role="dialog"`/`aria-modal`/`aria-labelledby` in the AX tree despite being a modal-style overlay panel; AT announces no dialog context. WCAG 4.1.2.
9. **Touch targets below the WCAG 2.5.8 24×24 CSS-px minimum** (measured via `getBoundingClientRect`):
   - "Workspace Artifacts Dock" toggle: 229×**16**
   - "Reconnect status": 103×**16**
   - node "Remove tool from canvas" ×2: **20×20**
   - "Refresh artifacts": **22×22**
10. **Tool-form validation errors are not announced**: submitting the AI Audio Stem Separator form with an empty required `input_path` produces "input_path is required" only as static error-trace text — no `role="alert"`/`aria-live` anywhere in the tool modal, and no client-side required-field gate before execution. Settings page similarly has no client-side validation messaging surface (the number input saves without a visible error state). WCAG 3.3.1 / 4.1.3.
11. **QR code on the Remote page has no accessible name**: `<svg role="img" width=140 height=140>` with no `aria-label` — AT announces "image" with no description. The connection URL is duplicated in adjacent text, so impact is moderate. WCAG 1.1.1.
12. **App shell shows a completely blank white page with no loading indicator** while assets/data stream in under a throttled connection (offline=false, latency=1500ms, 30KB/s); `document.body.innerText` was empty for ≥1.2s and the screenshot is a blank white viewport. WCAG 2.2.1-adjacent UX gap.
13. **Nit (carry-over):** first audit's nit about `cursor: default` on the enabled Run button not re-verified; Escape-to-deselect on canvas remains unexercised this pass.

## Confirmations of the four concurrent fixes (live status)

- **(a) Tool modal focus trap: NOT yet confirmed.** Focus still lands outside the dialog and Tab still escapes to background controls; fix may be mid-edit. Escape does close the modal (verified).
- **(b) Icon-only close buttons: CONFIRMED fixed.** Tool modal X is now accessible-name "Close"; activity panel X is "Close activity panel"; nav menu toggles are "Open navigation menu"/"Close navigation". No unnamed `×` buttons remain in the catalog or studio views.
- **(c) Canvas node aria-labels: CONFIRMED fixed.** Pipeline nodes now expose `role="group"` with real names — "Media Downloader", "Audio Transcriber"; edge groups carry "Edge from downloader-1 to transcriber-2".
- **(d) Settings input labels: CONFIRMED fixed.** The concurrency spinbutton now speaks "Download queue concurrency"; the Browser Cookies and Player Client selects now carry their section labels ("Browser Cookies Extraction (`--cookies-from-browser`)", "Player Client Preset (`--extractor-args`)").

## Not tested

- Real pipeline execution and run-failure handling beyond the idle/empty states (no media URLs used, per instructions).
- Screen-reader output (NVDA/VoiceOver) — semantics inferred from the AX tree only.
- Per-component motion magnitude with `prefers-reduced-motion: reduce` emulated (absence of any media query verified by source scan, so emulation would only re-confirm missing behavior).
- The waveform editor surface (needs a media URL) and its dark-surface focus ring.
- The "Media, Runs & Assets" error and loading states (tab showed empty states only).
- The exact first-audit item "Escape-to-deselect on canvas" (inconsistent once in pass 1) — not re-exercised; second-audit keyboard path on the canvas focused nodes via Tab rather than re-litigating it.
