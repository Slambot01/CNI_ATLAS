"""
cni/server/routes/chat_history.py

REST endpoints for managing persistent chat history.

GET    /api/chat/history      — Messages for the latest (or specified) session.
GET    /api/chat/sessions     — List all sessions for a page.
POST   /api/chat/new-session  — Create a new session ID.
DELETE /api/chat/session      — Remove a session.
"""

from __future__ import annotations

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

from cni.server.state import repo_state, RepoStateError
from cni.storage.history import (
    delete_session,
    get_all_sessions,
    get_latest_session_id,
    get_messages,
    new_session_id,
)

router = APIRouter(tags=["chat_history"])


# ---------------------------------------------------------------------------
# GET /api/chat/history
# ---------------------------------------------------------------------------

@router.get("/api/chat/history")
async def chat_history(
    path: str = Query(..., description="Repository root path"),
    page: str = Query("chat", description="Page: 'chat' or 'onboard'"),
    session_id: str | None = Query(None, description="Optional session ID"),
) -> dict:
    """Return messages for a specific session (or the latest one).

    Query params:
        path       — repo path (required)
        page       — ``chat`` | ``onboard``
        session_id — optional; defaults to latest session
    """
    try:
        repo_path = repo_state.get_repo_path()
    except RepoStateError:
        return JSONResponse(
            status_code=400,
            content={"error": "No repo analyzed yet", "hint": "Send POST /api/analyze first"},
        )

    sid = session_id or get_latest_session_id(repo_path, page)
    messages = get_messages(repo_path, page, session_id=sid) if sid else []

    return {"session_id": sid or "", "messages": messages}


# ---------------------------------------------------------------------------
# GET /api/chat/sessions
# ---------------------------------------------------------------------------

@router.get("/api/chat/sessions")
async def chat_sessions(
    path: str = Query(..., description="Repository root path"),
    page: str = Query("chat", description="Page: 'chat' or 'onboard'"),
) -> dict:
    """Return metadata for every session on *page*."""
    try:
        repo_path = repo_state.get_repo_path()
    except RepoStateError:
        return JSONResponse(
            status_code=400,
            content={"error": "No repo analyzed yet", "hint": "Send POST /api/analyze first"},
        )

    sessions = get_all_sessions(repo_path, page)
    return {"sessions": sessions}


# ---------------------------------------------------------------------------
# POST /api/chat/new-session
# ---------------------------------------------------------------------------

@router.post("/api/chat/new-session")
async def create_new_session(
    path: str = Query(..., description="Repository root path"),
    page: str = Query("chat", description="Page: 'chat' or 'onboard'"),
) -> dict:
    """Generate and return a fresh session UUID."""
    sid = new_session_id()
    return {"session_id": sid}


# ---------------------------------------------------------------------------
# DELETE /api/chat/session
# ---------------------------------------------------------------------------

@router.delete("/api/chat/session")
async def remove_session(
    path: str = Query(..., description="Repository root path"),
    page: str = Query("chat", description="Page: 'chat' or 'onboard'"),
    session_id: str = Query(..., description="Session to delete"),
) -> dict:
    """Delete all messages belonging to a session."""
    try:
        repo_path = repo_state.get_repo_path()
    except RepoStateError:
        return JSONResponse(
            status_code=400,
            content={"error": "No repo analyzed yet", "hint": "Send POST /api/analyze first"},
        )

    delete_session(repo_path, page, session_id)
    return {"success": True}
