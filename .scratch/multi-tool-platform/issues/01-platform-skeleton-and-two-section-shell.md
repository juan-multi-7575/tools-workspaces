# 01 — Platform skeleton & two-section shell

**What to build:** The app boots as a local-first web platform with two top-level sections — Tools and Workspaces. The storage layout exists on disk, the tools catalog lists the registered tools, and a Workspace can be created from the Empty template. Everything persists across a restart.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [ ] The app starts locally and initializes the on-disk storage layout (`downloads/`, `workspaces/`) safely
- [ ] The UI shows two top-level sections — Tools and Workspaces — with clear navigation
- [ ] The Tools section lists every registered tool from the registry with its metadata
- [ ] The Workspaces section lists workspaces and creates one from the Empty template
- [ ] Created Workspaces survive an app restart
- [ ] No global in-memory session — all state is derivable from the folder tree
- [ ] **Testing:** API-level tests list the registry, create/list workspaces, and assert the on-disk layout after a restart fixture
