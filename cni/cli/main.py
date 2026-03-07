"""
cni/cli/main.py

Entry point for the CNI command-line interface.
Exposes `analyze`, `graph`, and `visualize` commands.

Usage:
    cni analyze <path>
    cni graph <path>
    cni visualize <path> [--output graph.png]
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

def _scan_and_build_graph(path: Path) -> tuple[list[str], object]:
    """Shared logic for scanning and building graph."""
    try:
        file_paths: list[str] = scan_repository(str(path))
    except Exception as exc:  # noqa: BLE001
        _abort(f"Failed to scan repository: {exc}")

    if not file_paths:
        _abort(
            f"No supported source files found under '{path}'. "
            "Currently supported: .py, .js, .ts, .jsx, .tsx"
        )

    try:
        graph = build_dependency_graph(file_paths)
    except Exception as exc:  # noqa: BLE001
        _abort(f"Failed to build dependency graph: {exc}")

    return file_paths, graph


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

    file_paths, graph = _scan_and_build_graph(path)

    typer.echo(f"Files scanned: {typer.style(str(len(file_paths)), bold=True)}")
    typer.echo(typer.style("Dependency graph built.", fg=typer.colors.GREEN))

    # ------------------------------------------------------------------ #
    # Step 2 — Statistics
    # ------------------------------------------------------------------ #
    print_graph_stats(graph)


@app.command()
def graph(
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
    Build and display the dependency graph for a repository.

    Shows:
      - Number of files indexed
      - Dependencies found
      - Isolated files
      - Most frequently imported modules
    """
    typer.echo(typer.style("Building dependency graph...", fg=typer.colors.CYAN))

    file_paths, dep_graph = _scan_and_build_graph(path)

    typer.echo(f"Files scanned: {typer.style(str(len(file_paths)), bold=True)}")
    typer.echo(typer.style("Dependency graph built.", fg=typer.colors.GREEN))
    typer.echo("")
    print_graph_stats(dep_graph)


@app.command()
def visualize(
    path: Path = typer.Argument(
        ...,
        help="Path to the repository root to analyze.",
        exists=True,
        file_okay=False,
        dir_okay=True,
        readable=True,
        resolve_path=True,
    ),
    output: Path = typer.Option(
        "dependency_graph.png",
        "--output",
        "-o",
        help="Output file path for the visualization (PNG format).",
    ),
) -> None:
    """
    Generate a visual representation of the dependency graph.

    Creates a PNG image showing the module dependencies discovered
    in the repository.
    """
    try:
        import matplotlib.pyplot as plt
        import networkx as nx
    except ImportError:
        _abort(
            "Visualization requires matplotlib and networkx. "
            "Install with: pip install matplotlib networkx"
        )

    typer.echo(typer.style("Building dependency graph...", fg=typer.colors.CYAN))

    file_paths, dep_graph = _scan_and_build_graph(path)

    typer.echo(f"Files scanned: {typer.style(str(len(file_paths)), bold=True)}")
    typer.echo(typer.style("Generating visualization...", fg=typer.colors.CYAN))

    try:
        # Create figure
        fig, ax = plt.subplots(figsize=(14, 10))

        # Use spring layout for better visualization
        pos = nx.spring_layout(
            dep_graph,
            k=2,
            iterations=50,
            seed=42,
        )

        # Draw the graph
        nx.draw_networkx_nodes(
            dep_graph,
            pos,
            node_color="lightblue",
            node_size=500,
            ax=ax,
        )
        nx.draw_networkx_edges(
            dep_graph,
            pos,
            edge_color="gray",
            arrows=True,
            arrowsize=15,
            arrowstyle="->",
            ax=ax,
            width=1.5,
        )
        nx.draw_networkx_labels(
            dep_graph,
            pos,
            font_size=8,
            font_weight="bold",
            ax=ax,
        )

        ax.set_title(
            "Dependency Graph",
            fontsize=16,
            fontweight="bold",
        )
        ax.axis("off")
        plt.tight_layout()

        # Save the figure
        plt.savefig(str(output), dpi=300, bbox_inches="tight")
        plt.close()

        typer.echo(
            typer.style(
                f"✓ Visualization saved to: {output}",
                fg=typer.colors.GREEN,
            )
        )

    except Exception as exc:  # noqa: BLE001
        _abort(f"Failed to generate visualization: {exc}")


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    app()