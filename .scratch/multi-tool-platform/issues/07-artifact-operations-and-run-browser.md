# 07 — Artifact operations & run browser

**What to build:** Inside a Workspace a user browses runs and their artifacts, previews files, copies them out via a Download action, deletes artifacts and runs, and exports the whole artifact store as a ZIP.

**Blocked by:** 03 — Workspace pipelines & versioned runs

**Status:** ready-for-agent

- [ ] A user browses the Workspace's runs and the artifacts each run produced
- [ ] Each artifact row offers Preview, Download (copy), and Delete actions
- [ ] Deleting a run removes only that run's storage and leaves other runs intact
- [ ] A user exports the Workspace artifact store as a single ZIP archive
- [ ] Deleting a Workspace removes its runs
- [ ] **Testing:** API-level tests assert artifact listing, preview, download-copy, delete (artifact and run, with other runs untouched), ZIP export contents, and workspace-cascade deletion on disk
