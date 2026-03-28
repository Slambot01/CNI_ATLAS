"""
cni/server/routes/graph.py

GET /api/graph — Return the dependency graph as nodes + edges JSON.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

from cni.server.state import repo_state, RepoStateError

router = APIRouter(tags=["graph"])


def _color_by_indegree(indegree: int) -> str:
    """Return a hex colour string based on in-degree."""
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

    nodes = []
    for node in graph.nodes:
        indegree = graph.in_degree(node)
        outdegree = graph.out_degree(node)
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

    return {"nodes": nodes, "edges": edges}
