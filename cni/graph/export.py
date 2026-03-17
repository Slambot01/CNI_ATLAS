"""
cni/graph/export.py

Exports a NetworkX dependency graph to a professional-quality PNG (or SVG/PDF)
image using **matplotlib** and networkx drawing.

Features:

* **Hierarchical left-to-right layout** via ``graphviz_layout`` (falls back
  to spring layout if pygraphviz is unavailable).
* **In-degree colouring** — white → light-blue → red as popularity grows.
* **Noise filtering** — ``__init__.py``, ``test_*``, and isolated nodes
  (in large graphs) are stripped before rendering.
* **Smart scaling** — layout, font size, node size, and figure dimensions
  adapt automatically based on the number of visible nodes.
* **Filename-only labels** for readability.
* **Colour legend** explaining the node shading.
"""

from __future__ import annotations

import matplotlib
matplotlib.use("Agg")  # non-interactive backend — must be set before pyplot

import matplotlib.pyplot as plt  # noqa: E402
import matplotlib.patches as mpatches  # noqa: E402

from collections import defaultdict
from pathlib import Path

import networkx as nx


# ---------------------------------------------------------------------------
# Graph filtering helpers (public — re-exported by cli/main.py)
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
        return graph.copy()

    keep: set[str] = set()
    for ep in entry_points:
        for node in nx.single_source_shortest_path_length(
            graph, ep, cutoff=depth
        ):
            keep.add(node)

    return graph.subgraph(keep).copy()


def filter_graph_by_imports(graph: nx.DiGraph, min_imports: int) -> nx.DiGraph:
    """Keep only nodes imported by at least *min_imports* other modules.

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


# ---------------------------------------------------------------------------
# Core export — matplotlib + networkx drawing
# ---------------------------------------------------------------------------

def export_graph(
    graph: nx.DiGraph,
    output_file: str,
    fmt: str = "png",
    cleanup: bool = True,
) -> Path:
    """Export a dependency graph to an image file using matplotlib.

    Before rendering, the graph undergoes automatic noise reduction:

    * ``__init__.py`` nodes are removed.
    * ``test_*`` nodes are removed.
    * Isolated nodes (no edges) are removed when the graph has 60+ nodes.
    * For large repos, low-connectivity nodes are pruned automatically.

    Nodes are coloured by in-degree:

    ========  ==========
    In-degree Fill
    ========  ==========
    0         white
    1–4       light blue
    5+        red
    ========  ==========

    Args:
        graph:       Directed dependency graph (nodes = file path strings).
        output_file: Destination path **without** extension.
        fmt:         Output format — ``'png'``, ``'svg'``, or ``'pdf'``.
        cleanup:     Ignored (kept for API compatibility — no intermediate
                     files are produced by the matplotlib backend).

    Returns:
        :class:`~pathlib.Path` to the rendered output file.

    Raises:
        ValueError: If the graph is empty.
    """
    if graph.number_of_nodes() == 0:
        raise ValueError("Cannot export empty graph.")

    # ------------------------------------------------------------------
    # 1. Filter noise (filename patterns)
    # ------------------------------------------------------------------
    filtered = graph.copy()
    total_before = filtered.number_of_nodes()

    nodes_to_remove = [
        n for n in filtered.nodes
        if Path(n).name.startswith("__init__")
        or Path(n).name.startswith("test_")
        or Path(n).name.endswith("_test.py")
        or Path(n).name.startswith("validate")
        or Path(n).name == "conftest.py"
        or Path(n).name == "generate_demo.py"
    ]
    filtered.remove_nodes_from(nodes_to_remove)

    # Remove isolated nodes if graph is large
    if filtered.number_of_nodes() > 60:
        isolated = [
            n for n in filtered.nodes
            if filtered.in_degree(n) == 0
            and filtered.out_degree(n) == 0
        ]
        filtered.remove_nodes_from(isolated)

    # ------------------------------------------------------------------
    # 2. Smart filtering by node count (large repo scaling)
    # ------------------------------------------------------------------
    node_count = filtered.number_of_nodes()

    if node_count > 150:
        min_edges = 2
    elif node_count > 80:
        min_edges = 1
    else:
        min_edges = 0

    if min_edges > 0:
        low_connectivity = [
            n for n in filtered.nodes
            if (filtered.in_degree(n) + filtered.out_degree(n)) < min_edges
        ]
        filtered.remove_nodes_from(low_connectivity)

    # Refresh count after all filtering
    node_count = filtered.number_of_nodes()

    if node_count == 0:
        raise ValueError(
            "All nodes were removed after filtering. "
            "Try a less aggressive filter or check your repository path."
        )

    # ------------------------------------------------------------------
    # 3. Layout by size
    # ------------------------------------------------------------------
    try:
        if node_count > 100:
            pos = nx.kamada_kawai_layout(filtered)
        else:
            pos = nx.spring_layout(filtered, k=3, seed=42)
    except Exception:
        pos = nx.spring_layout(filtered, k=3, seed=42)

    # ------------------------------------------------------------------
    # 4. Node colours by in-degree
    # ------------------------------------------------------------------
    def node_color(n: str) -> str:
        deg = filtered.in_degree(n)
        if deg == 0:
            return "#ffffff"
        elif deg <= 4:
            return "#d0e8ff"
        else:
            return "#ffcccc"

    colors = [node_color(n) for n in filtered.nodes]
    labels = {n: Path(n).name for n in filtered.nodes}

    # ------------------------------------------------------------------
    # 5. Dynamic sizing based on node count
    # ------------------------------------------------------------------
    width = max(24, min(60, node_count * 0.5))
    height = max(16, min(40, node_count * 0.3))

    if node_count > 100:
        font_size = 6
        node_size = 1200
    elif node_count > 50:
        font_size = 8
        node_size = 1800
    else:
        font_size = 10
        node_size = 2200

    fig, ax = plt.subplots(figsize=(width, height))
    fig.patch.set_facecolor("#ffffff")
    ax.set_facecolor("#f8f9fa")

    # ------------------------------------------------------------------
    # 6. Draw edges first (behind nodes)
    # ------------------------------------------------------------------
    nx.draw_networkx_edges(
        filtered, pos,
        ax=ax,
        arrows=True,
        arrowsize=15,
        arrowstyle="-|>",
        edge_color="#888888",
        width=0.8,
        alpha=0.7,
        connectionstyle="arc3,rad=0.1",
    )

    # ------------------------------------------------------------------
    # 7. Draw nodes
    # ------------------------------------------------------------------
    nx.draw_networkx_nodes(
        filtered, pos,
        ax=ax,
        node_color=colors,
        node_size=node_size,
        node_shape="s",  # square
        edgecolors="#333333",
        linewidths=1.5,
    )

    # ------------------------------------------------------------------
    # 8. Draw labels
    # ------------------------------------------------------------------
    nx.draw_networkx_labels(
        filtered, pos,
        labels=labels,
        ax=ax,
        font_size=font_size,
        font_family="monospace",
        font_color="#222222",
    )

    # ------------------------------------------------------------------
    # 9. Legend
    # ------------------------------------------------------------------
    legend_elements = [
        mpatches.Patch(color="#ffffff", ec="#333333", label="0 dependents"),
        mpatches.Patch(color="#d0e8ff", ec="#333333", label="1-4 dependents"),
        mpatches.Patch(color="#ffcccc", ec="#333333", label="5+ dependents"),
    ]
    ax.legend(
        handles=legend_elements,
        loc="upper left",
        fontsize=9,
        framealpha=0.9,
    )

    ax.set_title(
        "CNI Dependency Graph",
        fontsize=16,
        fontweight="bold",
        pad=20,
    )
    ax.axis("off")

    # ------------------------------------------------------------------
    # 10. Watermark — showing filtered stats
    # ------------------------------------------------------------------
    ax.text(
        0.01, 0.01,
        f"Showing {node_count} of {total_before} modules",
        transform=ax.transAxes,
        fontsize=8,
        color="#999999",
        ha="left",
        va="bottom",
    )

    plt.tight_layout()

    # ------------------------------------------------------------------
    # 11. Save
    # ------------------------------------------------------------------
    output_path = Path(output_file)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    out = output_path.with_suffix(f".{fmt}")
    plt.savefig(out, dpi=150, bbox_inches="tight", facecolor="#ffffff")
    plt.close()

    return out