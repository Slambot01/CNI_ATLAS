"""
cni/server/routes/explain.py

GET /api/explain — Explain how a file participates in the dependency graph.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException, Query

from cni.analysis.explainer import explain_file
from cni.analyzer.repo_scanner import scan_repository
from cni.graph.graph_builder import build_dependency_graph

router = APIRouter(tags=["explain"])


@router.get("/explain")
async def get_explain(
    file: str = Query(..., description="File to explain (name or partial path)"),
    path: str = Query(..., description="Repository root path"),
) -> dict:
    """Explain what a file imports and what imports it."""
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

    explanation = explain_file(graph, file)
    if explanation is None:
        raise HTTPException(
            status_code=404,
            detail=f"File '{file}' not found in the dependency graph.",
        )

    return explanation
