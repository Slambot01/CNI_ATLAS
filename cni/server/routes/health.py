"""
cni/server/routes/health.py

GET /api/health — Return codebase health metrics.
"""

from __future__ import annotations

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

from cni.analysis.health import compute_health
from cni.server.state import repo_state, RepoStateError

router = APIRouter(tags=["health"])


@router.get("/health")
async def get_health(path: str = Query(..., description="Repository root path")) -> dict:
    """Compute and return codebase health metrics from the cached graph.

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

    report = compute_health(graph)

    return {
        "score": report["health_score"],
        "total_modules": report["total_modules"],
        "god_modules": report["god_modules"],
        "coupled_modules": report["coupled_modules"],
        "isolated_count": report["isolated_count"],
    }
