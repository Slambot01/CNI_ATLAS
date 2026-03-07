"""
graph/export.py

Exports a NetworkX dependency graph to PNG (or any Graphviz-supported format).
"""

from __future__ import annotations

from pathlib import Path
from typing import Literal

import networkx as nx
from graphviz import Digraph

OutputFormat = Literal["png", "svg", "pdf"]


def export_graph(
    graph: nx.DiGraph,
    output_file: str,
    fmt: OutputFormat = "png",
    cleanup: bool = True,
) -> Path:
    """
    Export a dependency graph to an image file using Graphviz.

    Args:
        graph:       Directed dependency graph (nodes = file path strings).
        output_file: Destination path WITHOUT extension (Graphviz appends it).
        fmt:         Output format — 'png', 'svg', or 'pdf'. Defaults to 'png'.
        cleanup:     Remove the intermediate .dot source file after rendering.

    Returns:
        Path to the rendered output file.

    Raises:
        ValueError:  If the graph is empty.
        RuntimeError: If Graphviz rendering fails.
    """
    if graph.number_of_nodes() == 0:
        raise ValueError("Cannot export an empty graph.")

    # ------------------------------------------------------------------ #
    # Deduplicate stems — 'utils/auth.py' and 'core/auth.py' both become
    # 'auth', which causes silent node collisions in the original code.
    # Use the last two path components as a readable but unique label.
    # ------------------------------------------------------------------ #
    def _node_label(node: str) -> str:
        parts = Path(node).parts
        return "/".join(parts[-2:]) if len(parts) >= 2 else Path(node).name

    dot = Digraph(
        comment="CNI Dependency Graph",
        graph_attr={
            "rankdir": "LR",       # left-to-right is easier to read
            "fontsize": "12",
            "splines": "ortho",
        },
        node_attr={
            "shape": "box",
            "style": "filled",
            "fillcolor": "#f0f4ff",
            "fontname": "Helvetica",
            "fontsize": "11",
        },
        edge_attr={
            "arrowsize": "0.7",
            "color": "#555555",
        },
    )

    # Add nodes
    for node in graph.nodes:
        label = _node_label(node)
        # Highlight highly-depended-upon nodes
        in_deg = graph.in_degree(node)
        fill = "#ffd6d6" if in_deg >= 5 else "#f0f4ff"
        dot.node(node, label=label, fillcolor=fill)

    # Add edges
    for u, v, data in graph.edges(data=True):
        edge_label = data.get("label", "")
        dot.edge(u, v, label=edge_label)

    # ------------------------------------------------------------------ #
    # Render
    # ------------------------------------------------------------------ #
    output_path = Path(output_file)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        rendered = dot.render(
            filename=str(output_path),
            format=fmt,
            cleanup=cleanup,
            quiet=True,
        )
    except Exception as exc:
        raise RuntimeError(
            f"Graphviz rendering failed. Is Graphviz installed on your system?\n"
            f"  Install: https://graphviz.org/download/\n"
            f"  Detail : {exc}"
        ) from exc

    return Path(rendered)
    