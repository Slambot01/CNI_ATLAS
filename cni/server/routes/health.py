"""
cni/server/routes/health.py

GET /api/health — Return codebase health metrics.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException, Query

from cni.analysis.health import compute_health
from cni.analyzer.repo_scanner import scan_repository
from cni.graph.graph_builder import build_dependency_graph

router = APIRouter(tags=["health"])


@router.get("/health")
async def get_health(path: str = Query(..., description="Repository root path")) -> dict:
    """Compute and return codebase health metrics."""
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

    report = compute_health(graph)

    return {
        "score": report["health_score"],
        "total_modules": report["total_modules"],
        "god_modules": report["god_modules"],
        "coupled_modules": report["coupled_modules"],
        "isolated_count": report["isolated_count"],
    }
