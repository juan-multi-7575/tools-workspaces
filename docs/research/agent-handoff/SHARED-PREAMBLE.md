# SHARED PREAMBLE — paste this above every batch prompt

You are building standalone tool sites for a local multi-tool platform. Everything you need
is in the repo. You have **no prior context**; read the files named here before writing code.

## Repo and where things are

Repo root: `tools-workspaces/`
Frontend: `tools-workspaces/frontend/`
Backend: `tools-workspaces/backend/` (FastAPI, running on `:8000` — **do not modify it**)

## Read these first, in this order

1. `tools-workspaces/docs/research/design-briefs.md` — the brief for **your** tools, plus the
   shared rules at the top. This is the design contract. Follow it literally.
2. `tools-workspaces/docs/research/design-references/<ref>/` — 4 screenshots of the assigned
   reference site. **Open and study the images.** They are the visual source of truth, not the
   brief text.
3. `tools-workspaces/docs/superpowers/plans/2026-10-04-rebuild-decision-record.md` — decisions
   D1–D15.
4. `tools-workspaces/docs/research/imagemagick-workflow-audit.md` — **known issues in the
   template you must not inherit.** Read the "Carried to every site" list especially.
5. The template itself: `frontend/src/sites/imagemagick/` and `frontend/src/sites/home/`.
   Copy its structure. Do not copy its palette — yours is different on purpose.

## What a tool site is

A **standalone site**, not a page in an app shell.

- **Zero Tools Garage chrome.** No sidebar, no topbar, no Platform nav, no "Tools Garage"
  wordmark. If you render the words `Tools Garage`, `Workspaces`, `Remote` or `ENGINE STATUS`
  anywhere, you have failed the brief.
- **Two full-viewport states.** `hero` (an intro that says what the tool does and offers exactly
  two ways in) and `workspace` (the working view). Modelled on
  `image-to-pdf-standalone/src/components/HeroPage.tsx`, which is at `../image-to-pdf-standalone/`
  relative to the download root — one level above `tools-workspaces/`. Match its **structure**
  (full-viewport, title, short description, two actions), not its visual style.
- **A home affordance** in the workspace returning to `/`.
- Design is chosen for **quality and uniqueness**, not to match the tool's function — but every
  concept is also held to: *does this make the task clear and completable?* Flag a concept that
  fights its function instead of shipping something pretty and confusing.

## Registration — copy this exactly

Each tool is its own directory with a `site.ts`. This is the ONLY file outside your tool's own
directory that you touch, and it means nothing shared needs editing.

`frontend/src/sites/<tool>/site.ts`:
```ts
import { lazy } from 'react'
import type { SiteModule } from '../types'

const SoxSite: SiteModule = {
  toolId: 'sox',            // must equal manifest.id exactly
  path: 'sox',              // route segment under /t/
  accent: '#E8A33D',        // from your brief
  Component: lazy(() => import('./SoxSite')),
}

export default SoxSite
```

Do **not** edit `siteModules.ts`, `registry.ts`, `App.tsx`, `AppShell.tsx`, or anything in
`src/lib/` or `src/hooks/`. `import.meta.glob` discovers your `site.ts` automatically and the home
index picks it up. If you think you need a shared change, stop and report it.

Your files: `src/sites/<tool>/<Tool>Site.tsx`, `Hero.tsx`, `Workspace.tsx`, `<tool>.css`,
`site.ts`, plus `src/tests/<tool>Site.test.tsx`.

## Reuse what exists — do not rebuild it

| Need | Import from |
|---|---|
| Real execution | `useToolExecute(toolId)` → `{ state, busy, run, reset, cancel }` — `src/hooks/useToolExecute.ts` |
| Dependencies + install gate | `useToolDeps(toolId)`, `<DependencyGate>` — `src/hooks/useToolDeps.ts`, `src/components/deps/DependencyGate.tsx` |
| Result rendering | `<ToolResultPanel>` — `src/components/tools/ToolResultPanel.tsx` |
| API | `api`, `resolveUrl`, `errorMessage` — `src/lib/api.ts` |
| Manifest | fetch it; do not hardcode the schema |

## Hard requirements

- **Every** key in the tool's `parameters_schema` surfaced as a labelled control bound to that
  exact key. Fetch the real manifest — never assume the params.
- **`data-param-key="<name>"` on every parameter control.** Tests assert on it.
- **Dependency gate pinned** so its Install control is always in the viewport. It inherits
  **your** palette, not the old cream/caramel tokens.
- **No fabricated status, size or version.** No swallowed errors — show backend text verbatim
  via `errorMessage()`. **No invented progress percentages** — measured elapsed seconds only.
- **The page must not narrate its own honesty.** Delete copy like "nothing is drawn here that
  the backend has not actually been handed" or "this is not a placeholder". If it is honest, it
  does not get to say so. Two copy strings in the template were factually *wrong* and reading
  the code did not catch either — **verify every factual claim against a real run.**
- **Fonts free or system only** (Google Fonts / SIL OFL). Several references use commercial
  faces; each brief names a free substitute.
- **Scoped CSS.** Prefix every class with your tool's own prefix so designs cannot leak.

## Known issues you must NOT inherit

From `imagemagick-workflow-audit.md`:

1. **Never lose a user's output.** If a backend writes a fixed filename, do not build UI that
   pretends otherwise — and report it.
2. **Never change something silently.** Any setting that alters the output must be visible
   *before* the run.
3. **Never show a stale result as if it were current.** Change a setting after a run and the
   displayed result is stale — say so.
4. **One error, one place.** The template renders the same error twice.
5. **A control's label must match what it does.** The template's "Clear" kept half the state.
6. **The largest visible target must accept the drop.**
7. Paste support where a path/URL makes sense.

## Verifying in a browser — required, and there are two traps

Chrome 136+ blocks remote debugging on the default profile. Launch a dedicated instance:

```bash
pgrep -c chrome >/dev/null || (setsid /opt/google/chrome/chrome \
  --remote-debugging-port=9222 --user-data-dir=/tmp/opencode/chrome-<yourname> \
  --no-first-run --disable-dev-shm-usage --disable-gpu about:blank \
  < /dev/null > /tmp/opencode/chrome-<yourname>.log 2>&1 & disown)
```

**Trap 1 — always pass `BU_CDP_URL`**, or the harness fails with `chrome-not-running`:
```bash
BU_CDP_URL=http://127.0.0.1:9222 browser-harness <<'PY'
```

**Trap 2 — activate the tab after every navigation**, or screenshots hang for 60s and time out:
```python
def act():
    ps=[t for t in cdp("Target.getTargets")["targetInfos"] if t["type"]=="page"]
    if ps: activate_tab(ps[0]["targetId"])
goto_url(url); wait_for_load(); act(); time.sleep(2.5)
p = capture_screenshot(path=f"{out}/{name}.png", max_dim=1600)
```

Check hero **and** workspace at **1440×900 and 390×844**. Assert:

```python
# zero horizontal overflow
len([e for e in document.querySelectorAll('main *')
     if e.scrollWidth > e.clientWidth + 6 and getComputedStyle(e).overflowX == 'visible']) == 0
# Install control in viewport when deps are missing
btn = [b for b in document.querySelectorAll('button') if 'install' in b.innerText.lower()]
btn and btn[0].getBoundingClientRect().bottom <= window.innerHeight
# no Tools Garage chrome
'Tools Garage' not in document.body.innerText
# text contrast: check your own ink tokens against their surfaces
```

Take screenshots **into the project** at `docs/research/batch-<X>/<tool>/` and **actually look
at them**. A passing measurement is necessary, not sufficient — open the images and confirm the
page reads as its assigned reference.

## Also required

- **Run the tool for real** with a real small fixture and paste the actual response. A page
  that has never executed its tool is not finished.
- **Tests:** `src/tests/<tool>Site.test.tsx` with `node:test` + `renderToStaticMarkup` (see
  `src/tests/imagemagickSite.test.tsx`). Assert: hero renders its two actions; workspace renders
  a control with `data-param-key` for **every** manifest key; no Tools Garage chrome.
- `cd frontend && npm run verify` must pass. Baseline is **125/125** — do not regress it.
- Commit per tool, explicit paths. **Never `git add -A`.**

## Report back

Per tool: files, commit hash, how your design maps to its reference (and where you diverged
and why), the measured numbers (overflow, Install-in-viewport, contrast), what the real run
returned, a screenshot review note, `npm run verify` output, and **anything you could not do
truthfully** — an unavailable binary, an unimplemented param, an unverified claim. Say it
plainly rather than shipping something that looks finished and is not.