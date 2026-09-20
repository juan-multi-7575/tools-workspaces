# Decentralized run storage and lineage provenance

Every Run inside a Workspace writes into its own self-contained directory (`workspaces/<workspace_id>/runs/<run_id>/`) with an atomic `manifest.json`, `logs/`, and `artifacts/`.

Run metadata records execution timestamps, duration metrics, tool ID, input parameters, and parent run lineage IDs (`parent_run_ids`), enabling users to inspect logs and branch new pipeline workflows from any prior checkpoint without re-running earlier steps.

Considered and rejected: a central database (violates filesystem-as-source-of-truth ADR-0002) and global monolithic metadata files alone (causes concurrency contention during parallel step executions).
