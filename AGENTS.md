# AGENTS.md

## .idea-dump/ is not authoritative

`.idea-dump/` holds raw, unrefined user ideas. Never read it to decide what the project is, what it does, or how it works. Ground every project decision in `CONTEXT.md`, `docs/adr/`, and the issue tracker under `.scratch/` instead. If `.idea-dump/` contradicts those refined docs, the refined docs win.

## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Instructions when using grill-me, grilling, grill-with docs:

- If there are multiple questions to ask the user, and there is a choice to pick, then use question tool to make it easy.

# 
