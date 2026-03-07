"""
tests/test_repo_scanner.py
"""

from __future__ import annotations

from pathlib import Path

import pytest

from cni.analyzer.repo_scanner import extract_functions, scan_repository


# --------------------------------------------------------------------- #
# scan_repository
# --------------------------------------------------------------------- #


class TestScanRepository:
    """Tests for scan_repository()."""

    def test_scan_returns_only_supported_extensions(
        self, sample_repo: Path
    ) -> None:
        """Only .py .js .ts .jsx .tsx files should be returned."""
        # plant a few unsupported files
        (sample_repo / "readme.md").write_text("# hi")
        (sample_repo / "data.csv").write_text("a,b")
        (sample_repo / "app.js").write_text("console.log('hi');")

        results = scan_repository(str(sample_repo))

        extensions = {Path(r).suffix for r in results}
        assert extensions <= {".py", ".js", ".ts", ".jsx", ".tsx"}
        # .md and .csv must NOT appear
        for r in results:
            assert not r.endswith(".md")
            assert not r.endswith(".csv")

    def test_scan_excludes_noise_directories(self, sample_repo: Path) -> None:
        """Files inside .git, node_modules, __pycache__ must be excluded."""
        for noise_dir in (".git", "node_modules", "__pycache__"):
            d = sample_repo / noise_dir
            d.mkdir()
            (d / "hidden.py").write_text("x = 1")

        results = scan_repository(str(sample_repo))

        for r in results:
            assert ".git" not in r.split("\\") and ".git" not in r.split("/")
            assert "node_modules" not in r
            assert "__pycache__" not in r

    def test_scan_empty_directory_returns_empty_list(
        self, tmp_path: Path
    ) -> None:
        """An empty directory should return an empty list, not an error."""
        empty = tmp_path / "empty_project"
        empty.mkdir()
        assert scan_repository(str(empty)) == []


# --------------------------------------------------------------------- #
# extract_functions
# --------------------------------------------------------------------- #


class TestExtractFunctions:
    """Tests for extract_functions()."""

    def test_extract_functions_returns_function_names(
        self, tmp_path: Path
    ) -> None:
        """Correct function names should be extracted from a Python file."""
        src = tmp_path / "sample.py"
        src.write_text(
            "def hello():\n    pass\n\n"
            "class MyClass:\n    def method(self):\n        pass\n"
        )
        units = extract_functions(str(src))
        names = {u["name"] for u in units}
        assert "hello" in names
        assert "MyClass" in names
        assert "method" in names

    def test_extract_functions_returns_correct_line_numbers(
        self, tmp_path: Path
    ) -> None:
        """line_start and line_end should reflect the actual source."""
        src = tmp_path / "lines.py"
        src.write_text("def foo():\n    return 1\n\ndef bar():\n    return 2\n")
        units = extract_functions(str(src))

        foo = next(u for u in units if u["name"] == "foo")
        bar = next(u for u in units if u["name"] == "bar")

        assert foo["line_start"] == 1
        assert foo["line_end"] == 2
        assert bar["line_start"] == 4
        assert bar["line_end"] == 5

    def test_extract_functions_handles_syntax_errors_gracefully(
        self, tmp_path: Path
    ) -> None:
        """A file with invalid Python should return [] not crash."""
        bad = tmp_path / "broken.py"
        bad.write_text("def oops(\n")
        assert extract_functions(str(bad)) == []
