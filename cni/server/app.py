"""
cni/server/app.py

FastAPI application for the CNI web UI.

Mounts all API routes under ``/api/`` and serves the Next.js static
build from ``cni/server/static/`` when available.  A catch-all route
returns ``index.html`` for client-side routing.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from cni.server.routes.analyze import router as analyze_router
from cni.server.routes.graph import router as graph_router
from cni.server.routes.health import router as health_router
from cni.server.routes.impact import router as impact_router
from cni.server.routes.onboard import router as onboard_router
from cni.server.routes.ask import router as ask_router
from cni.server.routes.explain import router as explain_router
from cni.server.routes.chat_history import router as chat_history_router
from cni.server.routes.history import router as history_router
from cni.server.routes.search import router as search_router
from cni.server.routes.path import router as path_router
from cni.server.routes.bookmarks import router as bookmarks_router

app = FastAPI(
    title="CNI API",
    description="Codebase Neural Interface — local web UI backend",
    version="0.1.0",
)

# ---------------------------------------------------------------------------
# CORS — allow Next.js dev server and self
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:8000",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# API routers
# ---------------------------------------------------------------------------
app.include_router(analyze_router, prefix="/api")
app.include_router(graph_router, prefix="/api")
app.include_router(health_router, prefix="/api")
app.include_router(impact_router, prefix="/api")
app.include_router(onboard_router)     # mounts /api/onboard, /api/onboard/chat, /ws/onboard/chat
app.include_router(ask_router)          # mounts /api/ask and /ws/ask
app.include_router(explain_router, prefix="/api")
app.include_router(chat_history_router) # mounts /api/chat/history, sessions, new-session, session
app.include_router(history_router, prefix="/api")
app.include_router(search_router, prefix="/api")
app.include_router(path_router, prefix="/api")
app.include_router(bookmarks_router, prefix="/api")

# ---------------------------------------------------------------------------
# Static file serving (production: Next.js export)
# ---------------------------------------------------------------------------
_STATIC_DIR = Path(__file__).resolve().parent / "static"

if _STATIC_DIR.is_dir() and (_STATIC_DIR / "index.html").exists():
    app.mount("/static", StaticFiles(directory=str(_STATIC_DIR)), name="static")

    @app.get("/{full_path:path}")
    async def _serve_spa(full_path: str) -> FileResponse:
        """Serve the SPA index.html for any non-API route."""
        file_path = _STATIC_DIR / full_path
        if file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(_STATIC_DIR / "index.html"))
