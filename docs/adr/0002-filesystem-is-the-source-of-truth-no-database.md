# Filesystem is the source of truth; no database

All state lives in the on-disk folder tree (`downloads/`, `projects/<id>/artifacts/`). There is no database and no global in-memory session. Considered and rejected: a SQLite metadata store — it adds a second source of truth for a single-user local app and makes the workspace harder to inspect and back up. Consequence: anything the UI shows must be derivable from the folder tree.
