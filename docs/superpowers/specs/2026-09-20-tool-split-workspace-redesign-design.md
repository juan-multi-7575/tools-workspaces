# Tool Split, Nomenclature, Scaffold & Workspace Redesign — Design Spec

Date: 2026-09-20 | Approach: A (facade + micro-tools) | Status: awaiting user review

Source of truth: `CONTEXT.md` + `docs/adr/`. Expert input: Query Hub `q-d1nek-phvj` (5 responses: Qwen 3.8-Max Thinking + 4× Qwen 3.7-Plus Fast same-chat) and `q-m60g4-pspl` (5 responses: Qwen 3.8-Max Thinking + 4× Qwen 3.7-Plus Fast same-chat). Compilation: `query-hub/exports/FULL_COMPILATION.md`.

## 1. Tool split + nomenclature

Splits (measured sizes):
- `downloader.py` (1051 lines) → facade `media.download.yt-dlp` + atomics `media.download.resolve`, `media.download.format_select`, `media.subtitle.fetch`, `media.thumbnail.get`. Facade delegates to atomics with current default params so existing pipelines keep working.
- `translator_tool.py` (535 lines) → `text.translate.llm` (engine call) + `subtitle.translate.srt` (format parse/serialize).
- `model_health_tool.py` (1086 lines) → no split (diagnostic bundle, not a pipeline step); rename to `sys.health.check`.
- Small tools keep logic, adopt dotted ids: `media.audio.process`, `media.info.probe`, `doc.convert.pandoc`, `image.convert.magick`, `sec.codec.transform`, `ai.summarize.llm`, `dev.script.run`.

Naming/versioning rules:
- Scheme `domain.verb.engine` under `media.*`, `stt.*`, `text.*`, `vision.*`, `audio.*`, `sys.*`, `dev.*`, `doc.*`, `image.*`, `sec.*`, `ai.*`.
- `version` field in manifest only; never in id. Rename/split keeps old id as proxy shim for 2 releases with deprecation log.
- Registry collision check at import: duplicate id, or duplicate alias triple, fails fast citing file + line.
- Split heuristic (pinned): split when (a) sub-task has independent utility outside the monolith, (b) param groups are mutually exclusive per phase, or (c) failure boundaries differ (slow network vs fast local). Otherwise keep monolith + presets.

## 2. Organized tool addition (scaffold)

Command: `python backend/tools/make-tool.py --id media.silence.detect --kind audio --in audio --out text`

Generates:
- `backend/app/tools/media/silence_detect.py` — `Tool` subclass stub with `execute` signature.
- `backend/app/tools/media/silence_detect.manifest.yaml` — id, name, category, input/output kinds and ports, parameters_schema.
- Registration: extend current loader to discover `backend/app/tools/*/*` (domain folders); frontend palette reads the same manifest endpoint so backend/frontend cannot drift.
- Validation: JSON-schema check, port-kind assignability via `is_assignable`, collision check above.

YAML-vs-class rule: YAML + generic subprocess runner for CLI wrappers (yt-dlp, ffmpeg, pandoc, magick); Python class for streaming progress, cancel hooks, or multi-phase outputs (transcriber, download manager). Scaffold selects via `--runner subprocess|python`.

## 3. Workspace redesign + pipeline ergonomics

Workspace remains a user-named project folder (`workspaces/<id>/`), not a template category.
- Per-run `meta.json` adds `pipeline_id`, `pipeline_name`, `visibility: success|scratch|failed`, `preset_id`.
- Success view filters `visibility=success`; timeline groups by `pipeline_id` with steps nested inside; scratch/failed hidden behind toggle, retained on disk. GC is explicit (`--older-than 30d --keep-starred`), never silent.
- Reuse without duplication: `templates/` stores versioned pipeline JSON; workspaces instantiate by `template_id` + param overrides.
- DAG overload: each split ships a composite preset (e.g. `preset: media.youtube_to_mp4` = 4 nodes, 1 click, expandable) plus port-kind auto-wire for compatible connections.

## Acceptance

- Existing `youtube` workspace pipelines run unchanged via facade ids.
- `make-tool` round-trip (scaffold → register → palette visible → standalone run) works for `media.silence.detect` example.
- Timeline shows per-pipeline groups; success view hides scratch/failed; GC dry-run lists candidates first.
- No database introduced; filesystem remains sole source of truth.
