"""
cni/retrieval/context_builder.py

Selects relevant files from the dependency graph using semantic embeddings.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

import networkx as nx

from . import semantic_search


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_relevant_files(
    graph: nx.DiGraph,
    query: str,
    top_n: int = 5,
) -> list[str]:
    """
    Return the most semantically similar files from the dependency graph.

    Uses semantic embeddings via sentence-transformers for more powerful
    queries than simple keyword matching.

    Args:
        graph: Directed dependency graph (nodes = file path strings).
        query: Natural language query from the user.
        top_n: Maximum number of files to return. Defaults to 5.

    Returns:
        List of file path strings ordered by semantic similarity.

    Examples:
        get_relevant_files(graph, "How is the dependency graph constructed?")
        → ['.../graph_builder.py', '.../repo_scanner.py', ...]
    """
    if not query.strip():
        return []
    if graph.number_of_nodes() == 0:
        return []

    file_list = list(graph.nodes)

    try:
        # Build semantic index for all files in the graph
        index = semantic_search.build_index(file_list)
        # Search using semantic similarity
        return semantic_search.search_index(query, top_n=top_n, index=index)
    except Exception:
        # Fallback to empty list if semantic search fails
        return []


# ---------------------------------------------------------------------------
# Context Building
# ---------------------------------------------------------------------------

def build_context(
    graph: nx.DiGraph,
    query: str,
    top_n: int = 5,
    max_lines: int = 50,
) -> str:
    """
    Build a context string from semantically relevant files.

    Steps:
      1. Find relevant files using semantic embeddings
      2. Read and load file contents
      3. Combine into a formatted context string

    Args:
        graph: Directed dependency graph (nodes = file path strings).
        query: Natural language query/question from the user.
        top_n: Maximum number of files to include. Defaults to 5.
        max_lines: Maximum lines per file. Defaults to 50.

    Returns:
        Formatted context string ready to send to an LLM.
    """
    relevant_files = get_relevant_files(graph, query, top_n=top_n)

    if not relevant_files:
        return "No relevant files found in the codebase for this query."

    context_parts: list[str] = []

    for file_path in relevant_files:
        try:
            path_obj = Path(file_path)
            if path_obj.exists() and path_obj.is_file():
                content = path_obj.read_text(encoding="utf-8", errors="replace")
                lines = content.splitlines()
                truncated = "\n".join(lines[:max_lines])
                if len(lines) > max_lines:
                    truncated += f"\n... ({len(lines) - max_lines} more lines)"

                context_parts.append(f"FILE: {file_path}\n{truncated}")
        except Exception:
            # Skip files that can't be read
            pass

    return "\n\n".join(context_parts) if context_parts else "Could not read relevant files."
