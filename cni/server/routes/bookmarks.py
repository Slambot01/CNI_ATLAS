"""
cni/server/routes/bookmarks.py

CRUD endpoints for file bookmarks.

GET    /api/bookmarks   — list all bookmarks for the current repo
POST   /api/bookmarks   — add a bookmark
DELETE /api/bookmarks   — remove a bookmark
"""

from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from cni.server.state import repo_state, RepoStateError
from cni.storage.history import add_bookmark, remove_bookmark, get_bookmarks

router = APIRouter(tags=["bookmarks"])


# ---------------------------------------------------------------------------
# Request bodies
# ---------------------------------------------------------------------------

class BookmarkAdd(BaseModel):
    """Body for POST /api/bookmarks."""

    file: str
    note: str = ""
    path: str


class BookmarkRemove(BaseModel):
    """Body for DELETE /api/bookmarks."""

    file: str
    path: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_repo_path() -> str | None:
    """Return the resolved repo path or ``None`` if not analyzed."""
    try:
        return repo_state.get_repo_path()
    except RepoStateError:
        return None


def _not_analyzed() -> JSONResponse:
    return JSONResponse(
        status_code=400,
        content={
            "error": "No repo analyzed yet",
            "hint": "Send POST /api/analyze first",
        },
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/bookmarks")
async def list_bookmarks(path: str = ".") -> dict:
    """Return all bookmarks for the currently analyzed repository."""
    repo_path = _get_repo_path()
    if repo_path is None:
        return _not_analyzed()

    rows = get_bookmarks(repo_path)
    return {
        "bookmarks": [
            {
                "file": r["file_path"],
                "note": r["note"],
                "created_at": r["created_at"],
            }
            for r in rows
        ],
    }


@router.post("/bookmarks")
async def create_bookmark(body: BookmarkAdd) -> dict:
    """Add a bookmark for a file."""
    repo_path = _get_repo_path()
    if repo_path is None:
        return _not_analyzed()

    add_bookmark(repo_path, body.file, body.note)
    return {"success": True}


@router.delete("/bookmarks")
async def delete_bookmark(body: BookmarkRemove) -> dict:
    """Remove a bookmark for a file."""
    repo_path = _get_repo_path()
    if repo_path is None:
        return _not_analyzed()

    remove_bookmark(repo_path, body.file)
    return {"success": True}
