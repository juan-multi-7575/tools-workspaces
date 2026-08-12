# 09 — Registry-generated CLI

**What to build:** A root CLI whose subcommands are auto-generated from the tool registry, so every registered tool is available from the terminal — mirroring the same options as the web UI, printing live progress, and aborting cleanly on Ctrl-C.

**Blocked by:** 07 — Artifact operations & run browser

**Status:** ready-for-agent

- [ ] Running the CLI with no args lists the subcommands generated from the registry
- [ ] Each registered tool is invocable from the CLI with its full option set
- [ ] Long-running tools print live progress (percent/speed/ETA where applicable)
- [ ] Ctrl-C aborts cleanly and cleans up partial files
- [ ] Adding a tool to the registry automatically adds its CLI subcommand
- [ ] **Testing:** tests assert subcommand generation from the registry and invoke each tool's CLI with mocked backends; a Ctrl-C abort is simulated and partial files are asserted gone
