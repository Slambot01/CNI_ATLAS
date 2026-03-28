"""
cni/server/routes/graph.py

GET /api/graph — Return the dependency graph as nodes + edges for ReactFlow.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException, Query

from cni.analyzer.repo_scanner import scan_repository
from cni.graph.graph_builder import build_dependency_graph

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
    """Build the dependency graph and return nodes + edges as JSON."""
    repo_path = Path(path).resolve()

    if not repo_path.is_dir():
        raise HTTPException(status_code=400, detail=f"Not a directory: {path}")

    try:
        file_paths = scan_repository(str(repo_path))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Scan failed: {exc}") from exc

    if not file_paths:
        raise HTTPException(status_code=404, detail="No source files found.")

    try:
        graph = build_dependency_graph(file_paths)
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"Graph build failed: {exc}"
        ) from exc

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
