# 02 — Audio processor tool end-to-end

**What to build:** The audio processor tool works end-to-end: a user uploads an audio file, converts it between WAV/MP3/FLAC/OGG/M4A and resamples (e.g. 22.05k/44.1k/48k), and gets the output — either in the global downloads area (standalone) or in a Workspace's artifact store (workspace-bound). This establishes the execution seam and the driver contract every later tool follows.

**Blocked by:** 01 — Platform skeleton & two-section shell

**Status:** ready-for-agent

- [ ] A user runs the audio processor standalone with a file and format/sample-rate options and receives the converted output in the downloads area
- [ ] A user runs the same tool inside a Workspace and the output lands in that Workspace's artifact store
- [ ] Parameters are validated (unknown or invalid options are rejected with a clear error)
- [ ] Tools are executed asynchronously with a terminal state and the produced artifacts are visible
- [ ] **Testing:** API-level tests execute the tool standalone and workspace-bound and assert the output file and its destination on disk; invalid parameters are rejected
