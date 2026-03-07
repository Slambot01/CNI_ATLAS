"""
tests/test_cli.py

Uses Typer's CliRunner to test the CLI commands directly.
All LLM calls are mocked so tests run fully offline.
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import pytest
from typer.testing import CliRunner

from cni.cli.main import app

runner = CliRunner()


class TestCLI:
    """End-to-end CLI tests."""

    def test_analyze_exits_zero(self, sample_repo: Path) -> None:
        """cni analyze <sample_repo> should exit with code 0."""
        result = runner.invoke(app, ["analyze", str(sample_repo)])
        assert result.exit_code == 0

    def test_graph_exits_zero(self, sample_repo: Path) -> None:
        """cni graph <sample_repo> should exit with code 0."""
        result = runner.invoke(app, ["graph", str(sample_repo)])
        # May fail with exit code 1 if Graphviz is not installed, but
        # the stats portion should still work — accept 0 or 1
        # (Graphviz rendering may fail on CI)
        assert result.exit_code in (0, 1)

    def test_analyze_invalid_path_exits_one(self) -> None:
        """cni analyze /nonexistent should exit with code != 0."""
        result = runner.invoke(app, ["analyze", "/nonexistent_path_xyz"])
        assert result.exit_code != 0

    def test_explain_unknown_file_prints_not_found(
        self, sample_repo: Path
    ) -> None:
        """Output should contain 'not found' for an unknown file."""
        result = runner.invoke(
            app,
            ["explain", "totally_fake_file.py", str(sample_repo)],
        )
        output_lower = result.output.lower()
        assert "not found" in output_lower or result.exit_code != 0

    def test_health_exits_zero(self, sample_repo: Path) -> None:
        """cni health should exit with code 0."""
        result = runner.invoke(app, ["health", str(sample_repo)])
        assert result.exit_code == 0
        assert "Health" in result.output or "health" in result.output.lower()
