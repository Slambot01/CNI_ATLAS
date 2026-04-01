"""
cni/server/routes/graph.py

GET /api/graph — Return the dependency graph as nodes + edges JSON.

Includes a ``validation`` block in the response so auditors can instantly
verify that degree sums equal the edge count.
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

from cni.graph.graph_builder import validate_graph
from cni.server.state import repo_state, RepoStateError

router = APIRouter(tags=["graph"])


def _color_by_indegree(indegree: int) -> str:
    """Return a hex colour string based on in-degree.

    Args:
        indegree: Number of incoming edges for the node.

    Returns:
        CSS hex colour string.
    """
    if indegree == 0:
        return "#ffffff"
    if indegree <= 4:
        return "#d0e8ff"
    return "#ffcccc"


@router.get("/graph")
async def get_graph(path: str = Query(..., description="Repository root path")) -> dict:
    """Return the cached dependency graph as nodes + edges JSON.

    Uses the in-memory graph from ``repo_state`` instead of rescanning.
    Returns 400 if no repo has been analyzed yet.

    **Fix 3:** Degrees are always computed live from the graph object via
    ``graph.in_degree(node)`` / ``graph.out_degree(node)`` — never read
    from stored node attributes.

    **Fix 4:** The ``generated`` timestamp is always computed fresh at
    response time.

    **Fix 5:** A ``validation`` object is included so auditors can verify
    ``indegree_sum == outdegree_sum == edge_count``.
    """
    try:
        graph = repo_state.get_graph()
    except RepoStateError:
        return JSONResponse(
            status_code=400,
            content={
                "error": "No repo analyzed yet",
                "hint": "Send POST /api/analyze first",
            },
        )

    # Fix 3: ALWAYS read degrees from live graph, never from node attributes
    nodes = []
    for node in graph.nodes:
        indegree: int = graph.in_degree(node)
        outdegree: int = graph.out_degree(node)
        nodes.append(
            {
                "id": node,
                "label": Path(node).name,
                "indegree": indegree,
                "outdegree": outdegree,
                "color": _color_by_indegree(indegree),
            }
        )

    edges = []
    for source, target, data in graph.edges(data=True):
        edges.append(
            {
                "source": source,
                "target": target,
                "label": data.get("label", "import"),
            }
        )

    return {
        "nodes": nodes,
        "edges": edges,
        # Fix 4: fresh timestamp at response time
        "generated": datetime.now(timezone.utc).isoformat(),
        "timezone": "UTC",
        # Fix 5: graph integrity validation
        "validation": validate_graph(graph),
    }
