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

from cni.analysis.explainer import explain_file, print_file_explanation
from cni.analysis.path_finder import find_dependency_path, print_dependency_path
from cni.analyzer.repo_scanner import scan_repository
from cni.graph.dependency_graph import build_dependency_graph, print_graph_stats
from cni.llm.llm_client import ask_llm
from cni.retrieval.context_builder import build_context

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


def _scan(path: Path) -> list[str]:
    """Scan repository for supported source files."""
    try:
        file_paths: list[str] = scan_repository(str(path))
    except Exception as exc:  # noqa: BLE001
        _abort(f"Failed to scan repository: {exc}")

    if not file_paths:
        _abort(
            f"No supported source files found under '{path}'. "
            "Currently supported: .py, .js, .ts, .jsx, .tsx"
        )

    return file_paths


def _build(file_paths: list[str]) -> object:
    """Build dependency graph from file paths."""
    try:
        graph = build_dependency_graph(file_paths)
    except Exception as exc:  # noqa: BLE001
        _abort(f"Failed to build dependency graph: {exc}")

    return graph


def _scan_and_build_graph(path: Path) -> tuple[list[str], object]:
    """Shared logic for scanning and building graph."""
    file_paths = _scan(path)
    graph = _build(file_paths)
    return file_paths, graph


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


@app.command()
def path(
    source: str = typer.Argument(
        ...,
        help="Source file name or path.",
    ),
    target: str = typer.Argument(
        ...,
        help="Target file name or path.",
    ),
    path_root: Path = typer.Argument(
        ...,
        help="Repository root.",
        exists=True,
        dir_okay=True,
        file_okay=False,
        resolve_path=True,
    ),
) -> None:
    """
    Find the dependency path between two files.

    Shows whether file A depends on file B and the chain of dependencies
    connecting them, if one exists.
    """
    typer.echo(typer.style("Scanning repository...", fg=typer.colors.CYAN))

    file_paths = _scan(path_root)

    typer.echo(typer.style("Building dependency graph...", fg=typer.colors.CYAN))

    graph = _build(file_paths)

    typer.echo(typer.style("Searching dependency path...", fg=typer.colors.CYAN))

    dep_path = find_dependency_path(graph, source, target)

    print_dependency_path(dep_path)


@app.command()
def explain(
    file: str = typer.Argument(
        ...,
        help="File name or path to explain.",
    ),
    path_root: Path = typer.Argument(
        ...,
        help="Repository root.",
        exists=True,
        dir_okay=True,
        file_okay=False,
        resolve_path=True,
    ),
) -> None:
    """
    Explain how a file participates in the dependency graph.

    Shows:
      - Files that this file imports
      - Files that import this file
    """
    typer.echo(typer.style("Scanning repository...", fg=typer.colors.CYAN))

    file_paths = _scan(path_root)

    typer.echo(typer.style("Building dependency graph...", fg=typer.colors.CYAN))

    graph = _build(file_paths)

    typer.echo(typer.style("Analyzing file...", fg=typer.colors.CYAN))
    typer.echo("")

    explanation = explain_file(graph, file)

    print_file_explanation(explanation)


@app.command()
def ask(
    question: str = typer.Argument(
        ...,
        help="Question about the codebase.",
    ),
    path: Path = typer.Argument(
        ...,
        help="Repository root.",
        exists=True,
        dir_okay=True,
        file_okay=False,
        resolve_path=True,
    ),
) -> None:
    """
    Ask a natural language question about the codebase.
    """
    typer.echo("Scanning repository...")
    file_paths = _scan(path)

    typer.echo("Building dependency graph...")
    graph = _build(file_paths)

    typer.echo("Retrieving relevant context...")
    context = build_context(graph, question)

    typer.echo("Querying LLM...")
    answer = ask_llm(context, question)

    typer.echo()
    typer.echo(answer)


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    app()