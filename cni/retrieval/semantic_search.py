"""
cni/retrieval/semantic_search.py

Selects relevant repository files using sentence-transformer embeddings.
Provides a build_index / search_index interface for semantic code search.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import numpy as np
from sentence_transformers import SentenceTransformer

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DEFAULT_MODEL: str = "all-MiniLM-L6-v2"   # fast, good quality, ~80 MB
TOP_N: int = 5
MAX_FILE_CHARS: int = 8_000                # truncate large files before embedding


# ---------------------------------------------------------------------------
# Index dataclass
# ---------------------------------------------------------------------------

@dataclass
class SemanticIndex:
    """
    In-memory semantic index over repository files.

    Attributes:
        model:       Loaded SentenceTransformer model.
        file_paths:  Ordered list of absolute file path strings.
        embeddings:  2-D float32 array, shape (n_files, embedding_dim).
                     Row i corresponds to file_paths[i].
    """
    model: SentenceTransformer
    file_paths: list[str] = field(default_factory=list)
    embeddings: Optional[np.ndarray] = field(default=None)

    @property
    def is_empty(self) -> bool:
        return not self.file_paths or self.embeddings is None


# Module-level singleton — build_index populates it, search_index reads it.
_index: Optional[SemanticIndex] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _read_file(path: Path) -> str:
    """
    Read a source file as UTF-8, truncating to MAX_FILE_CHARS.
    Prepends the filename so the embedding captures the file's identity
    even when its content is short or generic.
    """
    try:
        content = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        content = ""
    header = f"# file: {path.name}\n"
    return (header + content)[:MAX_FILE_CHARS]


def _cosine_similarity(query_vec: np.ndarray, matrix: np.ndarray) -> np.ndarray:
    """
    Compute cosine similarity between a single query vector and every row
    in matrix.

    Args:
        query_vec: 1-D float32 array of shape (dim,).
        matrix:    2-D float32 array of shape (n, dim).

    Returns:
        1-D float32 array of shape (n,) with similarity scores in [-1, 1].
    """
    query_norm = query_vec / (np.linalg.norm(query_vec) + 1e-10)
    matrix_norms = matrix / (np.linalg.norm(matrix, axis=1, keepdims=True) + 1e-10)
    return matrix_norms @ query_norm


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def build_index(
    files: list[str],
    model_name: str = DEFAULT_MODEL,
) -> None:
    """
    Compute and store embeddings for each file's content.

    Each file's content is read from disk, truncated to *MAX_FILE_CHARS*,
    and encoded by the sentence-transformer model.  Unreadable files are
    included with an empty-content embedding so index positions stay
    aligned with *file_paths*.

    The resulting :class:`SemanticIndex` is stored in the module-level
    singleton and can be queried via :func:`search_index`.

    Args:
        files:      List of absolute (or resolvable) file path strings.
        model_name: HuggingFace model name or local path.
                    Defaults to ``'all-MiniLM-L6-v2'``.

    Raises:
        ValueError: If *files* list is empty.
    """
    global _index

    if not files:
        raise ValueError("Cannot build index from an empty file list.")

    model = SentenceTransformer(model_name)

    # Read all file contents
    texts: list[str] = [_read_file(Path(f)) for f in files]

    # Encode in one batched call — much faster than encoding one by one
    embeddings: np.ndarray = model.encode(
        texts,
        batch_size=32,
        show_progress_bar=len(files) > 50,
        convert_to_numpy=True,
        normalize_embeddings=False,   # we normalize manually in similarity
    )

    _index = SemanticIndex(
        model=model,
        file_paths=list(files),
        embeddings=embeddings.astype(np.float32),
    )


def search_index(
    query: str,
    k: int = TOP_N,
    *,
    top_n: int | None = None,
    index: SemanticIndex | None = None,
) -> list[str]:
    """
    Return the top-*k* most semantically similar files to *query*.

    Args:
        query:  Natural language query string.
        k:      Maximum number of results to return.  Defaults to 5.
        top_n:  **Deprecated** alias for *k* (kept for backward compat).
        index:  :class:`SemanticIndex` to search.  Defaults to the
                module-level singleton populated by :func:`build_index`.

    Returns:
        List of file path strings ordered by descending similarity.
        May be shorter than *k* if the index contains fewer files.

    Raises:
        RuntimeError: If no index has been built yet.
        ValueError:   If *query* is empty.
    """
    n = top_n if top_n is not None else k

    target = index or _index
    if target is None or target.is_empty:
        raise RuntimeError(
            "No semantic index found. Call build_index(files) first."
        )
    if not query.strip():
        raise ValueError("Query must not be empty.")

    query_vec: np.ndarray = target.model.encode(
        query,
        convert_to_numpy=True,
        normalize_embeddings=False,
    ).astype(np.float32)

    scores = _cosine_similarity(query_vec, target.embeddings)

    # argsort ascending → take last n reversed for descending order
    top_indices = np.argsort(scores)[-n:][::-1]

    return [target.file_paths[i] for i in top_indices]


# ---------------------------------------------------------------------------
# Function-level index (Problem 6)
# ---------------------------------------------------------------------------

_fn_index: SemanticIndex | None = None
_fn_units: list[dict] = []


def build_function_index(
    units: list[dict],
    model_name: str = DEFAULT_MODEL,
) -> None:
    """Build a semantic index over function/class units.

    Each unit's ``source`` field is embedded instead of reading whole files.

    Args:
        units:      List of dicts from :func:`extract_functions`.
        model_name: HuggingFace model name.
    """
    global _fn_index, _fn_units

    if not units:
        _fn_index = None
        _fn_units = []
        return

    model = SentenceTransformer(model_name)

    texts: list[str] = []
    for u in units:
        header = f"# {u['name']} in {Path(u['file_path']).name}\n"
        text = (header + u.get("source", ""))[:MAX_FILE_CHARS]
        texts.append(text)

    embeddings: np.ndarray = model.encode(
        texts,
        batch_size=32,
        show_progress_bar=len(texts) > 50,
        convert_to_numpy=True,
        normalize_embeddings=False,
    )

    _fn_index = SemanticIndex(
        model=model,
        file_paths=[u["file_path"] for u in units],
        embeddings=embeddings.astype(np.float32),
    )
    _fn_units = list(units)


def search_function_index(query: str, k: int = 10) -> list[dict]:
    """Return the top-*k* most relevant function units for *query*.

    Args:
        query: Natural language query string.
        k:     Maximum number of results.

    Returns:
        List of function unit dicts ordered by descending similarity.
        Empty list if no function index has been built.
    """
    if _fn_index is None or _fn_index.is_empty or not _fn_units:
        return []

    if not query.strip():
        return []

    query_vec: np.ndarray = _fn_index.model.encode(
        query,
        convert_to_numpy=True,
        normalize_embeddings=False,
    ).astype(np.float32)

    scores = _cosine_similarity(query_vec, _fn_index.embeddings)
    top_indices = np.argsort(scores)[-k:][::-1]

    return [_fn_units[i] for i in top_indices if i < len(_fn_units)]