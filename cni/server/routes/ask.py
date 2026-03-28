"""
cni/server/routes/ask.py

POST /api/ask      — One-shot LLM answer (non-streaming).
WebSocket /ws/ask  — Stream LLM response token-by-token.

Messages are persisted to the per-repo SQLite history database.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

import requests
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from cni.llm.llm_client import ask_llm, OLLAMA_BASE_URL, DEFAULT_MODEL
from cni.retrieval.context_builder import build_context
from cni.server.state import repo_state, RepoStateError
from cni.storage.history import save_message, new_session_id

router = APIRouter(tags=["ask"])


class AskRequest(BaseModel):
    """Request body for the ask endpoint."""

    question: str
    path: str
    session_id: Optional[str] = None


# ---------------------------------------------------------------------------
# REST endpoint (non-streaming)
# ---------------------------------------------------------------------------

@router.post("/api/ask")
async def post_ask(body: AskRequest) -> dict:
    """Answer a natural-language question about the codebase.

    Uses the cached graph from ``repo_state`` to build context.
    Persists both user and assistant messages to history.
    Returns 400 if no repo has been analyzed yet.
    """
    try:
        graph = repo_state.get_graph()
        repo_path = repo_state.get_repo_path()
    except RepoStateError:
        return JSONResponse(
            status_code=400,
            content={
                "error": "No repo analyzed yet",
                "hint": "Send POST /api/analyze first",
            },
        )

    context = build_context(graph, body.question)
    answer = ask_llm(context, body.question)

    # Persist to history
    sid = body.session_id or new_session_id()
    try:
        save_message(repo_path, "chat", "user", body.question, sid)
        save_message(repo_path, "chat", "assistant", answer or "", sid)
    except Exception:
        pass  # non-critical — app still works without persistence

    return {"answer": answer or "No answer available.", "session_id": sid}


# ---------------------------------------------------------------------------
# WebSocket endpoint (streaming via Ollama)
# ---------------------------------------------------------------------------

@router.websocket("/ws/ask")
async def ws_ask(websocket: WebSocket) -> None:
    """Stream LLM tokens over a WebSocket connection.

    Expected JSON message from client::

        {"question": "...", "path": "...", "session_id": "..."}

    The server streams back JSON frames::

        {"token": "word "}     — partial token
        {"done": true, "session_id": "..."}  — generation complete
        {"error": "msg"}       — error occurred

    Uses the cached graph from ``repo_state`` to build context.
    Persists the full exchange after streaming completes.
    """
    await websocket.accept()

    try:
        while True:
            data = await websocket.receive_json()
            question: str = data.get("question", "")
            repo_path_str: str = data.get("path", ".")
            sid: str = data.get("session_id", "") or new_session_id()

            if not question.strip():
                await websocket.send_json({"error": "Empty question."})
                continue

            # Use cached state instead of rescanning
            if not repo_state.is_analyzed():
                await websocket.send_json(
                    {"error": "No repo analyzed yet. Send POST /api/analyze first."}
                )
                continue

            try:
                graph = repo_state.get_graph()
                repo_path = repo_state.get_repo_path()
                context = build_context(graph, question)
            except Exception as exc:
                await websocket.send_json({"error": f"Context build failed: {exc}"})
                continue

            prompt = (
                "You are a code understanding assistant. Based on the provided "
                "code context, answer the following question as concisely and "
                "clearly as possible.\n\n"
                f"CONTEXT:\n{context}\n\n"
                f"QUESTION:\n{question}\n\n"
                "ANSWER:"
            )

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
                    save_message(repo_path, "chat", "user", question, sid)
                    save_message(repo_path, "chat", "assistant", full_response, sid)
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
