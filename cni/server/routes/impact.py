"""
cni/server/routes/impact.py

POST /api/impact — Analyze the blast radius of modifying a file.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from cni.analysis.explainer import _resolve_node
from cni.analysis.impact import analyze_impact
from cni.analyzer.repo_scanner import scan_repository
from cni.graph.graph_builder import build_dependency_graph

router = APIRouter(tags=["impact"])


class ImpactRequest(BaseModel):
    """Request body for the impact endpoint."""

    file: str
    path: str


@router.post("/impact")
async def post_impact(body: ImpactRequest) -> dict:
    """Analyze how modifying *file* impacts the rest of the codebase."""
    repo_path = Path(body.path).resolve()

    if not repo_path.is_dir():
        raise HTTPException(status_code=400, detail=f"Not a directory: {body.path}")

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
