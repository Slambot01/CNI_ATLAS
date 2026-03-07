"""
tests/test_path_finder.py
"""

from __future__ import annotations

import networkx as nx
import pytest

from cni.analysis.path_finder import find_dependency_path


class TestFindDependencyPath:
    """Tests for find_dependency_path()."""

    def test_finds_correct_shortest_path(
        self, sample_graph: nx.DiGraph
    ) -> None:
        """The returned path should be the shortest ordered path."""
        path = find_dependency_path(
            sample_graph, "src/main.py", "src/utils.py"
        )
        assert path is not None
        assert path[0] == "src/main.py"
        assert path[-1] == "src/utils.py"
        # Each consecutive pair must be a valid edge
        for i in range(len(path) - 1):
            assert sample_graph.has_edge(path[i], path[i + 1])

    def test_returns_none_when_no_path_exists(
        self, sample_graph: nx.DiGraph
    ) -> None:
        """None should be returned when no directed path exists."""
        # utils → main has no directed path (edges go the other way)
        result = find_dependency_path(
            sample_graph, "src/utils.py", "src/main.py"
        )
        assert result is None

    def test_source_equals_target_returns_single_node(
        self, sample_graph: nx.DiGraph
    ) -> None:
        """When source == target, return [source]."""
        result = find_dependency_path(
            sample_graph, "src/auth.py", "src/auth.py"
        )
        assert result == ["src/auth.py"]

    def test_returns_none_for_unknown_node(
        self, sample_graph: nx.DiGraph
    ) -> None:
        """None should be returned when a node is not in the graph."""
        result = find_dependency_path(
            sample_graph, "src/main.py", "nonexistent.py"
        )
        assert result is None
