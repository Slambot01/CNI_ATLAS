"""
cni/server/routes/ask.py

POST /api/ask      — One-shot LLM answer (non-streaming).
WebSocket /ws/ask  — Stream LLM response token-by-token.
"""

from __future__ import annotations

import json
from pathlib import Path

import requests
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from cni.analyzer.repo_scanner import scan_repository
from cni.graph.graph_builder import build_dependency_graph
from cni.llm.llm_client import ask_llm, OLLAMA_BASE_URL, DEFAULT_MODEL
from cni.retrieval.context_builder import build_context

router = APIRouter(tags=["ask"])


class AskRequest(BaseModel):
    """Request body for the ask endpoint."""

    question: str
    path: str


# ---------------------------------------------------------------------------
# REST endpoint (non-streaming)
# ---------------------------------------------------------------------------

@router.post("/api/ask")
async def post_ask(body: AskRequest) -> dict:
    """Answer a natural-language question about the codebase."""
    repo_path = Path(body.path).resolve()

    if not repo_path.is_dir():
        raise HTTPException(status_code=400, detail=f"Not a directory: {body.path}")

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

    context = build_context(graph, body.question)
    answer = ask_llm(context, body.question)

    return {"answer": answer or "No answer available."}


# ---------------------------------------------------------------------------
# WebSocket endpoint (streaming via Ollama)
# ---------------------------------------------------------------------------

@router.websocket("/ws/ask")
async def ws_ask(websocket: WebSocket) -> None:
    """Stream LLM tokens over a WebSocket connection.

    Expected JSON message from client::

        {"question": "...", "path": "..."}

    The server streams back JSON frames::

        {"token": "word "}     — partial token
        {"done": true}         — generation complete
        {"error": "msg"}       — error occurred
    """
    await websocket.accept()

    try:
        while True:
            data = await websocket.receive_json()
            question: str = data.get("question", "")
            repo_path_str: str = data.get("path", ".")

            if not question.strip():
                await websocket.send_json({"error": "Empty question."})
                continue

            repo_path = Path(repo_path_str).resolve()
            if not repo_path.is_dir():
                await websocket.send_json({"error": f"Not a directory: {repo_path_str}"})
                continue

            # Build context using existing CNI modules
            try:
                file_paths = scan_repository(str(repo_path))
                graph = build_dependency_graph(file_paths)
                context = build_context(graph, question)
            except Exception as exc:
                await websocket.send_json({"error": f"Analysis failed: {exc}"})
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
                        await websocket.send_json({"token": token})
                    if chunk.get("done", False):
                        break

                await websocket.send_json({"done": True})

            except requests.exceptions.ConnectionError:
                await websocket.send_json(
                    {"error": "Cannot connect to Ollama. Start it with: ollama serve"}
                )
            except Exception as exc:
                await websocket.send_json({"error": f"LLM error: {exc}"})

    except WebSocketDisconnect:
        pass
