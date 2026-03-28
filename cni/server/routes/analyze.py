"""
cni/server/routes/analyze.py

POST /api/analyze — Scan a repository and return graph statistics.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from cni.server.state import repo_state

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
    """Scan *path*, build the dependency graph, and return summary stats.

    This is the ONLY route that triggers scanning.  All other routes
    read from the in-memory cache populated here.
    """
    repo_path = Path(body.path).resolve()

    if not repo_path.is_dir():
        raise HTTPException(status_code=400, detail=f"Not a directory: {body.path}")

    try:
        stats = repo_state.analyze(str(repo_path))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {exc}") from exc

    return AnalyzeResponse(**stats)
