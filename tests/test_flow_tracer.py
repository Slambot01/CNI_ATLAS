"""
tests/test_flow_tracer.py
"""

from __future__ import annotations

from pathlib import Path

import networkx as nx
import pytest

from cni.analysis.flow_tracer import detect_entry_points, trace_flow


class TestDetectEntryPoints:
    """Tests for detect_entry_points()."""

    def test_detects_app_route_entry_points(self, tmp_path: Path) -> None:
        """@app.route should be detected correctly."""
        ep = tmp_path / "views.py"
        ep.write_text(
            "@app.route('/home')\n"
            "def home():\n"
            "    return 'Hello'\n"
        )
        results = detect_entry_points([str(ep)])
        assert len(results) == 1
        assert results[0]["decorator"] == "@app.route"

    def test_detects_router_get_entry_points(self, tmp_path: Path) -> None:
        """@router.get should be detected correctly."""
        ep = tmp_path / "api.py"
        ep.write_text(
            "@router.get('/users')\n"
            "async def list_users():\n"
            "    pass\n"
        )
        results = detect_entry_points([str(ep)])
        assert len(results) == 1
        assert results[0]["decorator"] == "@router.get"


class TestTraceFlow:
    """Tests for trace_flow()."""

    def test_trace_flow_returns_ordered_modules(self) -> None:
        """Output should be an ordered list of module paths."""
        g = nx.DiGraph()
        g.add_edge("routes.py", "auth.py")
        g.add_edge("auth.py", "db.py")

        eps = [{"file": "routes.py", "decorator": "@app.route"}]
        related = ["routes.py", "auth.py", "db.py"]

        chains = trace_flow(g, eps, related)
        assert len(chains) >= 1
        # First chain should start at the entry point
        assert chains[0][0] == "routes.py"

    def test_handles_graph_with_no_entry_points(self) -> None:
        """Empty list should be returned when there are no entry points."""
        g = nx.DiGraph()
        g.add_edge("a.py", "b.py")
        chains = trace_flow(g, [], [])
        assert chains == []
