"""
cni/cli/main.py

Entry point for the CNI command-line interface.
Exposes ``analyze``, ``graph``, ``visualize``, ``path``, ``explain``, and
``ask`` commands via a :pypi:`typer` application object named ``app``.

Usage::

    cni analyze <path>
    cni graph <path>
    cni visualize <path> [--output graph.png]
    cni path <source> <target> [path_root]
    cni explain <file> [path_root]
    cni ask <question> [path]
"""

from __future__ import annotations

from pathlib import Path

import networkx as nx
import typer

from cni.analysis.explainer import explain_file, print_file_explanation, _resolve_node
from cni.analysis.path_finder import find_dependency_path, print_dependency_path
from cni.analyzer.repo_scanner import scan_repository
from cni.graph.dependency_graph import build_dependency_graph, print_graph_stats
from cni.graph.export import export_graph
from cni.llm.llm_client import ask_llm
from cni.retrieval.context_builder import build_context
from cni.storage.cache import is_cache_valid, load_cache, save_cache

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


def _build(file_paths: list[str]) -> nx.DiGraph:
    """Build dependency graph from file paths."""
    try:
        graph: nx.DiGraph = build_dependency_graph(file_paths)
    except Exception as exc:  # noqa: BLE001
        _abort(f"Failed to build dependency graph: {exc}")

    return graph


def _scan_and_build_graph(path: Path) -> tuple[list[str], nx.DiGraph]:
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
    """Scan a repository, build its dependency graph, and print statistics.

    If a valid cache exists at ``<path>/.cni/cache.json`` the scan is
    skipped and the cached results are used instead.  After a fresh scan
    the cache is always updated.
    """
    typer.echo(typer.style("Analyzing repository...", fg=typer.colors.CYAN))

    repo_str = str(path)

    # --- Attempt to use cache -------------------------------------------
    file_paths = _scan(path)

    if is_cache_valid(repo_str, file_paths):
        typer.echo(typer.style("Cache hit — loading cached results.", fg=typer.colors.GREEN))
        cached = load_cache(repo_str)
        if cached is not None:
            cached_files, cached_edges = cached
            graph = nx.DiGraph()
            for fp in cached_files:
                graph.add_node(fp)
            for src, tgt in cached_edges:
                graph.add_edge(src, tgt)
        else:
            graph = _build(file_paths)
            save_cache(repo_str, file_paths, list(graph.edges()))
    else:
        graph = _build(file_paths)
        save_cache(repo_str, file_paths, list(graph.edges()))

    typer.echo(f"Files scanned: {typer.style(str(len(file_paths)), bold=True)}")
    typer.echo(typer.style("Dependency graph built.", fg=typer.colors.GREEN))

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
    output: str = typer.Option(
        "dependency_graph",
        "--output",
        "-o",
        help="Output file path (without extension) for the graph image.",
    ),
    fmt: str = typer.Option(
        "png",
        "--format",
        "-f",
        help="Output format: png, svg, or pdf.",
    ),
) -> None:
    """Build the dependency graph, print stats, and export a graph image.

    Generates a Graphviz-rendered image with directory-based clustering
    and in-degree node coloring.
    """
    typer.echo(typer.style("Building dependency graph...", fg=typer.colors.CYAN))

    file_paths, dep_graph = _scan_and_build_graph(path)

    typer.echo(f"Files scanned: {typer.style(str(len(file_paths)), bold=True)}")
    typer.echo(typer.style("Dependency graph built.", fg=typer.colors.GREEN))
    typer.echo("")
    print_graph_stats(dep_graph)

    typer.echo("")
    try:
        result_path = export_graph(dep_graph, output, fmt=fmt)
        typer.echo(
            typer.style(f"✓ Graph exported to: {result_path}", fg=typer.colors.GREEN)
        )
    except (ValueError, RuntimeError) as exc:
        _abort(str(exc))


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
    """Generate a visual representation of the dependency graph.

    Creates a PNG image showing the module dependencies discovered
    in the repository.
    """
    try:
        import matplotlib.pyplot as plt  # noqa: WPS433
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
        fig, ax = plt.subplots(figsize=(14, 10))

        pos = nx.spring_layout(
            dep_graph,
            k=2,
            iterations=50,
            seed=42,
        )

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
        ".",
        help="Repository root.",
        exists=True,
        dir_okay=True,
        file_okay=False,
        resolve_path=True,
    ),
) -> None:
    """Find the dependency path between two files.

    Shows whether file A depends on file B and the chain of dependencies
    connecting them, if one exists.
    """
    typer.echo(typer.style("Scanning repository...", fg=typer.colors.CYAN))

    file_paths = _scan(path_root)

    typer.echo(typer.style("Building dependency graph...", fg=typer.colors.CYAN))

    dep_graph = _build(file_paths)

    typer.echo(typer.style("Searching dependency path...", fg=typer.colors.CYAN))

    # Resolve user-provided names to actual graph node keys
    resolved_source = _resolve_node(dep_graph, source)
    resolved_target = _resolve_node(dep_graph, target)

    if resolved_source is None:
        _abort(f"Source file '{source}' not found in the dependency graph.")
    if resolved_target is None:
        _abort(f"Target file '{target}' not found in the dependency graph.")

    dep_path = find_dependency_path(dep_graph, resolved_source, resolved_target)

    print_dependency_path(dep_path)


@app.command()
def explain(
    file: str = typer.Argument(
        ...,
        help="File name or path to explain.",
    ),
    path_root: Path = typer.Argument(
        ".",
        help="Repository root.",
        exists=True,
        dir_okay=True,
        file_okay=False,
        resolve_path=True,
    ),
) -> None:
    """Explain how a file participates in the dependency graph.

    Shows:
      - Files that this file imports
      - Files that import this file
    """
    typer.echo(typer.style("Scanning repository...", fg=typer.colors.CYAN))

    file_paths = _scan(path_root)

    typer.echo(typer.style("Building dependency graph...", fg=typer.colors.CYAN))

    dep_graph = _build(file_paths)

    typer.echo(typer.style("Analyzing file...", fg=typer.colors.CYAN))
    typer.echo("")

    explanation = explain_file(dep_graph, file)

    print_file_explanation(explanation)


@app.command()
def ask(
    question: str = typer.Argument(
        ...,
        help="Question about the codebase.",
    ),
    path: Path = typer.Argument(
        ".",
        help="Repository root.",
        exists=True,
        dir_okay=True,
        file_okay=False,
        resolve_path=True,
    ),
) -> None:
    """Ask a natural language question about the codebase."""
    import logging
    import os

    # Suppress noisy model-loading output from sentence-transformers
    os.environ["TOKENIZERS_PARALLELISM"] = "false"
    logging.getLogger("sentence_transformers").setLevel(logging.ERROR)
    
    try:
        from transformers import logging as hf_logging
        hf_logging.set_verbosity_error()
    except ImportError:
        pass

    typer.echo("Scanning repository...")
    file_paths = _scan(path)

    typer.echo("Building dependency graph...")
    dep_graph = _build(file_paths)

    typer.echo("Retrieving relevant context...")
    context = build_context(dep_graph, question)

    typer.echo("Querying LLM...")
    answer = ask_llm(context, question)

    typer.echo()
    typer.echo(answer)


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    app()