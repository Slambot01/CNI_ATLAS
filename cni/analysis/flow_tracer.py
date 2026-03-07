"""
cni/analysis/flow_tracer.py

Detects entry points and traces execution flow for a given business concept.
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
# Entry-point detection patterns
# ---------------------------------------------------------------------------

# Decorators that mark entry points (API routes, tasks, etc.)
_ENTRY_PATTERNS: list[str] = [
    r"@app\.route",
    r"@app\.get",
    r"@app\.post",
    r"@app\.put",
    r"@app\.delete",
    r"@router\.get",
    r"@router\.post",
    r"@router\.put",
    r"@router\.delete",
    r"@celery\.task",
    r"@app\.task",
    r"@shared_task",
]

_COMPILED_PATTERNS = [re.compile(p) for p in _ENTRY_PATTERNS]


def detect_entry_points(file_paths: list[str]) -> list[EntryPoint]:
    """Scan files for entry-point decorators.

    Looks for common framework patterns such as ``@app.route``,
    ``@router.get``, ``@celery.task``, etc.

    Args:
        file_paths: List of absolute file path strings.

    Returns:
        List of :class:`EntryPoint` dicts with ``file`` and ``decorator``.
    """
    results: list[EntryPoint] = []

    for fp in file_paths:
        path = Path(fp)
        if path.suffix != ".py":
            continue
        try:
            source = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue

        for pattern in _COMPILED_PATTERNS:
            match = pattern.search(source)
            if match:
                results.append(EntryPoint(
                    file=fp,
                    decorator=match.group(0),
                ))
                break  # one match per file is sufficient

    return results


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
