"""
cni/graph/export.py

Exports a NetworkX dependency graph to PNG (or any Graphviz-supported
format) with directory-based subgraph clustering and in-degree coloring.
"""

from __future__ import annotations

from collections import defaultdict
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
    """Export a dependency graph to an image file using Graphviz.

    Enhancements over the original version:

    * **Cluster by directory** — files in the same parent directory are
      grouped into a Graphviz ``subgraph cluster_*``.
    * **In-degree coloring** — nodes are colored based on how many other
      files depend on them:

      - 0 dependents  → white (``#ffffff``)
      - 1–4 dependents → light blue (``#d0e8ff``)
      - 5+ dependents  → red (``#ffcccc``)

    * **Filename-only labels** — node labels show only the file name.
    * **Edge labels** — if the graph builder stored the raw import string
      in the edge's ``label`` attribute, it is shown on the edge.
    * **Left-to-right layout** (``rankdir=LR``).

    Args:
        graph:       Directed dependency graph (nodes = file path strings).
        output_file: Destination path **without** extension (Graphviz
                     appends it automatically).
        fmt:         Output format — ``'png'``, ``'svg'``, or ``'pdf'``.
                     Defaults to ``'png'``.
        cleanup:     Remove the intermediate ``.dot`` source file after
                     rendering.

    Returns:
        :class:`~pathlib.Path` to the rendered output file.

    Raises:
        ValueError:  If the graph is empty.
        RuntimeError: If Graphviz rendering fails.
    """
    if graph.number_of_nodes() == 0:
        raise ValueError("Cannot export an empty graph.")

    # ------------------------------------------------------------------ #
    # Colour helper
    # ------------------------------------------------------------------ #
    def _node_color(node: str) -> str:
        in_deg: int = graph.in_degree(node)
        if in_deg >= 5:
            return "#ffcccc"
        if in_deg >= 1:
            return "#d0e8ff"
        return "#ffffff"

    # ------------------------------------------------------------------ #
    # Group nodes by parent directory
    # ------------------------------------------------------------------ #
    dir_groups: dict[str, list[str]] = defaultdict(list)
    for node in graph.nodes:
        parent = str(Path(node).parent)
        dir_groups[parent].append(node)

    # ------------------------------------------------------------------ #
    # Build the Digraph
    # ------------------------------------------------------------------ #
    dot = Digraph(
        comment="CNI Dependency Graph",
        graph_attr={
            "rankdir": "LR",
            "fontsize": "12",
            "splines": "ortho",
        },
        node_attr={
            "shape": "box",
            "style": "filled",
            "fontname": "Helvetica",
            "fontsize": "11",
        },
        edge_attr={
            "arrowsize": "0.7",
            "color": "#555555",
        },
    )

    # Add nodes inside subgraph clusters grouped by directory
    for idx, (directory, nodes) in enumerate(sorted(dir_groups.items())):
        with dot.subgraph(name=f"cluster_{idx}") as sub:
            sub.attr(
                label=directory,
                style="dashed",
                color="#888888",
                fontsize="10",
                fontname="Helvetica",
            )
            for node in nodes:
                label = Path(node).name
                fill = _node_color(node)
                sub.node(node, label=label, fillcolor=fill)

    # Add edges with import-string labels
    for u, v, data in graph.edges(data=True):
        edge_label: str = data.get("label", "")
        dot.edge(u, v, label=edge_label)

    # ------------------------------------------------------------------ #
    # Render
    # ------------------------------------------------------------------ #
    output_path = Path(output_file)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        rendered: str = dot.render(
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