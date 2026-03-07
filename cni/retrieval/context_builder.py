"""
cni/retrieval/context_builder.py

Builds LLM-ready context from the dependency graph using semantic search.
"""

from __future__ import annotations

from pathlib import Path

import networkx as nx

from cni.retrieval.semantic_search import build_index, search_index

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MAX_CONTEXT_CHARS: int = 12_000
"""Hard limit on the total context string sent to the LLM."""


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def build_context(graph: nx.DiGraph, query: str) -> str:
    """Build a context string from the most semantically relevant files.

    Steps:
      1. Call :func:`build_index` with all file paths from the graph nodes.
      2. Call :func:`search_index` to retrieve the top 5 most relevant files.
      3. Read each file's content from disk.
      4. Combine contents into a single formatted context string.
      5. Hard-limit the total context to :data:`MAX_CONTEXT_CHARS` characters.

    Args:
        graph: Directed dependency graph (nodes = file path strings).
        query: Natural language query/question from the user.

    Returns:
        Formatted context string ready to send to an LLM.
    """
    if graph.number_of_nodes() == 0 or not query.strip():
        return "No relevant files found in the codebase for this query."

    file_paths: list[str] = list(graph.nodes)

    # 1. Build the semantic index over all graph files
    build_index(file_paths)

    # 2. Retrieve the top-5 most relevant files
    relevant_files: list[str] = search_index(query, k=5)

    if not relevant_files:
        return "No relevant files found in the codebase for this query."

    # 3. Read file contents and format
    context_parts: list[str] = []

    for file_path in relevant_files:
        try:
            path_obj = Path(file_path)
            if path_obj.exists() and path_obj.is_file():
                content = path_obj.read_text(encoding="utf-8", errors="replace")
                context_parts.append(f"FILE: {file_path}\n{content}")
        except Exception:  # noqa: BLE001
            # Skip files that can't be read
            pass

    if not context_parts:
        return "Could not read relevant files."

    # 4. Combine and enforce the 12 000-character hard limit
    combined = "\n\n".join(context_parts)
    return combined[:MAX_CONTEXT_CHARS]
