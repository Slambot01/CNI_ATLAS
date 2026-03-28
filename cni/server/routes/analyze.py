"""
cni/server/routes/analyze.py

POST /api/analyze — Scan a repository and return graph statistics.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from cni.analyzer.repo_scanner import scan_repository
from cni.graph.graph_builder import build_dependency_graph, get_graph_stats

router = APIRouter(tags=["analyze"])


class AnalyzeRequest(BaseModel):
    """Request body for the analyze endpoint."""

    path: str


class AnalyzeResponse(BaseModel):
    """Response body for the analyze endpoint."""

    files: int
    dependencies: int
    isolated: int
    most_imported: int


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze_repo(body: AnalyzeRequest) -> AnalyzeResponse:
    """Scan *path*, build the dependency graph, and return summary stats."""
    repo_path = Path(body.path).resolve()

    if not repo_path.is_dir():
        raise HTTPException(status_code=400, detail=f"Not a directory: {body.path}")

    try:
        file_paths: list[str] = scan_repository(str(repo_path))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Scan failed: {exc}") from exc

    if not file_paths:
        raise HTTPException(
            status_code=404,
            detail="No supported source files found in the given path.",
        )

    try:
        graph = build_dependency_graph(file_paths)
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"Graph build failed: {exc}"
        ) from exc

    stats = get_graph_stats(graph)
    return AnalyzeResponse(**stats)
