"""
cni/server/routes/search.py

POST /api/search — Semantic search over codebase files.
"""

from __future__ import annotations

import logging
from pathlib import Path

import numpy as np
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from cni.server.state import repo_state, RepoStateError

log = logging.getLogger(__name__)

router = APIRouter(tags=["search"])


class SearchRequest(BaseModel):
    """Request body for the semantic search endpoint."""

    query: str
    path: str = "."
    top_n: int = 10


@router.post("/search")
async def semantic_search(body: SearchRequest) -> dict:
    """Run a natural-language search over the codebase files.

    Uses the sentence-transformer semantic index cached in
    :class:`~cni.server.state.RepoState` for fast repeated queries.

    Returns a ranked list of files with relevance scores.
    """
    try:
        file_paths = repo_state.get_file_paths()
    except RepoStateError:
        return JSONResponse(
            status_code=400,
            content={
                "error": "No repo analyzed yet",
                "hint": "Send POST /api/analyze first",
            },
        )

    if not body.query.strip():
        return {"results": []}

    try:
        index = repo_state.get_semantic_index()
    except Exception as exc:
        log.warning("Failed to build semantic index: %s", exc)
        return JSONResponse(
            status_code=500,
            content={
                "error": "Failed to build semantic index",
                "hint": str(exc),
            },
        )

    try:
        from cni.retrieval.semantic_search import _cosine_similarity

        query_vec: np.ndarray = index.model.encode(
            body.query,
            convert_to_numpy=True,
            normalize_embeddings=False,
        ).astype(np.float32)

        scores = _cosine_similarity(query_vec, index.embeddings)
        top_indices = np.argsort(scores)[-body.top_n :][::-1]

        results = []
        for i in top_indices:
            fp = index.file_paths[i]
            filename = Path(fp).name
            score = float(scores[i])
            if score > 0.0:
                results.append({"file": filename, "path": fp, "score": round(score, 3)})

        return {"results": results}

    except Exception as exc:
        log.warning("Semantic search failed: %s", exc)
        return JSONResponse(
            status_code=500,
            content={"error": f"Search failed: {exc}"},
        )
