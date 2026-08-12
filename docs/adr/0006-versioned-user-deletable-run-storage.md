# Versioned, user-deletable run storage

Each Run in a Workspace writes into its own storage keyed by a clear run ID; later steps may consume any prior run's outputs, and re-running a step never overwrites an older run. Runs are not append-only: the user may delete runs, and deleting the Workspace deletes its runs. Considered and rejected: overwrite-in-place (loses history and the ability to branch from an earlier state) and append-only immutability (leaks disk and frustrates cleanup). Consequence: artifact references must carry run IDs, and cleanup is a user action.
