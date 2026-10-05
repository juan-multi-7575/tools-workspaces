# Worktree Setup — Parallel Tool-Site Builds

One worktree per batch. Each agent builds only the tool directories in its batch, so the five
worktrees never touch the same file.

## Why one worktree per batch

Site registration is **automatic**: `frontend/src/sites/siteModules.ts` discovers
`src/sites/*\/site.ts` with `import.meta.glob`. Building a tool is therefore a change confined
to one directory. There is no shared registry to edit, so parallel agents cannot collide.

> This was a deliberate change. The previous design had every site edit `registry.ts` and
> `App.tsx`, which five parallel branches would all have conflicted on.

## Setup

From the repo root (`tools-workspaces/`):

```bash
BASE=$(git rev-parse --abbrev-ref HEAD)     # whatever you are on now
for B in A B C D E; do
  git worktree add "../wt-batch-$B" -b "sites/batch-$B" "$BASE"
done
git worktree list
```

Each worktree is a full checkout and needs its own `node_modules`.

> **Do not symlink `node_modules`.** It looks like a harmless speed-up, but `tsc -b` writes its
> incremental cache to `node_modules/.tmp/*.tsbuildinfo`. Five worktrees sharing one
> `node_modules` overwrite each other's build state and produce type errors that are not real —
> the worst kind of failure, because it sends agents chasing bugs in their own code.

```bash
for B in A B C D E; do
  (cd "../wt-batch-$B/frontend" && npm install)
done
```

## Ports — one per worktree, so all five can run at once

The backend is shared (one instance on `:8000` for everyone). Vite needs separating, and so does
**Chrome** — five agents sharing one browser is a silent failure, because `activate_tab` picks the
first tab it sees and you will measure another agent's page.

| Batch | worktree | dev server | Chrome CDP port | Chrome profile |
|---|---|---|---|---|
| A | `../wt-batch-A` | 5174 | 9222 | `/tmp/opencode/chrome-batch-A` |
| B | `../wt-batch-B` | 5175 | 9223 | `/tmp/opencode/chrome-batch-B` |
| C | `../wt-batch-C` | 5176 | 9224 | `/tmp/opencode/chrome-batch-C` |
| D | `../wt-batch-D` | 5177 | 9225 | `/tmp/opencode/chrome-batch-D` |
| E | `../wt-batch-E` | 5178 | 9226 | `/tmp/opencode/chrome-batch-E` |

```bash
# one dev server per worktree
for pair in "A:5174" "B:5175" "C:5176" "D:5177" "E:5178"; do
  B="${pair%%:*}"; PORT="${pair##*:}"
  (cd "../wt-batch-$B/frontend" && nohup npm run dev -- --port "$PORT" > "/tmp/opencode/vite-$B.log" 2>&1 &)
done

# one Chrome per worktree — a shared --user-data-dir makes the second Chrome refuse to start
for pair in "A:9222" "B:9223" "C:9224" "D:9225" "E:9226"; do
  B="${pair%%:*}"; CDP="${pair##*:}"
  setsid /opt/google/chrome/chrome --remote-debugging-port="$CDP" \
    --user-data-dir="/tmp/opencode/chrome-batch-$B" --no-first-run \
    --disable-dev-shm-usage --disable-gpu about:blank \
    < /dev/null > "/tmp/opencode/chrome-batch-$B.log" 2>&1 &
  disown
done
```

Each agent then invokes the browser as `BU_CDP_URL=http://127.0.0.1:<its CDP port> browser-harness`.

## Backend

One shared backend on `:8000` serves all five worktrees, because the backend is not being
changed. Start it once from the main checkout:

```bash
cd backend && ../.venv/bin/python -m uvicorn app.main:app --port 8000
```

## Batch → tool map

| Batch | Tools | Route prefix |
|---|---|---|
| A | `sox`, `mediainfo`, `streamlink`, `gallery-dl` | `/t/sox`, … |
| B | `trimmer`, `audio_processor`, `transcriber`, `demucs` | `/t/trimmer`, … |
| C | `pandoc`, `pdf_tools`, `ocrmypdf`, `packager` | `/t/pandoc`, … |
| D | `exif_scrubber`, `codec_tool`, `script_runner`, `sys.health.check` | `/t/exif_scrubber`, … |
| E | `media.download.yt-dlp`, `summarizer`, `subtitle.translate.srt`, `text.translate.llm` | `/t/media.download.yt-dlp`, … |

Prompts: `PROMPT-A.md` … `PROMPT-E.md` in this directory.

## Merging

Each worktree produces one branch touching only its own `src/sites/<tool>/` directories and its
own new test files. Merges should be conflict-free:

```bash
for B in A B C D E; do
  git merge --no-ff "sites/batch-$B" -m "merge: batch $B tool sites"
done
npm --prefix frontend run verify
```

After merging, drop the 21 legacy in-shell pages under `src/pages/` (decision D9) — do that as
its own commit, not inside a batch merge.

## If a batch wants to touch something shared

It should not. Shared files are `siteModules.ts`, `registry.ts`, `App.tsx` and anything in
`src/lib/` or `src/hooks/`. If a batch genuinely needs a shared change, that is a signal the
brief was wrong — report it rather than editing, and two batches will otherwise fix the same
thing differently.