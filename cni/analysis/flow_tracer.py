"""
cni/analysis/flow_tracer.py

Detects entry points and traces execution flow for a given business concept.

Supports **framework-aware** entry-point detection (Django, Flask, FastAPI,
Scrapy, Celery, etc.) as well as graph-based detection (zero in-degree nodes).
"""

from __future__ import annotations

import ast
import re
from collections import deque
from pathlib import Path
from typing import TypedDict

import networkx as nx


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

class EntryPoint(TypedDict):
    file: str
    decorator: str


class FlowReport(TypedDict):
    query: str
    entry_points: list[EntryPoint]
    flow_chains: list[list[str]]


# ---------------------------------------------------------------------------
# Framework detection
# ---------------------------------------------------------------------------

def detect_framework(repo_path: str) -> list[str]:
    """Detect which frameworks are used in the repo by reading dependency files.

    Scans ``requirements.txt``, ``pyproject.toml``, ``setup.py``,
    ``setup.cfg``, and ``Pipfile`` for known framework keywords.

    Args:
        repo_path: Root path of the repository.

    Returns:
        List of detected framework name strings (e.g. ``["django", "celery"]``).
    """
    frameworks: list[str] = []
    repo = Path(repo_path)

    dep_files = [
        repo / "requirements.txt",
        repo / "pyproject.toml",
        repo / "setup.py",
        repo / "setup.cfg",
        repo / "Pipfile",
    ]

    content = ""
    for f in dep_files:
        if f.exists():
            content += f.read_text(encoding="utf-8", errors="replace").lower()

    checks: dict[str, list[str]] = {
        "django":   ["django"],
        "flask":    ["flask"],
        "fastapi":  ["fastapi"],
        "scrapy":   ["scrapy"],
        "celery":   ["celery"],
        "click":    ["click"],
        "typer":    ["typer"],
        "airflow":  ["airflow", "apache-airflow"],
        "pytest":   ["pytest"],
        "grpc":     ["grpc", "grpcio"],
        "graphql":  ["graphene", "strawberry"],
        "aiohttp":  ["aiohttp"],
        "tornado":  ["tornado"],
        "sanic":    ["sanic"],
    }

    for name, keywords in checks.items():
        if any(k in content for k in keywords):
            frameworks.append(name)

    return frameworks


# ---------------------------------------------------------------------------
# Framework pattern map
# ---------------------------------------------------------------------------

FRAMEWORK_PATTERNS: dict[str, list[str]] = {
    "django": [
        "urlpatterns",
        r"def get\(",
        r"def post\(",
        r"def put\(",
        r"def delete\(",
        r"class.*View",
        r"class.*ViewSet",
    ],
    "flask": [
        r"@app\.route",
        r"@blueprint\.route",
        r"@.*\.route",
    ],
    "fastapi": [
        r"@router\.get",
        r"@router\.post",
        r"@router\.put",
        r"@router\.delete",
        r"@app\.get",
        r"@app\.post",
    ],
    "scrapy": [
        r"class.*Spider",
        r"class.*CrawlSpider",
        "start_requests",
        r"def parse\(",
    ],
    "celery": [
        r"@celery\.task",
        r"@app\.task",
        "@shared_task",
    ],
    "click": [
        r"@click\.command",
        r"@click\.group",
        r"@cli\.command",
    ],
    "typer": [
        r"@app\.command",
        r"typer\.Typer",
    ],
    "airflow": [
        r"DAG\(",
        "@task",
        "PythonOperator",
        "BashOperator",
    ],
    "pytest": [
        "def test_",
        "class Test",
    ],
    "grpc": [
        r"add_.*Servicer",
        r"grpc\.server",
    ],
    "graphql": [
        r"@query\.field",
        r"@mutation\.field",
        r"@strawberry\.type",
    ],
    "generic": [
        r"def main\(",
        "if __name__",
        r"@.*\.command",
    ],
}


# ---------------------------------------------------------------------------
# Entry-point detection (framework-aware)
# ---------------------------------------------------------------------------

def detect_entry_points(
    file_paths: list[str],
    repo_path: str = ".",
) -> list[EntryPoint]:
    """Detect entry points using framework-specific pattern matching.

    1. Detects which frameworks the repo uses via :func:`detect_framework`.
    2. Collects all relevant regex patterns for those frameworks.
    3. Scans every ``.py`` file for matching patterns.

    The ``generic`` patterns (``def main(``, ``if __name__``) are always
    included as a fallback.

    Args:
        file_paths: List of absolute file path strings.
        repo_path:  Root path of the repository (used for framework detection).

    Returns:
        List of :class:`EntryPoint` dicts with ``file`` and ``decorator``.
    """
    # Strategy 1: framework pattern matching
    frameworks = detect_framework(repo_path)

    # If no frameworks detected, use ALL patterns as fallback
    if not frameworks:
        frameworks = list(FRAMEWORK_PATTERNS.keys())
    elif "generic" not in frameworks:
        frameworks.append("generic")

    # Collect all patterns for detected frameworks
    patterns: list[str] = []
    for fw in frameworks:
        patterns.extend(FRAMEWORK_PATTERNS.get(fw, []))

    # Compile patterns
    compiled = [re.compile(p) for p in patterns]

    results: list[EntryPoint] = []
    for fp in file_paths:
        path = Path(fp)
        if path.suffix != ".py":
            continue
        try:
            source = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue

        for pattern in compiled:
            match = pattern.search(source)
            if match:
                results.append(EntryPoint(
                    file=fp,
                    decorator=match.group(0),
                ))
                break  # one match per file is sufficient

    # Filter out __main__.py
    results = [
        e for e in results
        if Path(e["file"]).name != "__main__.py"
    ]

    return results


# ---------------------------------------------------------------------------
# Graph-based entry-point detection
# ---------------------------------------------------------------------------

def detect_entry_points_from_graph(
    graph: nx.DiGraph,
    files: list[str],
) -> list[str]:
    """Detect entry points using graph structure.

    An entry point is a node with **zero incoming edges** and **at least one
    outgoing edge** — i.e. it imports other modules but nothing imports it.

    ``__init__.py``, ``conftest.py``, ``setup.py``, migration files, and
    ``test_*`` files are excluded as noise.

    Args:
        graph: Directed dependency graph.
        files: All file paths in the repo (unused but kept for interface
               consistency).

    Returns:
        List of file path strings identified as entry points.
    """
    noise = {"__init__", "conftest", "setup", "migrate"}

    entries: list[str] = []
    for node in graph.nodes:
        name = Path(node).stem.lower()
        if name == "__main__":
            continue
        if any(n in name for n in noise):
            continue
        if name.startswith("test_"):
            continue
        if graph.in_degree(node) == 0 and graph.out_degree(node) > 0:
            entries.append(node)

    return entries


# ---------------------------------------------------------------------------
# Flow tracing
# ---------------------------------------------------------------------------

def trace_flow(
    graph: nx.DiGraph,
    entry_points: list[EntryPoint],
    related_files: list[str],
) -> list[list[str]]:
    """Trace execution flow from entry points through related modules.

    For each entry point, performs a BFS along graph edges, only following
    paths through the set of semantically related files.

    Args:
        graph:         Directed dependency graph.
        entry_points:  Detected entry points (from :func:`detect_entry_points`).
        related_files: Semantically related file paths (from semantic search).

    Returns:
        List of flow chains.  Each chain is an ordered list of file paths
        representing one execution path from an entry point.
    """
    related_set = set(related_files)
    ep_paths = {ep["file"] for ep in entry_points}
    chains: list[list[str]] = []

    for ep in entry_points:
        start = ep["file"]
        if start not in graph:
            continue

        # BFS through successors, staying within related files
        visited: set[str] = {start}
        queue: deque[list[str]] = deque([[start]])
        best_chain: list[str] = [start]

        while queue:
            path = queue.popleft()
            current = path[-1]

            for successor in graph.successors(current):
                if successor not in visited and (
                    successor in related_set or successor in ep_paths
                ):
                    visited.add(successor)
                    new_path = path + [successor]
                    queue.append(new_path)
                    if len(new_path) > len(best_chain):
                        best_chain = new_path

        if len(best_chain) > 1:
            chains.append(best_chain)

    # If no chains from entry points, just return related files as a chain
    if not chains and related_files:
        chains.append(related_files[:5])

    return chains


# ---------------------------------------------------------------------------
# Output formatting
# ---------------------------------------------------------------------------

def format_flow_report(report: FlowReport) -> str:
    """Format a flow report for terminal output.

    Args:
        report: The flow report to format.

    Returns:
        Multi-line string to print.
    """
    lines: list[str] = []

    lines.append(f"\nFlow: {report['query']}")
    lines.append("─" * (len(report["query"]) + 6))

    # Entry points
    lines.append("\nEntry points detected:")
    if report["entry_points"]:
        for ep in report["entry_points"]:
            name = Path(ep["file"]).name
            lines.append(f"  {name:<35s} ({ep['decorator']})")
    else:
        lines.append("  (none detected)")

    # Execution flows
    lines.append("\nExecution flow:")
    if report["flow_chains"]:
        for chain in report["flow_chains"]:
            for i, node in enumerate(chain):
                label = Path(node).name
                indent = "    " * i
                if i == 0:
                    lines.append(f"  {label}")
                else:
                    lines.append(f"  {indent}→ {label}")
            lines.append("")
    else:
        lines.append("  No execution flow detected for this concept.")

    return "\n".join(lines)
