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


# ---------------------------------------------------------------------------
# Graph filtering helpers
# ---------------------------------------------------------------------------

def _detect_entry_points(graph: nx.DiGraph) -> list[str]:
    """Return nodes with zero in-degree (likely entry points)."""
    return [n for n in graph.nodes if graph.in_degree(n) == 0]


def filter_graph_by_depth(graph: nx.DiGraph, depth: int) -> nx.DiGraph:
    """Keep only nodes within *depth* hops from detected entry points.

    Entry points are nodes with zero in-degree.  A BFS is performed from
    each entry point and only nodes reachable within *depth* hops are
    retained in the returned subgraph.

    Args:
        graph: Directed dependency graph.
        depth: Maximum number of hops from any entry point.

    Returns:
        A new DiGraph containing only the filtered nodes and their edges.
    """
    entry_points = _detect_entry_points(graph)
    if not entry_points:
        # Fall back to using all nodes if no clear entry points exist
        return graph.copy()

    keep: set[str] = set()
    for ep in entry_points:
        for node, dist in nx.single_source_shortest_path_length(graph, ep, cutoff=depth).items():
            keep.add(node)

    return graph.subgraph(keep).copy()


def filter_graph_by_imports(graph: nx.DiGraph, min_imports: int) -> nx.DiGraph:
    """Keep only nodes imported by at least *min_imports* other modules.

    Nodes with in-degree below the threshold are removed, along with any
    edges touching them.

    Args:
        graph:       Directed dependency graph.
        min_imports: Minimum in-degree a node must have to be retained.

    Returns:
        A new DiGraph containing only hub modules.
    """
    keep = {n for n in graph.nodes if graph.in_degree(n) >= min_imports}
    return graph.subgraph(keep).copy()


def cluster_graph_by_directory(graph: nx.DiGraph) -> nx.DiGraph:
    """Collapse files into directory-level nodes.

    Every file node is replaced by its parent directory.  Edges between
    files in different directories become edges between the directory
    nodes.  Self-loops (intra-directory edges) are dropped.

    Args:
        graph: Directed dependency graph (nodes = file paths).

    Returns:
        A new DiGraph where nodes represent directories and edges
        represent cross-directory dependencies.
    """
    clustered = nx.DiGraph()

    for node in graph.nodes:
        directory = str(Path(node).parent)
        if not clustered.has_node(directory):
            clustered.add_node(directory, file_count=0)
        clustered.nodes[directory]["file_count"] = (
            clustered.nodes[directory].get("file_count", 0) + 1
        )

    for u, v in graph.edges:
        src_dir = str(Path(u).parent)
        tgt_dir = str(Path(v).parent)
        if src_dir != tgt_dir:
            if clustered.has_edge(src_dir, tgt_dir):
                clustered[src_dir][tgt_dir]["weight"] = (
                    clustered[src_dir][tgt_dir].get("weight", 0) + 1
                )
            else:
                clustered.add_edge(src_dir, tgt_dir, weight=1)

    return clustered


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