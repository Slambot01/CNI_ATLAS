"""
tests/test_explainer.py
"""

from __future__ import annotations

import networkx as nx
import pytest

from cni.analysis.explainer import explain_file


class TestExplainFile:
    """Tests for explain_file()."""

    def test_returns_correct_imports(
        self, sample_graph: nx.DiGraph
    ) -> None:
        """imports list should match outgoing edges (successors)."""
        result = explain_file(sample_graph, "src/main.py")
        assert result is not None
        # main.py → auth.py, database.py, routes.py
        assert "auth.py" in result["imports"]
        assert "database.py" in result["imports"]

    def test_returns_correct_imported_by(
        self, sample_graph: nx.DiGraph
    ) -> None:
        """imported_by list should match incoming edges (predecessors)."""
        result = explain_file(sample_graph, "src/auth.py")
        assert result is not None
        # auth.py is imported by main.py and routes.py
        assert "main.py" in result["imported_by"]
        assert "routes.py" in result["imported_by"]

    def test_returns_none_for_unknown_file(
        self, sample_graph: nx.DiGraph
    ) -> None:
        """None should be returned for a file not in the graph."""
        assert explain_file(sample_graph, "nonexistent.py") is None

    def test_resolves_partial_filename(
        self, sample_graph: nx.DiGraph
    ) -> None:
        """'auth.py' should resolve even when the node is 'src/auth.py'."""
        result = explain_file(sample_graph, "auth.py")
        assert result is not None
        assert result["file"] == "auth.py"
