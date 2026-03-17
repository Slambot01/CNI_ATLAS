"""
tests/test_impact.py
"""

from __future__ import annotations

from pathlib import Path

import networkx as nx
import pytest

from cni.analysis.impact import analyze_impact


def _build_large_graph() -> tuple[nx.DiGraph, list[str]]:
    """Build a graph with a hub node that has ≥ 20 transitive dependents."""
    g = nx.DiGraph()
    hub = "src/core.py"
    all_files: list[str] = [hub]

    # 25 files all depend on core.py → core has 25 predecessors
    for i in range(25):
        name = f"src/mod_{i}.py"
        g.add_node(name)
        g.add_edge(name, hub)
        all_files.append(name)

    g.add_node(hub)
    return g, all_files


class TestAnalyzeImpact:
    """Tests for analyze_impact()."""

    def test_returns_all_transitive_dependents(self) -> None:
        """Both direct and indirect dependents must be included."""
        g = nx.DiGraph()
        # A → B → C  (C depends on B which depends on A)
        g.add_edge("B.py", "A.py")
        g.add_edge("C.py", "B.py")
        all_files = ["A.py", "B.py", "C.py"]

        report = analyze_impact(g, "A.py", all_files)
        assert report["direct_count"] >= 1
        assert report["transitive_count"] >= 2

    def test_entry_point_scores_plus_three(self, tmp_path: Path) -> None:
        """Entry points (files with @app.route) receive +3 in scoring."""
        # Create a file that qualifies as an entry point
        ep = tmp_path / "routes.py"
        ep.write_text("@app.route('/home')\ndef home():\n    pass\n")

        g = nx.DiGraph()
        g.add_edge(str(ep), "src/core.py")
        g.add_node("src/core.py")

        report = analyze_impact(g, "src/core.py", [str(ep), "src/core.py"], repo_path=str(tmp_path))

        # The entry point dependent should have a score ≥ 3
        scores = [d["score"] for d in report["critical_dependents"]]
        assert any(s >= 3 for s in scores)

    def test_risk_level_high_when_many_dependents(self) -> None:
        """Risk should be HIGH when transitive dependents >= 20."""
        g, all_files = _build_large_graph()
        report = analyze_impact(g, "src/core.py", all_files)
        assert report["risk_level"] == "HIGH"

    def test_isolated_node_returns_empty_dependents(self) -> None:
        """A node with no dependents should return zeros."""
        g = nx.DiGraph()
        g.add_node("lonely.py")
        report = analyze_impact(g, "lonely.py", ["lonely.py"])
        assert report["direct_count"] == 0
        assert report["transitive_count"] == 0
