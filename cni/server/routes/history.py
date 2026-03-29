"""
cni/server/routes/history.py

GET /api/history — Return analysis history for a repository.
"""

from __future__ import annotations

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

from cni.server.state import repo_state, RepoStateError
from cni.storage.history import get_analysis_history

router = APIRouter(tags=["history"])


@router.get("/history")
async def get_history(
    path: str = Query(..., description="Repository root path"),
    limit: int = Query(30, description="Maximum number of history entries"),
) -> dict:
    """Return analysis history snapshots for the given repository.

    Returns 400 if no repo has been analyzed yet.
    """
    try:
        repo_path = repo_state.get_repo_path()
    except RepoStateError:
        return JSONResponse(
            status_code=400,
            content={
                "error": "No repo analyzed yet",
                "hint": "Send POST /api/analyze first",
            },
        )

    entries = get_analysis_history(repo_path, limit=limit)

    # Return in chronological order (oldest first) for chart display
    entries.reverse()

    return {
        "history": [
            {
                "timestamp": e["created_at"],
                "files": e["files_count"],
                "dependencies": e["dependencies_count"],
                "health": e.get("health_score", 0) or 0,
            }
            for e in entries
        ]
    }
