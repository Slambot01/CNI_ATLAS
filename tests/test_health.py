"""
tests/test_health.py
"""

from __future__ import annotations

import networkx as nx
import pytest

from cni.analysis.health import compute_health


def _make_god_module_graph() -> nx.DiGraph:
    """Build a graph where one node has in-degree >= 10 (god module)."""
    g = nx.DiGraph()
    god = "src/utils.py"
    g.add_node(god)
    for i in range(12):
        name = f"src/mod_{i}.py"
        g.add_node(name)
        g.add_edge(name, god)
    return g


def _make_coupled_module_graph() -> nx.DiGraph:
    """Build a graph where one node has out-degree >= 15."""
    g = nx.DiGraph()
    coupled = "src/main.py"
    g.add_node(coupled)
    for i in range(16):
        name = f"src/dep_{i}.py"
        g.add_node(name)
        g.add_edge(coupled, name)
    return g


class TestComputeHealth:
    """Tests for compute_health()."""

    def test_identifies_god_modules(self) -> None:
        """Modules with in-degree >= 10 must be flagged."""
        g = _make_god_module_graph()
        report = compute_health(g)
        god_names = [gm["file"] for gm in report["god_modules"]]
        assert "utils.py" in god_names

    def test_identifies_coupled_modules(self) -> None:
        """Modules with out-degree >= 15 must be flagged."""
        g = _make_coupled_module_graph()
        report = compute_health(g)
        coupled_names = [cm["file"] for cm in report["coupled_modules"]]
        assert "main.py" in coupled_names

    def test_health_score_decreases_with_god_modules(self) -> None:
        """Health score should be lower when god modules are present."""
        clean = nx.DiGraph()
        clean.add_nodes_from([f"src/{i}.py" for i in range(5)])

        god_graph = _make_god_module_graph()

        clean_report = compute_health(clean)
        god_report = compute_health(god_graph)

        assert god_report["health_score"] < clean_report["health_score"]

    def test_isolated_modules_counted_correctly(self) -> None:
        """Isolated node count must be accurate."""
        g = nx.DiGraph()
        # 3 isolated nodes
        g.add_node("a.py")
        g.add_node("b.py")
        g.add_node("c.py")
        # 1 connected pair
        g.add_edge("d.py", "e.py")

        report = compute_health(g)
        assert report["isolated_count"] == 3
