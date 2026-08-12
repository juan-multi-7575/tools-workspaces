# Multi-Tool Platform

A local-first platform of standalone  utilities (Tools) and named, filesystem-backed workspaces that chain tool outputs into isolated artifact stores. Single user, no accounts; optionally reachable from a phone on the same network for download control.

## Language

**Tool**:
A standalone media-processing utility registered in the tool catalog, runnable without any workspace context.
_Avoid_: module, handler, service

**Workspace**:
A named, filesystem-backed container in the workspaces section, holding an isolated artifact store and zero or more chained tool runs.
_Avoid_: project, dataset, corpus, session

**Pipeline**:
An ordered chain of Tool steps inside a Workspace where each step's output feeds the next step's input, ending in a final output. Pipelines must obey compatibility constraints between consecutive tools.
_Avoid_: workflow, recipe, chain

**Template**:
A reusable starting point for a Workspace. The app ships only an empty Workspace; users save arranged Pipelines as their own Templates.
_Avoid_: category preset, project type

**Model**:
A specific speech-to-text model offered by a Provider (e.g. a Whisper size, or a provider's named model).
_Avoid_: engine, provider

**Port**:
A Tool's input or output slot, typed by file kind (e.g. audio, video, text, folder, any). Pipeline steps connect one step's output port to a compatible input port of the next step. Ports carry Artifacts; they are distinct from parameters, which configure a run.
_Avoid_: field, channel, endpoint

**Artifact**:
A file or folder of any kind produced by a Tool run, stored in a Workspace's artifact store or the global downloads area, and available as input to later steps.
_Avoid_: output, result, source, chunk

**Region**:
A user-marked selection on the waveform in the audio tool. One Region becomes a trimmed segment when cut, or a slice when split.
_Avoid_: selection (ambiguous), marker

**Segment**:
A time-delimited slice of an audio Artifact produced from a marked Region by the audio tool's split action.
_Avoid_: chunk, clip

**Run**:
A single execution of a Tool — standalone or inside a Workspace — recorded under its own run ID with its parameters and the artifacts it produced. Runs are versioned and never silently overwritten; the user may delete runs, and deleting a Workspace deletes its runs.
_Avoid_: task, job

**Provider**:
A speech-to-text backend registered in the transcriber's provider registry — a cloud API (with a key) or a local model auto-detected on the host.
_Avoid_: engine, model (a Provider offers one or more Models)

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
