"""
cni/server/routes/impact.py

POST /api/impact — Analyze the blast radius of modifying a file.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from cni.analysis.explainer import _resolve_node
from cni.analysis.impact import analyze_impact
from cni.server.state import repo_state, RepoStateError

router = APIRouter(tags=["impact"])


class ImpactRequest(BaseModel):
    """Request body for the impact endpoint."""

    file: str
    path: str


@router.post("/impact")
async def post_impact(body: ImpactRequest) -> dict:
    """Analyze how modifying *file* impacts the rest of the codebase.

    Uses the cached graph and file list from ``repo_state``.
    Returns 400 if no repo has been analyzed yet.
    """
    try:
        graph = repo_state.get_graph()
        file_paths = repo_state.get_file_paths()
    except RepoStateError:
        return JSONResponse(
            status_code=400,
            content={
                "error": "No repo analyzed yet",
                "hint": "Send POST /api/analyze first",
            },
        )

    resolved = _resolve_node(graph, body.file)
    if resolved is None:
        raise HTTPException(
            status_code=404,
            detail=f"File '{body.file}' not found in the dependency graph.",
        )

    report = analyze_impact(graph, resolved, file_paths)

    return {
        "direct": report["direct_count"],
        "transitive": report["transitive_count"],
        "risk": report["risk_level"],
        "dependents": [
            {"file": dep["file"], "score": dep["score"]}
            for dep in report["critical_dependents"]
        ],
    }
