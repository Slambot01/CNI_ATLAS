"""
cni/server/routes/impact.py

POST /api/impact — Analyze the blast radius of modifying a file.

Returns dependents grouped by file type (source / test / example) with
relative paths and scoring metadata.  The response always includes a
``scoring_method`` explanation and ``score_legend`` so the UI can display
meaningful context alongside raw scores.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from cni.analysis.explainer import _resolve_node
from cni.analysis.impact import analyze_impact, make_relative, _classify_file
from cni.server.state import repo_state, RepoStateError

router = APIRouter(tags=["impact"])


# ---------------------------------------------------------------------------
# Scoring metadata (Bug 2)
# ---------------------------------------------------------------------------

_SCORING_METHOD: str = (
    "Criticality = entry_point_bonus + hub_bonus + depth_penalty"
)
_SCORE_SCALE: str = "0 to 10"
_SCORE_LEGEND: dict[str, str] = {
    "8-10": "Critical — entry point or major hub",
    "5-7": "High — significant module",
    "2-4": "Medium — moderate dependency",
    "0-1": "Low — leaf dependency",
}


# ---------------------------------------------------------------------------
# Request model
# ---------------------------------------------------------------------------

class ImpactRequest(BaseModel):
    """Request body for the impact endpoint."""

    file: str
    path: str


# ---------------------------------------------------------------------------
# POST /api/impact
# ---------------------------------------------------------------------------

@router.post("/impact")
async def post_impact(body: ImpactRequest) -> dict:
    """Analyze how modifying *file* impacts the rest of the codebase.

    Uses the cached graph and file list from ``repo_state``.

    All file paths in the response are relative to the repository root.
    Dependents are grouped by type (``source``, ``tests``, ``examples``).
    Scoring metadata is included so the frontend can explain scores.

    Returns 400 if no repo has been analyzed yet.
    """
    try:
        graph = repo_state.get_graph()
        file_paths = repo_state.get_file_paths()
        repo_path = repo_state.get_repo_path()
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

    report = analyze_impact(graph, resolved, file_paths, repo_path=repo_path)

    # Build grouped dependents with relative paths (Bug 1 + Bug 3)
    source_deps: list[dict] = []
    test_deps: list[dict] = []
    example_deps: list[dict] = []

    for dep in report["critical_dependents"]:
        rel_path = make_relative(dep["file"], repo_path)
        file_type = dep.get("file_type", _classify_file(dep["file"]))
        entry = {
            "file": rel_path,
            "score": dep["score"],
            "type": file_type,
        }
        if file_type == "test":
            test_deps.append(entry)
        elif file_type == "example":
            example_deps.append(entry)
        else:
            source_deps.append(entry)

    return {
        "direct": report["direct_count"],
        "transitive": report["transitive_count"],
        "risk": report["risk_level"],
        # Flat list for backward compatibility
        "dependents": [
            {
                "file": make_relative(dep["file"], repo_path),
                "score": dep["score"],
                "type": dep.get("file_type", _classify_file(dep["file"])),
            }
            for dep in report["critical_dependents"]
        ],
        # Grouped dependents (Bug 1)
        "dependents_grouped": {
            "source": source_deps,
            "tests": test_deps,
            "examples": example_deps,
        },
        # Scoring metadata (Bug 2)
        "scoring_method": _SCORING_METHOD,
        "score_scale": _SCORE_SCALE,
        "score_legend": _SCORE_LEGEND,
        # Scope note
        "note": (
            "Impact analysis scans all files including tests. "
            "The dependency graph may show fewer nodes based on active filters."
        ),
    }
