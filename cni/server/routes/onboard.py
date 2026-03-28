"""
cni/server/routes/onboard.py

GET /api/onboard — Generate a developer onboarding report.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException, Query

from cni.analysis.onboarder import generate_onboarding_report
from cni.analyzer.repo_scanner import scan_repository
from cni.graph.graph_builder import build_dependency_graph
from cni.llm.llm_client import ask_llm

router = APIRouter(tags=["onboard"])


@router.get("/onboard")
async def get_onboard(path: str = Query(..., description="Repository root path")) -> dict:
    """Generate and return a developer onboarding report."""
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

    report = generate_onboarding_report(graph, file_paths, llm_fn=ask_llm)

    return {
        "entry_points": report["entry_points"],
        "critical_modules": [
            {"name": name, "centrality": score}
            for name, score in report["critical_modules"]
        ],
        "dead_modules": report["dead_modules"],
        "summary": report["architecture_summary"],
    }
