"""
cni/server/routes/onboard.py

GET  /api/onboard       — Generate a developer onboarding report.
POST /api/onboard/chat  — Follow-up chat with architecture context.
WS   /ws/onboard/chat   — Streaming follow-up chat.

Follow-up chat messages are persisted to the per-repo SQLite history
database with ``page="onboard"``.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

import requests
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from cni.analysis.onboarder import generate_onboarding_report
from cni.analysis.flow_tracer import detect_entry_points
from cni.llm.llm_client import ask_llm, OLLAMA_BASE_URL, DEFAULT_MODEL
from cni.server.state import repo_state, RepoStateError
from cni.storage.history import (
    save_message,
    new_session_id,
    mark_completed,
    mark_uncompleted,
    get_progress,
)

router = APIRouter(tags=["onboard"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_or_generate_report() -> dict:
    """Return the cached onboarding report, or generate and cache it.

    Returns:
        The raw report dict from ``generate_onboarding_report``.

    Raises:
        RepoStateError: If no repo has been analyzed yet.
    """
    cached = repo_state.get_onboard_report()
    if cached is not None:
        return cached

    graph = repo_state.get_graph()
    file_paths = repo_state.get_file_paths()
    report = generate_onboarding_report(graph, file_paths, llm_fn=ask_llm)
    repo_state.cache_onboard_report(report)
    return report


def _format_report_for_api(report: dict) -> dict:
    """Transform the raw report into the API response shape.

    Args:
        report: Raw report from ``generate_onboarding_report``.

    Returns:
        Dict matching the existing GET /api/onboard response shape.
    """
    return {
        "entry_points": report["entry_points"],
        "critical_modules": [
            {"name": name, "centrality": score}
            for name, score in report["critical_modules"]
        ],
        "dead_modules": report["dead_modules"],
        "summary": report["architecture_summary"],
    }


def _build_chat_prompt(report: dict, question: str) -> str:
    """Build an LLM prompt that includes the full onboarding context.

    Args:
        report: Raw onboarding report dict.
        question: The developer's follow-up question.

    Returns:
        Formatted prompt string.
    """
    entry_points = "\n".join(
        f"  - {Path(ep).name}" for ep in report.get("entry_points", [])
    ) or "  (none detected)"

    critical = "\n".join(
        f"  - {name} (centrality: {score:.3f})"
        for name, score in report.get("critical_modules", [])
    ) or "  (none detected)"

    summary = report.get("architecture_summary", "(no summary available)")

    return (
        "You are helping a developer understand a codebase they are new to.\n\n"
        "Here is the architecture overview:\n\n"
        f"Entry Points:\n{entry_points}\n\n"
        f"Critical Modules (by importance):\n{critical}\n\n"
        f"Architecture Summary:\n{summary}\n\n"
        f"The developer has this follow-up question:\n{question}\n\n"
        "Answer based on the architecture context above. Be specific. "
        "Reference actual file names and modules from the codebase."
    )


def _not_analyzed() -> JSONResponse:
    """Return a standard 400 response for un-analyzed repos."""
    return JSONResponse(
        status_code=400,
        content={
            "error": "No repo analyzed yet",
            "hint": "Send POST /api/analyze first",
        },
    )


# ---------------------------------------------------------------------------
# GET /api/onboard — existing report endpoint
# ---------------------------------------------------------------------------

@router.get("/api/onboard")
async def get_onboard(path: str = Query(..., description="Repository root path")) -> dict:
    """Generate and return a developer onboarding report.

    Uses the cached graph and file list from ``repo_state``.
    Caches the generated report for follow-up chat.
    Returns 400 if no repo has been analyzed yet.
    """
    try:
        report = _get_or_generate_report()
    except RepoStateError:
        return _not_analyzed()

    return _format_report_for_api(report)


# ---------------------------------------------------------------------------
# POST /api/onboard/chat — follow-up chat (non-streaming)
# ---------------------------------------------------------------------------

class OnboardChatRequest(BaseModel):
    """Request body for the onboard chat endpoint."""

    question: str
    path: str
    session_id: Optional[str] = None


@router.post("/api/onboard/chat")
async def post_onboard_chat(body: OnboardChatRequest) -> dict:
    """Answer a follow-up question with full architecture context.

    The LLM prompt automatically includes the onboarding report
    (entry points, critical modules, architecture summary) so the
    response is specific to this codebase.
    Persists both messages to history with page="onboard".
    """
    try:
        report = _get_or_generate_report()
        repo_path = repo_state.get_repo_path()
    except RepoStateError:
        return _not_analyzed()

    prompt = _build_chat_prompt(report, body.question)
    answer = ask_llm(prompt, body.question)

    # Persist to history
    sid = body.session_id or new_session_id()
    try:
        save_message(repo_path, "onboard", "user", body.question, sid)
        save_message(repo_path, "onboard", "assistant", answer or "", sid)
    except Exception:
        pass

    return {"answer": answer or "No answer available.", "session_id": sid}


# ---------------------------------------------------------------------------
# WS /ws/onboard/chat — streaming follow-up chat
# ---------------------------------------------------------------------------

@router.websocket("/ws/onboard/chat")
async def ws_onboard_chat(websocket: WebSocket) -> None:
    """Stream architecture-aware follow-up answers over WebSocket.

    Expected JSON from client::

        {"question": "...", "path": "...", "session_id": "..."}

    Server streams back::

        {"token": "word "}     — partial token
        {"done": true, "session_id": "..."}  — generation complete
        {"error": "msg"}       — error occurred

    Persists the completed exchange to history with page="onboard".
    """
    await websocket.accept()

    try:
        while True:
            data = await websocket.receive_json()
            question: str = data.get("question", "")
            sid: str = data.get("session_id", "") or new_session_id()

            if not question.strip():
                await websocket.send_json({"error": "Empty question."})
                continue

            if not repo_state.is_analyzed():
                await websocket.send_json(
                    {"error": "No repo analyzed yet. Send POST /api/analyze first."}
                )
                continue

            # Get or generate the onboarding report
            try:
                report = _get_or_generate_report()
                repo_path = repo_state.get_repo_path()
            except Exception as exc:
                await websocket.send_json({"error": f"Report generation failed: {exc}"})
                continue

            prompt = _build_chat_prompt(report, question)

            # Stream from Ollama
            full_response = ""
            try:
                resp = requests.post(
                    f"{OLLAMA_BASE_URL}/api/generate",
                    json={
                        "model": DEFAULT_MODEL,
                        "prompt": prompt,
                        "stream": True,
                    },
                    stream=True,
                    timeout=60,
                )
                resp.raise_for_status()

                for line in resp.iter_lines():
                    if not line:
                        continue
                    chunk = json.loads(line)
                    token = chunk.get("response", "")
                    if token:
                        full_response += token
                        await websocket.send_json({"token": token})
                    if chunk.get("done", False):
                        break

                await websocket.send_json({"done": True, "session_id": sid})

                # Persist completed exchange
                try:
                    save_message(repo_path, "onboard", "user", question, sid)
                    save_message(repo_path, "onboard", "assistant", full_response, sid)
                except Exception:
                    pass

            except requests.exceptions.ConnectionError:
                await websocket.send_json(
                    {"error": "Cannot connect to Ollama. Start it with: ollama serve"}
                )
            except Exception as exc:
                await websocket.send_json({"error": f"LLM error: {exc}"})

    except WebSocketDisconnect:
        pass


# ---------------------------------------------------------------------------
# GET /api/onboard/checklist — generate reading checklist
# ---------------------------------------------------------------------------

@router.get("/api/onboard/checklist")
async def get_checklist(path: str = Query(".", description="Repository root path")) -> dict:
    """Generate and return an ordered reading checklist.

    The checklist is built from entry points, betweenness centrality,
    config files, and utility files — limited to 15 items.
    """
    import networkx as nx

    try:
        graph = repo_state.get_graph()
        file_paths = repo_state.get_file_paths()
        repo_path = repo_state.get_repo_path()
    except RepoStateError:
        return _not_analyzed()

    # 1. Detect entry points
    entry_points = detect_entry_points(file_paths, repo_path)
    ep_labels: list[str] = [Path(ep["file"]).name for ep in entry_points]

    # 2. Betweenness centrality
    centrality = nx.betweenness_centrality(graph)

    # 3. Classify files
    seen: set[str] = set()
    items: list[dict] = []

    # Entry points first
    for ep in entry_points:
        label = Path(ep["file"]).name
        if label in seen:
            continue
        seen.add(label)
        decorator = ep.get("decorator", "")
        items.append({
            "file": label,
            "reason": f"Entry point — {decorator}" if decorator else "Entry point",
            "category": "entry_point",
        })

    # Top centrality files (exclude entry points)
    sorted_nodes = sorted(
        centrality.items(),
        key=lambda x: x[1],
        reverse=True,
    )
    core_count = 0
    for node_path, score in sorted_nodes:
        if core_count >= 5:
            break
        label = Path(node_path).name
        if label in seen or label == "__init__.py":
            continue
        seen.add(label)
        items.append({
            "file": label,
            "reason": f"Core module — centrality {score:.3f}",
            "category": "core",
        })
        core_count += 1

    # Config files
    config_keywords = {"config", "settings", "env"}
    for fp in file_paths:
        label = Path(fp).name
        stem = Path(fp).stem.lower()
        if label in seen:
            continue
        if any(k in stem for k in config_keywords):
            seen.add(label)
            items.append({
                "file": label,
                "reason": "Configuration",
                "category": "config",
            })

    # Utility files
    util_keywords = {"utils", "helpers", "common"}
    for fp in file_paths:
        label = Path(fp).name
        stem = Path(fp).stem.lower()
        if label in seen:
            continue
        if any(k in stem for k in util_keywords):
            seen.add(label)
            items.append({
                "file": label,
                "reason": "Shared utilities",
                "category": "utility",
            })

    # Limit and number
    items = items[:15]
    checklist = [
        {"order": i + 1, **item}
        for i, item in enumerate(items)
    ]

    return {"checklist": checklist}


# ---------------------------------------------------------------------------
# GET /api/onboard/checklist/progress — retrieve progress
# ---------------------------------------------------------------------------

@router.get("/api/onboard/checklist/progress")
async def get_checklist_progress(
    path: str = Query(".", description="Repository root path"),
) -> dict:
    """Return completion progress for all checklist items."""
    try:
        repo_path = repo_state.get_repo_path()
    except RepoStateError:
        return _not_analyzed()

    rows = get_progress(repo_path)
    return {
        "progress": [
            {"file": r["file_path"], "completed": r["completed"]}
            for r in rows
        ],
    }


# ---------------------------------------------------------------------------
# POST /api/onboard/checklist/toggle — toggle item
# ---------------------------------------------------------------------------

class ChecklistToggle(BaseModel):
    """Body for POST /api/onboard/checklist/toggle."""

    file: str
    completed: bool
    path: str


@router.post("/api/onboard/checklist/toggle")
async def toggle_checklist(body: ChecklistToggle) -> dict:
    """Mark a checklist item as completed or uncompleted."""
    try:
        repo_path = repo_state.get_repo_path()
    except RepoStateError:
        return _not_analyzed()

    if body.completed:
        mark_completed(repo_path, body.file)
    else:
        mark_uncompleted(repo_path, body.file)

    return {"success": True}

