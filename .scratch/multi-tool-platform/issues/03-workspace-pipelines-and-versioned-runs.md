# 03 — Workspace pipelines & versioned runs

**What to build:** Inside a Workspace a user arranges tools into a validated Pipeline — only compatible next tools are offered, so invalid chains can't be wired — and runs it. Each run executes under its own run ID; re-running a step never overwrites an earlier run, runs can be browsed and continued from, and an arranged pipeline can be saved as a Template.

**Blocked by:** 02 — Audio processor tool end-to-end

**Status:** ready-for-agent

- [ ] A user adds steps to a pipeline and the UI only offers compatible next tools based on typed input/output ports
- [ ] The backend rejects an invalid chain before any step executes
- [ ] Running a pipeline produces one run per step, each under its own run ID, with execution history (tool, time, parameters, produced artifacts)
- [ ] Re-running a step creates a new run and leaves the earlier run intact; a later step can consume any prior run's outputs
- [ ] A user saves an arranged pipeline as a Template and re-creates a Workspace from it
- [ ] **Testing:** API-level tests validate chains (compatible accepted, incompatible rejected), re-run and assert new run IDs with the old run untouched, and save/reuse a Template
