# Directed Acyclic Graph (DAG) pipeline orchestration and async runners

Pipelines in Workspaces support full Directed Acyclic Graph (DAG) topologies with explicit port-bound edges, dynamic parallel branch scheduling via Kahn's topological sort and `asyncio.TaskGroup`, and configurable fault-tolerance policies (`fail_fast` vs `branch_pruning`).

Tool drivers execute via non-blocking asynchronous runners (`AsyncSubprocessRunner`) with POSIX process group isolation (`start_new_session=True`), chunked regex reading to prevent pipe deadlocks, 3-stage cancellation escalation (SIGINT -> SIGTERM -> SIGKILL), and PID reaping.

Considered and rejected: strict 1D sequential chains only (prohibits parallel fan-out/fan-in pipelines) and heavyweight external orchestrators like Celery/Temporal (violates local-first, zero-database principles).
