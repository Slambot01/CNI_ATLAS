"""
cni/retrieval/context_builder.py

Builds LLM-ready context from the dependency graph using semantic search.

Strategy (Problem 6 upgrade):
  1. Extract function/class units from all Python files in the graph.
  2. If units are found, build a function-level semantic index and
     retrieve the top 10 most relevant units.
  3. If no units are found (e.g. non-Python repos), fall back to
     file-level retrieval (top 5 files).
  4. Enforce a 12,000-character hard limit on the context string.

Edge cases handled:
  - Empty / stopword-only queries → warns "too generic".
  - All files deleted since indexing → warns "no readable files".
  - Graph has nodes but all unreadable → graceful empty return.
"""

from __future__ import annotations

import sys
from pathlib import Path

import networkx as nx

from cni.analyzer.repo_scanner import extract_functions
from cni.retrieval.semantic_search import (
    build_function_index,
    build_index,
    search_function_index,
    search_index,
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MAX_CONTEXT_CHARS: int = 12_000
"""Hard limit on the total context string sent to the LLM."""

# Common English stopwords — a query consisting entirely of these is too
# generic to produce useful semantic search results.
_STOPWORDS: set[str] = {
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "shall",
    "should", "may", "might", "must", "can", "could", "it", "its", "this",
    "that", "these", "those", "i", "me", "my", "we", "our", "you", "your",
    "he", "she", "they", "them", "what", "which", "who", "whom", "how",
    "where", "when", "why", "not", "no", "nor", "and", "or", "but", "if",
    "of", "at", "by", "for", "with", "about", "to", "from", "in", "on",
    "up", "out", "into", "all", "so", "than",
}


def _warn(message: str) -> None:
    """Print a yellow warning to stderr."""
    sys.stderr.write(f"\033[33m⚠  {message}\033[0m\n")


def _is_stopword_only(query: str) -> bool:
    """Return True if every word in *query* is a stopword."""
    words = query.lower().split()
    return len(words) > 0 and all(w in _STOPWORDS for w in words)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def build_context(graph: nx.DiGraph, query: str) -> str:
    """Build a context string from the most semantically relevant code.

    Attempts function-level indexing first (for precise, focused context).
    Falls back to file-level indexing if no function units can be
    extracted (e.g. for JS/TS repos or empty graphs).

    Args:
        graph: Directed dependency graph (nodes = file path strings).
        query: Natural language query/question from the user.

    Returns:
        Formatted context string ready to send to an LLM.
    """
    if graph.number_of_nodes() == 0:
        return "No relevant files found in the codebase for this query."

    if not query.strip():
        return "No relevant files found in the codebase for this query."

    # Stopword-only guard
    if _is_stopword_only(query):
        _warn("Query too generic. Try being more specific.")
        return ""

    file_paths: list[str] = list(graph.nodes)

    # ------------------------------------------------------------------
    # Try function-level indexing first
    # ------------------------------------------------------------------
    all_units: list[dict] = []
    for fp in file_paths:
        try:
            all_units.extend(extract_functions(fp))
        except Exception:  # noqa: BLE001
            pass

    if all_units:
        try:
            build_function_index(all_units)
            relevant_units = search_function_index(query, k=10)
        except Exception:  # noqa: BLE001
            relevant_units = []

        if relevant_units:
            return _format_function_context(relevant_units)

    # ------------------------------------------------------------------
    # Fallback: file-level indexing
    # ------------------------------------------------------------------
    try:
        build_index(file_paths)
        relevant_files: list[str] = search_index(query, k=5)
    except Exception:  # noqa: BLE001
        relevant_files = []

    if not relevant_files:
        _warn("No readable files found for this query.")
        return ""

    return _format_file_context(relevant_files)


# ---------------------------------------------------------------------------
# Formatters
# ---------------------------------------------------------------------------

def _format_function_context(units: list[dict]) -> str:
    """Format function units into an LLM context string."""
    parts: list[str] = []

    for unit in units:
        header = (
            f"FUNCTION: {unit['name']}\n"
            f"FILE: {unit['file_path']}  "
            f"(lines {unit['line_start']}-{unit['line_end']})\n"
        )
        parts.append(header + unit.get("source", ""))

    combined = "\n\n".join(parts)
    return combined[:MAX_CONTEXT_CHARS]


def _format_file_context(file_paths: list[str]) -> str:
    """Format whole file contents into an LLM context string."""
    parts: list[str] = []

    for file_path in file_paths:
        try:
            path_obj = Path(file_path)
            if path_obj.exists() and path_obj.is_file():
                content = path_obj.read_text(encoding="utf-8", errors="replace")
                parts.append(f"FILE: {file_path}\n{content}")
        except Exception:  # noqa: BLE001
            pass

    if not parts:
        _warn("No readable files found for this query.")
        return ""

    combined = "\n\n".join(parts)
    return combined[:MAX_CONTEXT_CHARS]
