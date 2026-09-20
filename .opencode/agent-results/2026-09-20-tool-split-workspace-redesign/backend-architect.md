# Backend-architect findings — Task 2 fix round 2/5

- source set: 2026-09-20-tool-split-workspace-redesign
- agent name: backend-architect

## Findings

- finding: Facade id verified present in abandoned commit before restore (no NEEDS_CONTEXT).
  evidence: backend/app/tools/downloader.py:469 (via `git show 3eb1a2f:...` → `id="media.download.yt-dlp"`)
- finding: Restored user in-tree work verbatim (891-line downloader + extra __init__ imports/registrations).
  evidence: backend/app/tools/downloader.py:1 / backend/app/tools/__init__.py:1 (checked out from 3eb1a2f, committed as a251313)
- finding: CLI alias hunk applied minimally; user typing-hardening preserved exactly.
  evidence: backend/app/cli.py:54 / backend/app/cli.py:68 / backend/app/cli.py:86
- finding: test_cli_no_args_lists_subcommands (subcommands-list) passes — STOP not triggered; test not weakened.
  evidence: backend/tests/test_09_cli.py:11
- finding: test_cli_subcommands_match_registry fails on exact set-equality vs mandated alias command (extra 'downloader'); needs controller ruling, test left untouched.
  evidence: backend/tests/test_09_cli.py:22
- finding: Owning conflict is mandated build_cli alias loop vs committed test expectation.
  evidence: backend/app/cli.py:88
- finding: No clean-tree baseline exists (stashed tree fails at import on PortKind 'document' enum); reference state is the shared dirty tree.
  evidence: backend/app/tools/base.py:1 (user dirt required for import)
- finding: Full suite 1 failed / 138 passed / 1 skipped; round-1's 17 failures resolved by restore.
  evidence: backend/tests/test_09_cli.py:19
- finding: Committed a251313 (3 files, +906/−86); fix section appended to task report.
  evidence: .superpowers/sdd/2026-09-20-tool-split-workspace-redesign/task-2-report.md:164
