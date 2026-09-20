# Multi-Tool Platform

A local-first, unconstrained universal workbench and pipeline orchestration shell. The platform provides runtime scaffolding to register, run, and chain **any tool, script, binary, or custom experimental framework** across any domain (Media, Documents, Images, Web Scraping, Networking, Security, AI & Tutoring, Developer Utilities, and ad-hoc personal scripts) with no restrictions on quality or quantity. Single user, no accounts; optionally reachable from a phone on the same network for remote control.

## Language

**Tool**:
Any executable utility, script, binary, framework, or API wrapper registered in the tool catalog with declared parameters and typed ports, runnable standalone or inside a workspace.
_Avoid_: module, handler, service

**Category**:
An open, user-defined tag or grouping for organizing tools in the catalog (e.g., Media, Documents, Images, Web, Network, Security, AI & Tutoring, Data, Custom/Experimental).
_Avoid_: genre, section

**Workspace**:
A named, filesystem-backed container in the workspaces section, holding an isolated artifact store and zero or more chained tool runs.
_Avoid_: project, dataset, corpus, session

**Pipeline**:
An ordered chain of Tool steps inside a Workspace where each step's output feeds the next step's input, ending in a final output. Pipelines obey compatibility constraints between consecutive tools.
_Avoid_: workflow, recipe, chain

**Template**:
A reusable starting point for a Workspace. The app ships only an empty Workspace; users save arranged Pipelines as their own Templates.
_Avoid_: category preset, project type

**Port**:
A Tool's typed input or output slot (e.g., `audio`, `video`, `text`, `image`, `document`, `code`, `binary`, `folder`, `any`, or custom kinds). Pipeline steps connect one step's output port to a compatible input port of the next step. Ports carry Artifacts; they are distinct from parameters, which configure a run.
_Avoid_: field, channel, endpoint

**Artifact**:
Any file, folder, or structured data produced by a Tool run, stored in a Workspace's artifact store or the global downloads area, and available as input to downstream steps.
_Avoid_: output, result, source, chunk

**Run**:
A single execution of a Tool — standalone or inside a Workspace — recorded under its own run ID with its parameters, logs, and the artifacts it produced. Runs are versioned and never silently overwritten; the user may delete runs, and deleting a Workspace deletes its runs.
_Avoid_: task, job

**Provider**:
A pluggable backend engine, model, or service registered for a specific multi-engine tool (e.g., a local subprocess vs. a cloud API).
_Avoid_: engine, model (a Provider offers one or more Models)

**Model**:
A specific model or engine variant offered by a Provider (e.g., a Whisper size, LLM checkpoint, OCR engine).
_Avoid_: engine, provider

**Standalone execution**:
Running a Tool with no Workspace context; output is written to the global downloads area.
_Avoid_: one-off, ad-hoc mode

**Workspace execution**:
Running a Tool bound to a Workspace; output is written into that Workspace's artifact store.
_Avoid_: dataset mode, pipeline mode

**Downloads area**:
The global directory where Standalone executions write, organized per tool.
_Avoid_: media, uploads, dataset dir

**Artifact store**:
The per-Workspace directory, organized by run ID, that holds everything its tool runs produce.
_Avoid_: source folder, chunks folder
