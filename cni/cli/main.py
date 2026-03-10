"""
cni/cli/main.py

Entry point for the CNI command-line interface.

Exposes all CNI commands via a :pypi:`typer` application object named ``app``.
Each command builds the dependency graph (with optional caching), then
delegates to the appropriate analysis or retrieval module.

Available commands::

    cni analyze  <path>               Scan and print graph statistics.
    cni graph    <path>               Build, print stats, and export an image.
    cni visualize <path>              Render a matplotlib visualization.
    cni path     <source> <target>    Find the shortest dependency path.
    cni explain  <file>               Show what a file imports and is imported by.
    cni flow     <concept>            Trace execution flow for a business concept.
    cni impact   <file>               Analyze the blast radius of modifying a file.
    cni onboard  [path]               Generate a developer onboarding report.
    cni health   [path]               Compute codebase health metrics.
    cni ask      "<question>"         Ask a natural language question via LLM.
    cni connect  <path1> <path2> ...  Merge and analyze multiple repositories.
    cni doctor                        Run diagnostic checks on CNI dependencies.
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
from cni.utils.errors import abort, error, success, warning
from cni.utils.platform import get_cache_dir, get_platform

app = typer.Typer(
    name="cni",
    help="CNI — Talk to your entire codebase like it's a living system.",
    no_args_is_help=True,
)


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _abort(message: str) -> None:
    """Print a red error message and exit with code 1.

    Args:
        message: Error description to display.
    """
    abort(message)


def _scan(path: Path) -> list[str]:
    """Scan a repository root for all supported source files.

    Args:
        path: Absolute path to the repository root directory.

    Returns:
        List of absolute file path strings for every discovered source file.

    Raises:
        typer.Exit: If scanning fails or no supported files are found.
    """
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
    """Build a dependency graph from a list of file paths.

    Args:
        file_paths: List of absolute file path strings to analyze.

    Returns:
        Directed dependency graph where nodes are file paths and edges
        represent ``(importer, importee)`` relationships.

    Raises:
        typer.Exit: If graph construction fails.
    """
    try:
        graph: nx.DiGraph = build_dependency_graph(file_paths)
    except Exception as exc:  # noqa: BLE001
        _abort(f"Failed to build dependency graph: {exc}")

    return graph


def _scan_and_build_graph(path: Path) -> tuple[list[str], nx.DiGraph]:
    """Scan a repository and build its dependency graph in one step.

    Args:
        path: Absolute path to the repository root directory.

    Returns:
        Tuple of ``(file_paths, graph)`` where ``file_paths`` is the list of
        discovered files and ``graph`` is the resulting directed graph.
    """
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
        help=(
            "Path to the repository root to analyze.  "
            "Accepts any directory that contains Python, JS, or TS source files."
        ),
        exists=True,
        file_okay=False,
        dir_okay=True,
        readable=True,
        resolve_path=True,
    ),
) -> None:
    """Scan a repository, build its dependency graph, and print statistics.

    Performs a full recursive scan of the target directory, extracts all
    import relationships, and prints a summary table including the number of
    files indexed, total dependency edges, isolated files, and the most
    heavily imported module.

    Results are cached in ``<path>/.cni/cache.json`` so subsequent runs are
    instant.  To force a fresh scan, delete the ``.cni/`` directory.

    Example::

        cni analyze .
        cni analyze /path/to/my-project
    """
    typer.echo(typer.style("Analyzing repository...", fg=typer.colors.CYAN))

    repo_str = str(path)

    # --- Attempt to use cache -------------------------------------------
    file_paths = _scan(path)

    if is_cache_valid(repo_str, file_paths):
        success("Cache hit — loading cached results.")
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
    success("Dependency graph built.")

    print_graph_stats(graph)


@app.command()
def graph(
    path: Path = typer.Argument(
        ...,
        help=(
            "Path to the repository root to analyze.  "
            "Accepts any directory containing Python, JS, or TS source files."
        ),
        exists=True,
        file_okay=False,
        dir_okay=True,
        readable=True,
        resolve_path=True,
    ),
    output: str = typer.Option(
        "dependency_graph",
        "--output", "-o",
        help=(
            "Destination file path for the exported graph image, "
            "WITHOUT the file extension (e.g. 'my_graph').  "
            "Graphviz appends the format extension automatically."
        ),
    ),
    fmt: str = typer.Option(
        "png",
        "--format", "-f",
        help="Output image format.  Supported values: png, svg, pdf.",
    ),
    depth: int = typer.Option(
        0,
        "--depth",
        help=(
            "Only include nodes within N hops from detected entry points.  "
            "Useful for focusing on the top-level flow in large repos.  "
            "0 disables this filter (show all nodes)."
        ),
    ),
    min_imports: int = typer.Option(
        0,
        "--min-imports",
        help=(
            "Only include nodes imported by at least N other modules "
            "(i.e. in-degree >= N).  Useful for showing only central hub "
            "modules.  0 disables this filter."
        ),
    ),
    cluster: bool = typer.Option(
        False,
        "--cluster",
        help=(
            "Collapse all files in the same directory into a single "
            "package-level node.  Edges between files in different "
            "directories become edges between the directory nodes.  "
            "Useful for high-level architecture overviews of large repos."
        ),
    ),
) -> None:
    """Build the dependency graph, print statistics, and export an image.

    Scans the repository, builds the full dependency graph, prints a stats
    summary to the terminal, and renders a Graphviz image (PNG by default).

    Supports three optional filters to control which nodes appear in the
    exported image (filters are applied in the order shown):

    - ``--depth N`` — keep only nodes reachable within N hops from entry points.
    - ``--min-imports N`` — keep only nodes with at least N in-bound edges.
    - ``--cluster`` — collapse file nodes into parent-directory nodes.

    Requires Graphviz to be installed on the system (``dot`` in PATH).

    Example::

        cni graph .
        cni graph . --output arch --format svg
        cni graph . --depth 3 --cluster
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
        help=(
            "Path to the repository root to analyze.  "
            "Accepts any directory containing Python, JS, or TS source files."
        ),
        exists=True,
        file_okay=False,
        dir_okay=True,
        readable=True,
        resolve_path=True,
    ),
    output: Path = typer.Option(
        "dependency_graph.png",
        "--output", "-o",
        help=(
            "Destination file path for the PNG visualization, "
            "including the ``.png`` extension.  "
            "Defaults to ``dependency_graph.png`` in the current directory."
        ),
    ),
) -> None:
    """Generate a matplotlib visualization of the dependency graph.

    Builds the dependency graph and renders it as a PNG image using
    matplotlib and networkx's spring layout.  Unlike ``cni graph``, this
    command does not require Graphviz to be installed.

    Requires ``matplotlib`` to be installed::

        pip install matplotlib

    Example::

        cni visualize .
        cni visualize /path/to/repo --output my_viz.png
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
        help=(
            "Source file to start from.  Accepts a full path, partial path "
            "(e.g. ``services/auth.py``), or bare filename (e.g. ``auth.py``)."
        ),
    ),
    target: str = typer.Argument(
        ...,
        help=(
            "Target file to trace to.  Accepts a full path, partial path, "
            "or bare filename."
        ),
    ),
    path_root: Path = typer.Argument(
        ".",
        help="Repository root directory.  Defaults to the current directory.",
        exists=True,
        dir_okay=True,
        file_okay=False,
        resolve_path=True,
    ),
) -> None:
    """Find the shortest dependency path between two files.

    Scans the repository, builds the dependency graph, and searches for the
    shortest directed path from SOURCE to TARGET through import edges.

    Useful for understanding why a change to one file might affect another.

    Example::

        cni path cni/cli/main.py cni/graph/dependency_graph.py
        cni path main.py cache.py /path/to/repo
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
        help=(
            "File to explain.  Accepts a full path, partial path "
            "(e.g. ``graph/dependency_graph.py``), or bare filename "
            "(e.g. ``dependency_graph.py``)."
        ),
    ),
    path_root: Path = typer.Argument(
        ".",
        help="Repository root directory.  Defaults to the current directory.",
        exists=True,
        dir_okay=True,
        file_okay=False,
        resolve_path=True,
    ),
) -> None:
    """Explain how a file participates in the dependency graph.

    Looks up the given file in the dependency graph and shows:

    - **Imports** — the modules this file directly imports.
    - **Imported by** — the modules that import this file.

    This is useful for quickly understanding a file's role in the codebase
    before reading its source code.

    Example::

        cni explain dependency_graph.py
        cni explain cni/storage/cache.py .
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
    """Suppress noisy model-loading output from sentence-transformers.

    Sets ``TOKENIZERS_PARALLELISM=false`` and silences the
    ``sentence_transformers`` and HuggingFace ``transformers`` loggers so
    that model download progress bars and warnings don't clutter CNI's
    output.
    """
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
        help=(
            "Business concept to trace, expressed as a short natural-language "
            "phrase (e.g. 'order processing', 'user authentication', 'payment').  "
            "CNI uses semantic search to find files related to this concept and "
            "then traces the execution chain through the dependency graph."
        ),
    ),
    path: Path = typer.Argument(
        ".",
        help="Repository root directory.  Defaults to the current directory.",
        exists=True,
        dir_okay=True,
        file_okay=False,
        resolve_path=True,
    ),
) -> None:
    """Trace the execution flow for a business concept through the codebase.

    Combines semantic search with dependency graph traversal to map out how
    a particular business concern (e.g. "order processing") flows through
    the code:

    1. Detects entry points (API routes, Celery tasks, etc.).
    2. Finds files semantically related to the concept via sentence-transformer
       embeddings.
    3. Performs a BFS from each entry point, following edges only through
       related files, to reconstruct execution chains.

    Requires the sentence-transformers model to be available locally or
    downloadable from HuggingFace.

    Example::

        cni flow "user authentication"
        cni flow "payment processing" /path/to/repo
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
        help=(
            "File to analyze.  Accepts a full path, partial path "
            "(e.g. ``storage/cache.py``), or bare filename (e.g. ``cache.py``).  "
            "CNI will find the best match in the dependency graph."
        ),
    ),
    path_root: Path = typer.Argument(
        ".",
        help="Repository root directory.  Defaults to the current directory.",
        exists=True,
        dir_okay=True,
        file_okay=False,
        resolve_path=True,
    ),
) -> None:
    """Analyze the blast radius of modifying a file.

    Performs a reverse BFS through the dependency graph to find every file
    that directly or transitively imports the target file.  Each dependent is
    scored by criticality (entry-point status, fan-in, and transitive depth).

    The report classifies overall risk as LOW / MEDIUM / HIGH and lists the
    top-10 most critical dependents so you can prioritize your testing effort.

    Example::

        cni impact cache.py
        cni impact cni/storage/cache.py .
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
        help="Repository root directory.  Defaults to the current directory.",
        exists=True,
        dir_okay=True,
        file_okay=False,
        resolve_path=True,
    ),
) -> None:
    """Generate a developer onboarding report for the codebase.

    Produces a structured summary designed for engineers who are new to the
    project, covering:

    - **Entry points** detected by framework decorator patterns.
    - **Critical modules** ranked by betweenness centrality (read these first).
    - **Dead modules** — isolated files that are likely legacy or unused.
    - **Architecture summary** — a concise LLM-generated plain-English
      description of how the codebase is organized (requires Ollama).

    Example::

        cni onboard
        cni onboard /path/to/repo
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
        help="Repository root directory.  Defaults to the current directory.",
        exists=True,
        dir_okay=True,
        file_okay=False,
        resolve_path=True,
    ),
) -> None:
    """Compute codebase health metrics and print a health report.

    Analyzes the dependency graph for three structural anti-patterns:

    - **God modules** — files imported by 10+ other files (high-risk to change).
    - **Highly coupled modules** — files that import 15+ others (brittle).
    - **Isolated modules** — files with no imports and no importers (dead code?).

    An overall health score (0–100) is computed from these signals.  A score
    of 100 means no anti-patterns were detected.

    Example::

        cni health
        cni health /path/to/repo
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
        help=(
            "Natural-language question about the codebase, enclosed in quotes "
            "(e.g. \"What does repo_scanner do?\").  CNI retrieves the most "
            "relevant code context using semantic search and sends it to the LLM."
        ),
    ),
    path: Path = typer.Argument(
        ".",
        help="Repository root directory.  Defaults to the current directory.",
        exists=True,
        dir_okay=True,
        file_okay=False,
        resolve_path=True,
    ),
) -> None:
    """Ask a natural language question about the codebase.

    Uses a two-step retrieval-augmented generation (RAG) pipeline:

    1. Embeds the question and all source files with a local sentence-transformer
       model to find the most semantically relevant code context.
    2. Sends the retrieved context and question to a local Ollama LLM for a
       concise, grounded answer.

    Requires Ollama to be running with a compatible model pulled::

        ollama serve
        ollama pull qwen2.5-coder:7b

    Example::

        cni ask "What does repo_scanner do?"
        cni ask "How is the cache invalidated?" /path/to/repo
    """
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
        help=(
            "Two or more paths to repository roots to connect.  "
            "Each path is scanned independently and then merged into "
            "a unified cross-repo dependency graph."
        ),
    ),
) -> None:
    """Connect multiple repositories and detect cross-service dependencies.

    Scans each repository independently, merges all graphs into a unified
    cross-repo graph, and detects cross-service connections using two
    heuristics:

    - **Shared module names** — files with the same stem across different repos.
    - **API client pattern** — files named ``*_client.py`` matched to same-named
      service files in other repos.

    Useful for microservice architectures where you want to understand how
    services depend on shared libraries or call each other.

    Example::

        cni connect /path/to/service-a /path/to/service-b
        cni connect ./auth-service ./payment-service ./api-gateway
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
    """Run diagnostic checks for all of CNI's external dependencies.

    Performs four checks and prints a pass/fail status for each:

    1. **Ollama reachability** — can CNI reach ``http://localhost:11434``?
    2. **Ollama models** — is at least one model available for inference?
    3. **Graphviz** — is the ``dot`` binary present in the system PATH?
    4. **CNI cache** — does ``.cni/cache.json`` exist in the current directory?

    Run this first if any CNI command is producing unexpected errors.

    Example::

        cni doctor
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

    # Windows-specific note
    if get_platform() == "windows":
        warning(
            "On Windows, Graphviz must be added to PATH manually "
            "after installation.\n"
            "   Download from: https://graphviz.org/download/"
        )

    # --- 4. Cache present? ----------------------------------------------
    cache_path = get_cache_dir(".") / "cache.json"
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