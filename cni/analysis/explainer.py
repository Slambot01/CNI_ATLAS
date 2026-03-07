"""
cni/analysis/explainer.py

Explains how a file participates in the dependency graph.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional, TypedDict

import networkx as nx


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

class FileExplanation(TypedDict):
    file: str
    imports: list[str]
    imported_by: list[str]


# ---------------------------------------------------------------------------
# Node resolution
# ---------------------------------------------------------------------------

def _resolve_node(graph: nx.DiGraph, filename: str) -> Optional[str]:
    """
    Find the full node key in the graph that matches a given filename.

    Matching strategy (in order of preference):
      1. Exact match           — filename is already a full node key
      2. Suffix match          — node ends with the filename (handles
                                 partial paths like 'auth_service.py')
      3. Stem match            — node stem equals filename without extension
                                 (handles bare names like 'auth_service')

    Returns the first matching node key, or None if no match is found.
    """
    # 1. Exact match
    if filename in graph:
        return filename

    filename_path = Path(filename)

    for node in graph.nodes:
        node_path = Path(node)

        # 2. Suffix / partial path match  e.g. 'services/auth.py'
        try:
            if node_path.parts[-len(filename_path.parts):] == filename_path.parts:
                return node
        except IndexError:
            pass

        # 3. Stem match  e.g. 'auth_service' matches 'auth_service.py'
        if node_path.stem == filename_path.stem:
            return node

    return None


# ---------------------------------------------------------------------------
# Core logic
# ---------------------------------------------------------------------------

def explain_file(graph: nx.DiGraph, filename: str) -> Optional[FileExplanation]:
    """
    Explain how a file participates in the dependency graph.

    Args:
        graph:    Directed dependency graph (nodes = file path strings).
        filename: Full path, partial path, or bare stem of the file to explain.

    Returns:
        FileExplanation dict with keys 'file', 'imports', 'imported_by',
        or None if the file cannot be found in the graph.
    """
    node = _resolve_node(graph, filename)
    if node is None:
        return None

    imports: list[str] = [
        Path(neighbor).name
        for neighbor in graph.successors(node)
    ]

    imported_by: list[str] = [
        Path(neighbor).name
        for neighbor in graph.predecessors(node)
    ]

    return FileExplanation(
        file=Path(node).name,
        imports=sorted(imports),
        imported_by=sorted(imported_by),
    )


# ---------------------------------------------------------------------------
# Output formatting
# ---------------------------------------------------------------------------

def print_file_explanation(info: Optional[FileExplanation]) -> None:
    """
    Pretty-print a FileExplanation dict.

    Args:
        info: Dict returned by explain_file, or None.

    Example output:
        File: graph_builder.py
        Imports:
          networkx
          repo_scanner
        Imported by:
          cli/main.py
    """
    if info is None:
        print("File not found in dependency graph.")
        return

    print(f"File: {info['file']}")

    print("Imports:")
    if info["imports"]:
        for imp in info["imports"]:
            print(f"  {imp}")
    else:
        print("  (none)")

    print("Imported by:")
    if info["imported_by"]:
        for dep in info["imported_by"]:
            print(f"  {dep}")
    else:
        print("  (none)")