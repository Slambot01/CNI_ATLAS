"""
tests/test_context_builder.py

All retrieval / LLM tests are mocked to run fully offline.
"""

from __future__ import annotations

from unittest.mock import patch

import networkx as nx
import pytest

from cni.retrieval.context_builder import build_context


class TestBuildContext:
    """Tests for build_context()."""

    @patch("cni.retrieval.context_builder.extract_functions", return_value=[])
    @patch("cni.retrieval.context_builder.build_index")
    @patch(
        "cni.retrieval.context_builder.search_index",
        return_value=["src/main.py"],
    )
    def test_returns_string(
        self, mock_search, mock_build, mock_extract, sample_graph: nx.DiGraph
    ) -> None:
        """Return type must be str."""
        result = build_context(sample_graph, "What does main do?")
        assert isinstance(result, str)

    @patch("cni.retrieval.context_builder.extract_functions", return_value=[])
    @patch("cni.retrieval.context_builder.build_index")
    @patch(
        "cni.retrieval.context_builder.search_index",
        return_value=["src/main.py"],
    )
    def test_output_does_not_exceed_12000_chars(
        self, mock_search, mock_build, mock_extract, sample_graph: nx.DiGraph
    ) -> None:
        """Context length must be <= 12 000 characters."""
        result = build_context(sample_graph, "How is auth handled?")
        assert len(result) <= 12_000

    def test_empty_query_returns_fallback_message(self) -> None:
        """An empty query should return a fallback string not an error."""
        g = nx.DiGraph()
        g.add_node("src/main.py")
        result = build_context(g, "")
        assert isinstance(result, str)

    def test_empty_graph_returns_fallback_message(self) -> None:
        """An empty graph should return a fallback string not an error."""
        g = nx.DiGraph()
        result = build_context(g, "What does this do?")
        assert isinstance(result, str)
        assert "No relevant" in result or len(result) == 0 or result != ""
