"""
cni/server/routes/explain.py

GET /api/explain — Explain how a file participates in the dependency graph.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse

from cni.analysis.explainer import explain_file
from cni.server.state import repo_state, RepoStateError

router = APIRouter(tags=["explain"])


@router.get("/explain")
async def get_explain(
    file: str = Query(..., description="File to explain (name or partial path)"),
    path: str = Query(..., description="Repository root path"),
) -> dict:
    """Explain what a file imports and what imports it.

    Uses the cached graph from ``repo_state``.
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

    explanation = explain_file(graph, file)
    if explanation is None:
        raise HTTPException(
            status_code=404,
            detail=f"File '{file}' not found in the dependency graph.",
        )

    return explanation
