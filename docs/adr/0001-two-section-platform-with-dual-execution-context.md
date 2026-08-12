# Two-section platform with dual execution context

The product is structured as two top-level sections — **Tools** (a catalog of standalone utilities) and **Workspaces** (named, filesystem-backed containers holding an isolated artifact store and chained tool runs) — sharing one backend engine. Every tool executes in one of two contexts: standalone (output to the global downloads area) or workspace-bound (output into the workspace's artifact store). Considered and rejected: a tools-only catalog with no way to chain outputs across steps, and a single monolithic pipeline with no standalone use.
