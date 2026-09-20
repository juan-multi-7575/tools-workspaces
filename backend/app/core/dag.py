from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, Field

from app.core.ports import is_assignable
from app.registry import get


class DAGNode(BaseModel):
    id: str
    tool_id: str
    params: dict[str, Any] = Field(default_factory=dict)
    position: dict[str, float] | None = None


class DAGEdge(BaseModel):
    id: str | None = None
    source_node: str
    source_port: str = "default"
    target_node: str
    target_port: str = "default"


class DAGPipelineSpec(BaseModel):
    nodes: list[DAGNode]
    edges: list[DAGEdge] = Field(default_factory=list)
    error_policy: Literal["fail_fast", "branch_pruning"] = "fail_fast"
    cache_policy: Literal["reuse", "recompute"] = "recompute"


class DAGValidationResult(BaseModel):
    valid: bool
    error: str | None = None
    topological_order: list[str] = Field(default_factory=list)


def validate_dag(spec: DAGPipelineSpec) -> DAGValidationResult:
    """Validates that:
    1. All nodes refer to registered tools.
    2. All edges connect existing nodes.
    3. The graph is acyclic (DAG) using Kahn's algorithm.
    4. Output/input port types across edges are compatible.
    """
    node_map = {n.id: n for n in spec.nodes}
    if len(node_map) != len(spec.nodes):
        return DAGValidationResult(valid=False, error="Duplicate node IDs detected in pipeline")

    # 1. Verify tools exist
    for node in spec.nodes:
        try:
            get(node.tool_id)
        except KeyError:
            return DAGValidationResult(valid=False, error=f"Tool '{node.tool_id}' on node '{node.id}' is not registered")

    # 2. Verify edge endpoints and port compatibility
    in_degrees: dict[str, int] = {n.id: 0 for n in spec.nodes}
    adj: dict[str, list[tuple[str, DAGEdge]]] = {n.id: [] for n in spec.nodes}

    for edge in spec.edges:
        if edge.source_node not in node_map:
            return DAGValidationResult(valid=False, error=f"Edge source node '{edge.source_node}' does not exist")
        if edge.target_node not in node_map:
            return DAGValidationResult(valid=False, error=f"Edge target node '{edge.target_node}' does not exist")

        src_tool = get(node_map[edge.source_node].tool_id)
        tgt_tool = get(node_map[edge.target_node].tool_id)

        # Port compatibility check
        src_kinds = src_tool.manifest.output_kinds or ["any"]
        tgt_kinds = tgt_tool.manifest.input_kinds or ["any"]

        if not any(is_assignable(o, i) for o in src_kinds for i in tgt_kinds):
            return DAGValidationResult(
                valid=False,
                error=f"Edge from '{edge.source_node}' ({src_tool.manifest.id}) to '{edge.target_node}' ({tgt_tool.manifest.id}) has incompatible port types",
            )

        adj[edge.source_node].append((edge.target_node, edge))
        in_degrees[edge.target_node] += 1

    # 3. Kahn's algorithm for topological sorting and cycle detection
    queue = [node_id for node_id, deg in in_degrees.items() if deg == 0]
    topological_order: list[str] = []

    while queue:
        curr = queue.pop(0)
        topological_order.append(curr)
        for neighbor, _ in adj[curr]:
            in_degrees[neighbor] -= 1
            if in_degrees[neighbor] == 0:
                queue.append(neighbor)

    if len(topological_order) != len(spec.nodes):
        return DAGValidationResult(valid=False, error="Cycle detected in pipeline graph")

    return DAGValidationResult(valid=True, topological_order=topological_order)
