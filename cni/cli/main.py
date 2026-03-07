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
import requests
import typer

from cni.analysis.explainer import explain_file, print_file_explanation, _resolve_node
from cni.analysis.flow_tracer import detect_entry_points, trace_flow, format_flow_report, FlowReport
from cni.analysis.health import compute_health, format_health_report
from cni.analysis.impact import analyze_impact, format_impact_report
from cni.analysis.onboarder import generate_onboarding_report, format_onboarding_report
from cni.analysis.path_finder import find_dependency_path, print_dependency_path
from cni.analyzer.repo_scanner import scan_repository
from cni.graph.dependency_graph import build_dependency_graph, merge_graphs, print_graph_stats
from cni.graph.export import (
    export_graph,
    filter_graph_by_depth,
    filter_graph_by_imports,
    cluster_graph_by_directory,
)
from cni.llm.llm_client import ask_llm
from cni.retrieval.context_builder import build_context
from cni.retrieval.semantic_search import build_index, search_index
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
    depth: int = typer.Option(
        0,
        "--depth",
        help="Only show nodes within N hops from entry points (0 = no filter).",
    ),
    min_imports: int = typer.Option(
        0,
        "--min-imports",
        help="Only show nodes imported by at least N other modules (0 = no filter).",
    ),
    cluster: bool = typer.Option(
        False,
        "--cluster",
        help="Collapse directories into single nodes showing package-level dependencies.",
    ),
) -> None:
    """Build the dependency graph, print stats, and export a graph image.

    Supports filtering for large repos:
      --depth N        Keep only nodes within N hops from entry points.
      --min-imports N  Keep only nodes imported by at least N modules.
      --cluster        Collapse files into directory-level nodes.
    """
    typer.echo(typer.style("Building dependency graph...", fg=typer.colors.CYAN))

    file_paths, dep_graph = _scan_and_build_graph(path)

    typer.echo(f"Files scanned: {typer.style(str(len(file_paths)), bold=True)}")
    typer.echo(typer.style("Dependency graph built.", fg=typer.colors.GREEN))
    typer.echo("")
    print_graph_stats(dep_graph)

    # Apply filters
    render_graph = dep_graph
    if depth > 0:
        render_graph = filter_graph_by_depth(render_graph, depth)
        typer.echo(f"  Filtered by depth {depth}: {render_graph.number_of_nodes()} nodes")
    if min_imports > 0:
        render_graph = filter_graph_by_imports(render_graph, min_imports)
        typer.echo(f"  Filtered by min-imports {min_imports}: {render_graph.number_of_nodes()} nodes")
    if cluster:
        render_graph = cluster_graph_by_directory(render_graph)
        typer.echo(f"  Clustered by directory: {render_graph.number_of_nodes()} package nodes")

    if render_graph.number_of_nodes() == 0:
        _abort("No nodes remain after filtering. Try less aggressive filter values.")

    typer.echo("")
    try:
        result_path = export_graph(render_graph, output, fmt=fmt)
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


def _suppress_model_noise() -> None:
    """Suppress noisy model-loading output from sentence-transformers."""
    import logging
    import os

    os.environ["TOKENIZERS_PARALLELISM"] = "false"
    logging.getLogger("sentence_transformers").setLevel(logging.ERROR)
    try:
        from transformers import logging as hf_logging
        hf_logging.set_verbosity_error()
    except ImportError:
        pass


@app.command()
def flow(
    concept: str = typer.Argument(
        ...,
        help="Business concept to trace (e.g. 'order processing').",
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
    """Trace execution flow for a business concept.

    Detects entry points (API routes, tasks), finds semantically related
    files, and traces the execution chain through the dependency graph.
    """
    _suppress_model_noise()

    typer.echo(typer.style("Scanning repository...", fg=typer.colors.CYAN))
    file_paths = _scan(path)

    typer.echo(typer.style("Building dependency graph...", fg=typer.colors.CYAN))
    dep_graph = _build(file_paths)

    typer.echo(typer.style("Detecting entry points...", fg=typer.colors.CYAN))
    entry_points = detect_entry_points(file_paths)

    typer.echo(typer.style("Searching for related files...", fg=typer.colors.CYAN))
    build_index(file_paths)
    related_files = search_index(concept, k=10)

    typer.echo(typer.style("Tracing execution flow...", fg=typer.colors.CYAN))
    chains = trace_flow(dep_graph, entry_points, related_files)

    report = FlowReport(
        query=concept,
        entry_points=entry_points,
        flow_chains=chains,
    )

    typer.echo(format_flow_report(report))


@app.command()
def impact(
    file: str = typer.Argument(
        ...,
        help="File name or path to analyze impact for.",
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
    """Analyze the blast radius of modifying a file.

    Shows direct and transitive dependents, scores them by criticality,
    and classifies overall risk as LOW/MEDIUM/HIGH.
    """
    typer.echo(typer.style("Scanning repository...", fg=typer.colors.CYAN))
    file_paths = _scan(path_root)

    typer.echo(typer.style("Building dependency graph...", fg=typer.colors.CYAN))
    dep_graph = _build(file_paths)

    resolved = _resolve_node(dep_graph, file)
    if resolved is None:
        _abort(f"File '{file}' not found in the dependency graph.")

    typer.echo(typer.style("Analyzing impact...", fg=typer.colors.CYAN))
    report = analyze_impact(dep_graph, resolved, file_paths)
    typer.echo(format_impact_report(report))


@app.command()
def onboard(
    path: Path = typer.Argument(
        ".",
        help="Repository root.",
        exists=True,
        dir_okay=True,
        file_okay=False,
        resolve_path=True,
    ),
) -> None:
    """Generate an onboarding report for the codebase.

    Detects entry points, ranks modules by centrality, flags dead modules,
    and generates an LLM architecture summary.
    """
    typer.echo(typer.style("Scanning repository...", fg=typer.colors.CYAN))
    file_paths = _scan(path)

    typer.echo(typer.style("Building dependency graph...", fg=typer.colors.CYAN))
    dep_graph = _build(file_paths)

    typer.echo(typer.style("Generating onboarding report...", fg=typer.colors.CYAN))
    report = generate_onboarding_report(dep_graph, file_paths, llm_fn=ask_llm)
    typer.echo(format_onboarding_report(report))


@app.command()
def health(
    path: Path = typer.Argument(
        ".",
        help="Repository root.",
        exists=True,
        dir_okay=True,
        file_okay=False,
        resolve_path=True,
    ),
) -> None:
    """Compute codebase health metrics.

    Reports god modules, coupled modules, isolated files, and an
    overall health score from 0 to 100.
    """
    typer.echo(typer.style("Scanning repository...", fg=typer.colors.CYAN))
    file_paths = _scan(path)

    typer.echo(typer.style("Building dependency graph...", fg=typer.colors.CYAN))
    dep_graph = _build(file_paths)

    typer.echo(typer.style("Computing health metrics...", fg=typer.colors.CYAN))
    report = compute_health(dep_graph)
    typer.echo(format_health_report(report))


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
    _suppress_model_noise()

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


@app.command()
def connect(
    paths: list[str] = typer.Argument(
        ...,
        help="Paths to repository roots to connect.",
    ),
) -> None:
    """Connect multiple repositories for cross-service analysis.

    Scans each repository independently, merges all graphs into a
    unified cross-repo graph, and detects cross-service connections.
    """
    from pathlib import Path as _Path

    if len(paths) < 2:
        _abort("At least two repository paths are required.")

    typer.echo(typer.style("Connecting repositories...\n", fg=typer.colors.CYAN))

    repo_graphs: list[tuple[str, nx.DiGraph]] = []

    for repo_path_str in paths:
        repo_path = _Path(repo_path_str).resolve()
        if not repo_path.is_dir():
            _abort(f"Not a directory: {repo_path}")

        repo_name = repo_path.name
        typer.echo(f"  Scanning {repo_name}...")

        try:
            file_paths = scan_repository(str(repo_path))
        except Exception as exc:
            _abort(f"Failed to scan {repo_name}: {exc}")

        if not file_paths:
            typer.echo(f"    ⚠ No source files found in {repo_name}, skipping.")
            continue

        graph = build_dependency_graph(file_paths)
        repo_graphs.append((repo_name, graph))

        typer.echo(
            f"  {repo_name:<25s} files: {graph.number_of_nodes():<6d} "
            f"edges: {graph.number_of_edges()}"
        )

    if len(repo_graphs) < 2:
        _abort("Need at least two valid repos to connect.")

    typer.echo(typer.style("\nMerging graphs...", fg=typer.colors.CYAN))
    unified, cross_connections = merge_graphs(repo_graphs)

    if cross_connections:
        typer.echo(f"\nCross-service connections detected: {len(cross_connections)}")
        for src, tgt in cross_connections[:10]:
            typer.echo(f"  {src}")
            typer.echo(f"    → {tgt}")
    else:
        typer.echo("\nNo cross-service connections detected.")

    typer.echo(
        f"\n{typer.style('Unified graph built.', fg=typer.colors.GREEN)}"
        f"\nTotal files: {unified.number_of_nodes()}    "
        f"Total edges: {unified.number_of_edges()}"
    )


@app.command()
def doctor() -> None:
    """Run diagnostic checks for CNI's dependencies.

    Checks:
      1. Ollama reachability
      2. Available Ollama models
      3. Graphviz installation
      4. CNI cache presence
    """
    import shutil

    ok = typer.style("✓", fg=typer.colors.GREEN)
    fail = typer.style("✗", fg=typer.colors.RED)

    # --- 1. Ollama reachable? -------------------------------------------
    try:
        resp = requests.get("http://localhost:11434/api/tags", timeout=5)
        if resp.status_code == 200:
            typer.echo(f"  {ok}  Ollama is running")

            # --- 2. Models available? -----------------------------------
            try:
                data = resp.json()
                models = data.get("models", [])
                if models:
                    model_name = models[0].get("name", "unknown")
                    typer.echo(f"  {ok}  Model found: {model_name}")
                else:
                    typer.echo(
                        f"  {fail}  No models found  →  run: "
                        "ollama pull deepseek-coder"
                    )
            except Exception:
                typer.echo(
                    f"  {fail}  No models found  →  run: "
                    "ollama pull deepseek-coder"
                )
        else:
            typer.echo(f"  {fail}  Ollama not running  →  run: ollama serve")
            typer.echo(
                f"  {fail}  No models found  →  run: "
                "ollama pull deepseek-coder"
            )
    except Exception:
        typer.echo(f"  {fail}  Ollama not running  →  run: ollama serve")
        typer.echo(
            f"  {fail}  No models found  →  run: "
            "ollama pull deepseek-coder"
        )

    # --- 3. Graphviz installed? -----------------------------------------
    if shutil.which("dot"):
        typer.echo(f"  {ok}  Graphviz is installed")
    else:
        typer.echo(
            f"  {fail}  Graphviz not installed  →  "
            "brew install graphviz"
        )

    # --- 4. Cache present? ----------------------------------------------
    cache_path = Path(".cni") / "cache.json"
    if cache_path.exists():
        typer.echo(f"  {ok}  Cache found: .cni/cache.json")
    else:
        typer.echo(
            f"  {fail}  No cache found  →  run: cni analyze ."
        )


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    app()