"""
cni/storage/history.py

SQLite-backed persistent storage for chat messages and analysis snapshots.

Each analysed repository gets its own ``history.db`` file inside
``<repo>/.cni/``, next to the existing ``cache.json``.

All public functions are fail-safe: if the database is unavailable
(permissions, disk full, …) they log a warning and return gracefully
so the rest of the application keeps working.
"""

from __future__ import annotations

import logging
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Generator, Optional

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Connection helpers
# ---------------------------------------------------------------------------

def _db_path(repo_path: str) -> Path:
    """Return the path to the SQLite database for *repo_path*.

    Creates the ``.cni/`` directory if it does not exist.
    """
    cni_dir = Path(repo_path) / ".cni"
    cni_dir.mkdir(parents=True, exist_ok=True)
    return cni_dir / "history.db"


@contextmanager
def _connect(repo_path: str) -> Generator[sqlite3.Connection, None, None]:
    """Open (or create) the SQLite database and yield a connection.

    Tables are created on first access via ``IF NOT EXISTS``.
    """
    db = _db_path(repo_path)
    conn = sqlite3.connect(str(db), timeout=5)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    try:
        _ensure_tables(conn)
        yield conn
        conn.commit()
    finally:
        conn.close()


def _ensure_tables(conn: sqlite3.Connection) -> None:
    """Create application tables if they do not already exist."""
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS chat_messages (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            repo_path   TEXT    NOT NULL,
            page        TEXT    NOT NULL,
            role        TEXT    NOT NULL,
            content     TEXT    NOT NULL,
            session_id  TEXT    NOT NULL,
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_chat_repo_page
            ON chat_messages (repo_path, page);

        CREATE INDEX IF NOT EXISTS idx_chat_session
            ON chat_messages (session_id);

        CREATE TABLE IF NOT EXISTS analysis_history (
            id                 INTEGER PRIMARY KEY AUTOINCREMENT,
            repo_path          TEXT    NOT NULL,
            files_count        INTEGER,
            dependencies_count INTEGER,
            health_score       REAL,
            created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_analysis_repo
            ON analysis_history (repo_path);

        CREATE TABLE IF NOT EXISTS bookmarks (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            repo_path   TEXT    NOT NULL,
            file_path   TEXT    NOT NULL,
            note        TEXT    DEFAULT '',
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(repo_path, file_path)
        );

        CREATE INDEX IF NOT EXISTS idx_bookmarks_repo
            ON bookmarks (repo_path);
        """
    )


def get_db(repo_path: str) -> sqlite3.Connection:
    """Open or create the history database for *repo_path*.

    Creates ``.cni/`` and the tables if they do not exist.
    Returns a ``sqlite3.Connection`` with ``row_factory = sqlite3.Row``.
    The caller is responsible for closing the connection.
    """
    db = _db_path(repo_path)
    conn = sqlite3.connect(str(db), timeout=5)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    _ensure_tables(conn)
    return conn


# ---------------------------------------------------------------------------
# Chat messages
# ---------------------------------------------------------------------------

def new_session_id() -> str:
    """Generate a new UUID-4 session identifier."""
    return str(uuid.uuid4())


def save_message(
    repo_path: str,
    page: str,
    role: str,
    content: str,
    session_id: str,
) -> None:
    """Persist a single chat message.

    Args:
        repo_path:  Resolved path to the repository root.
        page:       ``"chat"`` or ``"onboard"``.
        role:       ``"user"`` or ``"assistant"``.
        content:    The message body.
        session_id: UUID grouping messages in one conversation.
    """
    try:
        with _connect(repo_path) as conn:
            conn.execute(
                """
                INSERT INTO chat_messages (repo_path, page, role, content, session_id)
                VALUES (?, ?, ?, ?, ?)
                """,
                (repo_path, page, role, content, session_id),
            )
    except Exception:
        log.warning("Failed to save chat message", exc_info=True)


def get_messages(
    repo_path: str,
    page: str,
    session_id: Optional[str] = None,
    limit: int = 100,
) -> list[dict]:
    """Return chat messages for a repository and page.

    If *session_id* is provided, only that session is returned.
    Otherwise the **latest** session's messages are returned.

    Args:
        repo_path:  Repository root path.
        page:       ``"chat"`` or ``"onboard"``.
        session_id: Optional specific session to fetch.
        limit:      Maximum number of messages.

    Returns:
        List of dicts with keys ``role``, ``content``, ``created_at``.
    """
    try:
        with _connect(repo_path) as conn:
            if session_id is None:
                # Find the latest session
                row = conn.execute(
                    """
                    SELECT session_id FROM chat_messages
                    WHERE repo_path = ? AND page = ?
                    ORDER BY created_at DESC LIMIT 1
                    """,
                    (repo_path, page),
                ).fetchone()
                if row is None:
                    return []
                session_id = row["session_id"]

            rows = conn.execute(
                """
                SELECT role, content, created_at FROM chat_messages
                WHERE repo_path = ? AND page = ? AND session_id = ?
                ORDER BY created_at ASC
                LIMIT ?
                """,
                (repo_path, page, session_id, limit),
            ).fetchall()

            return [dict(r) for r in rows]
    except Exception:
        log.warning("Failed to load chat messages", exc_info=True)
        return []


def get_latest_session_id(repo_path: str, page: str) -> Optional[str]:
    """Return the session ID of the most recent conversation, or ``None``.

    Args:
        repo_path: Repository root path.
        page:      ``"chat"`` or ``"onboard"``.
    """
    try:
        with _connect(repo_path) as conn:
            row = conn.execute(
                """
                SELECT session_id FROM chat_messages
                WHERE repo_path = ? AND page = ?
                ORDER BY created_at DESC LIMIT 1
                """,
                (repo_path, page),
            ).fetchone()
            return row["session_id"] if row else None
    except Exception:
        log.warning("Failed to get latest session id", exc_info=True)
        return None


def get_all_sessions(repo_path: str, page: str) -> list[dict]:
    """Return metadata for every chat session on *page*.

    Each entry contains ``session_id``, ``first_message`` (truncated),
    ``created_at``, and ``message_count``.

    Args:
        repo_path: Repository root path.
        page:      ``"chat"`` or ``"onboard"``.
    """
    try:
        with _connect(repo_path) as conn:
            rows = conn.execute(
                """
                SELECT
                    session_id,
                    MIN(created_at)   AS created_at,
                    COUNT(*)          AS message_count,
                    MIN(CASE WHEN role = 'user' THEN content END) AS first_message
                FROM chat_messages
                WHERE repo_path = ? AND page = ?
                GROUP BY session_id
                ORDER BY MIN(created_at) DESC
                """,
                (repo_path, page),
            ).fetchall()

            return [
                {
                    "session_id": r["session_id"],
                    "first_message": (r["first_message"] or "")[:80],
                    "created_at": r["created_at"],
                    "message_count": r["message_count"],
                }
                for r in rows
            ]
    except Exception:
        log.warning("Failed to list chat sessions", exc_info=True)
        return []


def delete_session(repo_path: str, page: str, session_id: str) -> None:
    """Delete every message belonging to a session.

    Args:
        repo_path:  Repository root path.
        page:       ``"chat"`` or ``"onboard"``.
        session_id: The session to remove.
    """
    try:
        with _connect(repo_path) as conn:
            conn.execute(
                """
                DELETE FROM chat_messages
                WHERE repo_path = ? AND page = ? AND session_id = ?
                """,
                (repo_path, page, session_id),
            )
    except Exception:
        log.warning("Failed to delete chat session", exc_info=True)


# ---------------------------------------------------------------------------
# Analysis history
# ---------------------------------------------------------------------------

def save_analysis(
    repo_path: str,
    files_count: int,
    dependencies_count: int,
    health_score: float = 0.0,
) -> None:
    """Record an analysis snapshot.

    Args:
        repo_path:          Repository root path.
        files_count:        Number of files scanned.
        dependencies_count: Number of dependency edges.
        health_score:       Optional health score (0–100).
    """
    try:
        with _connect(repo_path) as conn:
            conn.execute(
                """
                INSERT INTO analysis_history
                    (repo_path, files_count, dependencies_count, health_score)
                VALUES (?, ?, ?, ?)
                """,
                (repo_path, files_count, dependencies_count, health_score),
            )
    except Exception:
        log.warning("Failed to save analysis history", exc_info=True)


def get_analysis_history(repo_path: str, limit: int = 10) -> list[dict]:
    """Return the most recent analysis snapshots for a repository.

    Args:
        repo_path: Repository root path.
        limit:     Maximum number of entries.
    """
    try:
        with _connect(repo_path) as conn:
            rows = conn.execute(
                """
                SELECT files_count, dependencies_count, health_score, created_at
                FROM analysis_history
                WHERE repo_path = ?
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (repo_path, limit),
            ).fetchall()
            return [dict(r) for r in rows]
    except Exception:
        log.warning("Failed to load analysis history", exc_info=True)
        return []


# ---------------------------------------------------------------------------
# Bookmarks
# ---------------------------------------------------------------------------

def add_bookmark(
    repo_path: str,
    file_path: str,
    note: str = "",
) -> None:
    """Add a bookmark for *file_path* in *repo_path*.

    If the bookmark already exists, the call is silently ignored.

    Args:
        repo_path: Resolved path to the repository root.
        file_path: Relative file path within the repository.
        note:      Optional short note about the bookmark.
    """
    try:
        with _connect(repo_path) as conn:
            conn.execute(
                """
                INSERT OR IGNORE INTO bookmarks (repo_path, file_path, note)
                VALUES (?, ?, ?)
                """,
                (repo_path, file_path, note),
            )
    except Exception:
        log.warning("Failed to add bookmark", exc_info=True)


def remove_bookmark(repo_path: str, file_path: str) -> None:
    """Remove the bookmark for *file_path* in *repo_path*.

    Args:
        repo_path: Resolved path to the repository root.
        file_path: Relative file path within the repository.
    """
    try:
        with _connect(repo_path) as conn:
            conn.execute(
                """
                DELETE FROM bookmarks
                WHERE repo_path = ? AND file_path = ?
                """,
                (repo_path, file_path),
            )
    except Exception:
        log.warning("Failed to remove bookmark", exc_info=True)


def get_bookmarks(repo_path: str) -> list[dict]:
    """Return all bookmarks for *repo_path*.

    Args:
        repo_path: Resolved path to the repository root.

    Returns:
        List of dicts with keys ``file_path``, ``note``, ``created_at``.
    """
    try:
        with _connect(repo_path) as conn:
            rows = conn.execute(
                """
                SELECT file_path, note, created_at
                FROM bookmarks
                WHERE repo_path = ?
                ORDER BY created_at DESC
                """,
                (repo_path,),
            ).fetchall()
            return [
                {
                    "file_path": r["file_path"],
                    "note": r["note"],
                    "created_at": r["created_at"],
                }
                for r in rows
            ]
    except Exception:
        log.warning("Failed to load bookmarks", exc_info=True)
        return []
