"""
cni/server/routes/path.py

POST /api/path — Find the shortest dependency path between two files.
"""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from cni.server.state import repo_state, RepoStateError

log = logging.getLogger(__name__)

router = APIRouter(tags=["path"])


class PathRequest(BaseModel):
    """Request body for the dependency-path endpoint."""

    source: str
    target: str
    path: str = "."


@router.post("/path")
async def dependency_path(body: PathRequest) -> dict:
    """Find the shortest dependency path between *source* and *target*.

    Resolves file-name-only arguments (e.g. ``cache.py``) against
    the full graph node list so callers don't need to know absolute
    paths.

    Returns:
        ``{ found: bool, path: list[str], length: int }``
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

    from cni.analysis.path_finder import find_dependency_path

    # Resolve short names (e.g. "cache.py") to full graph node IDs
    source_id = _resolve_node(graph, body.source)
    target_id = _resolve_node(graph, body.target)

    if source_id is None:
        return {"found": False, "path": [], "length": 0,
                "error": f"Source file '{body.source}' not found in graph"}
    if target_id is None:
        return {"found": False, "path": [], "length": 0,
                "error": f"Target file '{body.target}' not found in graph"}

    result = find_dependency_path(graph, source_id, target_id)

    if result is None:
        return {"found": False, "path": [], "length": 0}

    path_names = [Path(p).name for p in result]
    return {
        "found": True,
        "path": path_names,
        "full_path": result,
        "length": len(result) - 1,
    }


def _resolve_node(graph, name: str) -> str | None:
    """Map a filename or full path to an actual graph node ID.

    Args:
        graph: The ``nx.DiGraph`` with file-path node IDs.
        name:  Either an exact node ID or a bare filename like ``cache.py``.

    Returns:
        The matching node ID string, or ``None`` if unresolved.
    """
    if name in graph:
        return name
    # Try matching by basename
    for node in graph.nodes:
        if Path(node).name == name:
            return node
    return None
