# SHARED PREAMBLE — paste this above every batch prompt

You are building standalone tool sites for a local multi-tool platform. Everything you need
is in the repo. You have **no prior context**; read the files named here before writing code.

## Repo and where things are

Repo root: `tools-workspaces/`
Frontend: `tools-workspaces/frontend/`
Backend: `tools-workspaces/backend/` (FastAPI, running on `:8000` — **do not modify it**)

---

## BEFORE YOU WRITE ANY CODE — set yourself up

**Several of these prompts are meant to run in parallel.** Running them in one shared checkout
does not work, for three concrete reasons:

1. **`git index.lock` contention.** Two agents committing at once — one gets
   `fatal: Unable to create '.git/index.lock'`. Commits fail at random.
2. **Port collision.** `npm run dev` defaults to `:5173`. The second agent gets "Port 5173 is
   already in use" and silently moves on, then screenshots the wrong server.
3. **Shared `tsc` cache.** `tsc -b` writes `node_modules/.tmp/*.tsbuildinfo`. If several
   worktrees share one `node_modules`, they overwrite each other's incremental build state and
   produce spurious type errors that are not real.

So each agent gets its own git worktree, its own port, and its own `node_modules`.

### Step 1 — check whether you are already in a worktree

```bash
git rev-parse --show-toplevel            # your frontend/frontend root
git worktree list | grep "$(pwd)"        # non-empty => already isolated, skip to Step 3
```

### Step 2 — if you share the main checkout, create one

Your batch letter is given in your own prompt. Substitute it below.

```bash
cd "$(git rev-parse --show-toplevel)"
BATCH=A   # <-- your batch letter
MAIN="$(pwd)"

# A full checkout. Do NOT symlink node_modules: the shared tsc build cache is a
# real source of cross-agent corruption (see the note above).
git worktree add "../wt-batch-$BATCH" -b "sites/batch-$BATCH" HEAD
cd "../wt-batch-$BATCH/frontend" && npm install
```

Then **work from that directory for the rest of the session.** Every `cd` in the steps below
means the worktree's `frontend/`, not the main checkout's.

### Step 3 — start your dev server on YOUR port

Use the port from your own prompt. Do not use the default 5173 — another agent has it.

```bash
npm run dev -- --port 5174     # A: 5174 · B: 5175 · C: 5176 · D: 5177 · E: 5178
```

Verify it is the server you think it is before you trust any screenshot:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5174/t/<yourtool>
```

### Step 4 — the backend is shared

One backend on `:8000` serves every agent, because the backend is not being changed. If it is not
running, start it once from the **main** checkout:

```bash
cd "$(git rev-parse --show-toplevel)/../tools-workspaces/backend"  # or your main checkout
../.venv/bin/python -m uvicorn app.main:app --port 8000
```

### If you were *not* given a worktree and cannot create one

Work in the checkout you have, but **do not commit**. Report your changed file paths instead and
let a human commit. Concurrent `git add` from several agents in one checkout will stage each
other's half-finished work.

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

## Verifying in a browser — required, and there are three traps

**Trap 0 — you need your OWN Chrome.** Five agents sharing one browser is the worst failure mode
here, because it is *silent*: `activate_tab` picks the first tab it sees, so if another agent has
a tab open you will screenshot and measure **their page** and report numbers for a site you never
opened. Two agents cannot share a `--user-data-dir` either — the second Chrome refuses to start.

Your batch letter gives you your own debugging port and profile:

| Batch | CDP port | profile dir | dev server port |
|---|---|---|---|
| A | 9222 | `/tmp/opencode/chrome-batch-A` | 5174 |
| B | 9223 | `/tmp/opencode/chrome-batch-B` | 5175 |
| C | 9224 | `/tmp/opencode/chrome-batch-C` | 5176 |
| D | 9225 | `/tmp/opencode/chrome-batch-D` | 5177 |
| E | 9226 | `/tmp/opencode/chrome-batch-E` | 5178 |

Launch yours (substituting your own values — Chrome 136+ blocks remote debugging on the default
profile, so a dedicated `--user-data-dir` is mandatory):

```bash
setsid /opt/google/chrome/chrome \
  --remote-debugging-port=9222 --user-data-dir=/tmp/opencode/chrome-batch-A \
  --no-first-run --disable-dev-shm-usage --disable-gpu about:blank \
  < /dev/null > /tmp/opencode/chrome-batch-A.log 2>&1 & disown
sleep 8
curl -s http://127.0.0.1:9222/json/version | head -2   # must print your Browser line
```

**Trap 1 — always pass `BU_CDP_URL` with YOUR port**, or the harness fails with
`chrome-not-running` (it only auto-discovers standard profile dirs):

```bash
BU_CDP_URL=http://127.0.0.1:9222 browser-harness <<'PY'
```

**Trap 2 — activate the tab after every navigation**, or screenshots hang for 60s and time out.
And after `goto_url`, activate **the tab you are on** — not blindly index 0:

```python
def act(target_id=None):
    ps=[t for t in cdp("Target.getTargets")["targetInfos"] if t["type"]=="page"]
    if ps:
        pick = next((t for t in ps if t.get("targetId")==target_id), ps[0])
        activate_tab(pick["targetId"])
```

Always `new_tab(url)` for your **first** navigation in a session, then `goto_url` after that.
Confirm you are on the right page before trusting anything:

```python
assert "localhost:5174" in js("location.host")   # your dev server port
```

Check **hero and workspace** at **1440×900 and 390×844** (add **768×1024** if your layout has
any multi-column region). Assert:

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