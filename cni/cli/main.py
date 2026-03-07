"""
cni/cli/main.py

Entry point for the CNI command-line interface.
Currently exposes the `analyze` command.

Usage:
    cni analyze <path>
"""

from __future__ import annotations

from pathlib import Path

import typer

from cni.analyzer.repo_scanner import scan_repository
from cni.graph.dependency_graph import build_dependency_graph, print_graph_stats

app = typer.Typer(
    name="cni",
    help="CNI — Talk to your entire codebase like it's a living system.",
    no_args_is_help=True,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _abort(message: str) -> None:
    """Print an error message in red and exit with code 1."""
    typer.echo(typer.style(f"Error: {message}", fg=typer.colors.RED), err=True)
    raise typer.Exit(code=1)


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

@app.command()
def analyze(
    path: Path = typer.Argument(
        ...,
        help="Path to the repository root to analyze.",
        exists=True,
        file_okay=False,
        dir_okay=True,
        readable=True,
        resolve_path=True,
    ),
) -> None:
    """
    Scan a repository, build its dependency graph, and print statistics.

    Steps:
      1. Recursively scan <path> for supported source files.
      2. Build a directed dependency graph from extracted imports.
      3. Print graph statistics.
    """
    # ------------------------------------------------------------------ #
    # Step 1 — Repository scan
    # ------------------------------------------------------------------ #
    typer.echo(typer.style("Analyzing repository...", fg=typer.colors.CYAN))

    try:
        file_paths: list[str] = scan_repository(str(path))
    except Exception as exc:  # noqa: BLE001
        _abort(f"Failed to scan repository: {exc}")

    if not file_paths:
        _abort(
            f"No supported source files found under '{path}'. "
            "Currently supported: .py, .js, .ts, .jsx, .tsx"
        )

    typer.echo(f"Files scanned: {typer.style(str(len(file_paths)), bold=True)}")

    # ------------------------------------------------------------------ #
    # Step 2 — Dependency graph
    # ------------------------------------------------------------------ #
    try:
        graph = build_dependency_graph(file_paths)
    except Exception as exc:  # noqa: BLE001
        _abort(f"Failed to build dependency graph: {exc}")

    typer.echo(typer.style("Dependency graph built.", fg=typer.colors.GREEN))

    # ------------------------------------------------------------------ #
    # Step 3 — Statistics
    # ------------------------------------------------------------------ #
    print_graph_stats(graph)


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    app()