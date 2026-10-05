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

Each worktree is a full checkout, so it needs its own `node_modules` and its own dev server.
Symlinking `node_modules` is faster and works fine:

```bash
for B in A B C D E; do
  ln -s "$(pwd)/frontend/node_modules" "../wt-batch-$B/frontend/node_modules"
done
```

## Ports — one per worktree, so all five can run at once

The backend is shared (one instance on `:8000` for everyone). Only vite needs separating:

```bash
cd ../wt-batch-A/frontend && npm run dev -- --port 5174   # A
cd ../wt-batch-B/frontend && npm run dev -- --port 5175   # B
cd ../wt-batch-C/frontend && npm run dev -- --port 5176   # C
cd ../wt-batch-D/frontend && npm run dev -- --port 5177   # D
cd ../wt-batch-E/frontend && npm run dev -- --port 5178   # E
```

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