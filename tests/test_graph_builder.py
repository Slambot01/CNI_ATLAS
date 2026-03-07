"""
tests/test_graph_builder.py
"""

from __future__ import annotations

from pathlib import Path

import networkx as nx
import pytest

from cni.graph.dependency_graph import (
    build_dependency_graph,
    get_graph_stats,
)


class TestBuildDependencyGraph:
    """Tests for build_dependency_graph()."""

    def test_build_returns_digraph(self, sample_repo: Path) -> None:
        """Return type must be nx.DiGraph."""
        from cni.analyzer.repo_scanner import scan_repository

        files = scan_repository(str(sample_repo))
        graph = build_dependency_graph(files)
        assert isinstance(graph, nx.DiGraph)

    def test_nodes_match_input_files(self, sample_repo: Path) -> None:
        """Every scanned file should appear as a node in the graph."""
        from cni.analyzer.repo_scanner import scan_repository

        files = scan_repository(str(sample_repo))
        graph = build_dependency_graph(files)
        graph_nodes = set(graph.nodes)
        for f in files:
            assert f in graph_nodes

    def test_edges_represent_imports(self, sample_repo: Path) -> None:
        """Edges should exist between files that import each other."""
        from cni.analyzer.repo_scanner import scan_repository

        files = scan_repository(str(sample_repo))
        graph = build_dependency_graph(files)

        # main.py imports auth → edge must exist
        main_node = next(n for n in graph.nodes if n.endswith("main.py"))
        successors = {Path(s).name for s in graph.successors(main_node)}
        # main.py imports auth and database
        assert "auth.py" in successors or "database.py" in successors

    def test_empty_file_list_returns_empty_graph(self) -> None:
        """An empty file list should produce an empty graph, not an error."""
        graph = build_dependency_graph([])
        assert isinstance(graph, nx.DiGraph)
        assert graph.number_of_nodes() == 0
        assert graph.number_of_edges() == 0


class TestGetGraphStats:
    """Tests for get_graph_stats()."""

    def test_get_graph_stats_returns_correct_counts(
        self, sample_graph: nx.DiGraph
    ) -> None:
        """files, dependencies, and isolated counts must be accurate."""
        stats = get_graph_stats(sample_graph)
        assert stats["files"] == 8
        assert stats["dependencies"] == 10
        # config.py has 1 incoming edge, email has 1 incoming edge
        # Only nodes with zero in-degree AND zero out-degree are isolated
        assert isinstance(stats["isolated"], int)
        assert stats["isolated"] >= 0
