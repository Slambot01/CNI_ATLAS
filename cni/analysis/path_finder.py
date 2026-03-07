"""
cni/analysis/path_finder.py

Finds dependency paths between files in the dependency graph.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

import networkx as nx


# ---------------------------------------------------------------------------
# Path finding
# ---------------------------------------------------------------------------

def find_dependency_path(
    graph: nx.DiGraph,
    source: str,
    target: str,
) -> Optional[list[str]]:
    """
    Find the shortest dependency path between two files in the graph.

    Args:
        graph:  Directed dependency graph (nodes = file path strings).
        source: Path string of the starting file.
        target: Path string of the destination file.

    Returns:
        Ordered list of node strings representing the path from source to
        target, or None if no path exists or either node is not in the graph.
    """
    if source not in graph:
        return None
    if target not in graph:
        return None
    if source == target:
        return [source]

    try:
        return nx.shortest_path(graph, source=source, target=target)
    except nx.NetworkXNoPath:
        return None
    except nx.NodeNotFound:
        return None


# ---------------------------------------------------------------------------
# Output formatting
# ---------------------------------------------------------------------------

def print_dependency_path(path: Optional[list[str]]) -> None:
    """
    Pretty-print a dependency path as an indented arrow chain.

    Args:
        path: Ordered list of node strings as returned by
              find_dependency_path, or None.

    Example output:
        api.py
          → auth_service.py
              → database.py
    """
    if not path:
        print("No dependency path found.")
        return

    for i, node in enumerate(path):
        label = Path(node).name
        if i == 0:
            print(label)
        else:
            indent = "  " * i
            print(f"{indent}→ {label}")