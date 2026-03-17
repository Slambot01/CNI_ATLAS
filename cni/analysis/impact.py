"""
cni/analysis/impact.py

Analyzes the blast radius of modifying a given file in the dependency graph.

The impact analysis performs a reverse BFS (traversing edges backwards) to
find all files that directly or transitively depend on the target file.  Each
dependent is then scored by criticality (entry-point status, own-dependent
count, and transitive depth), and the overall change is classified as LOW,
MEDIUM, or HIGH risk.

Used by ``cni impact <file>`` to help developers predict the consequences of
a change before making it.
"""

from __future__ import annotations

from collections import deque
from pathlib import Path
from typing import TypedDict

import networkx as nx

from cni.analysis.flow_tracer import detect_entry_points


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

class DependentInfo(TypedDict):
    file: str
    score: float
    reasons: list[str]


class ImpactReport(TypedDict):
    target_file: str
    direct_count: int
    transitive_count: int
    services_affected: int
    critical_dependents: list[DependentInfo]
    risk_level: str


# ---------------------------------------------------------------------------
# Core
# ---------------------------------------------------------------------------

def _reverse_bfs(graph: nx.DiGraph, start: str) -> dict[str, int]:
    """BFS along reverse edges to find all transitive dependents.

    Args:
        graph: Directed dependency graph.
        start: Node to trace dependents from.

    Returns:
        Dict mapping each dependent node to its distance (depth) from *start*.
    """
    dependents: dict[str, int] = {}
    visited: set[str] = {start}
    queue: deque[tuple[str, int]] = deque([(start, 0)])

    while queue:
        node, depth = queue.popleft()
        for pred in graph.predecessors(node):
            if pred not in visited:
                visited.add(pred)
                dependents[pred] = depth + 1
                queue.append((pred, depth + 1))

    return dependents


def analyze_impact(
    graph: nx.DiGraph,
    target: str,
    file_paths: list[str],
    repo_path: str = ".",
) -> ImpactReport:
    """Analyze the impact of modifying a file.

    Finds all direct and transitive dependents, scores them by
    criticality, and determines the overall risk level.

    Args:
        graph:      Directed dependency graph.
        target:     Full path of the file being analyzed.
        file_paths: All file paths in the repo (for entry point detection).
        repo_path:  Root path of the repository (for framework detection).

    Returns:
        An :class:`ImpactReport` dict.
    """
    # Find all dependents via reverse BFS
    dependents = _reverse_bfs(graph, target)

    direct = {n for n, d in dependents.items() if d == 1}
    transitive = set(dependents.keys())

    # Detect entry points for scoring
    ep_files = {ep["file"] for ep in detect_entry_points(file_paths, repo_path=repo_path)}

    # Count services (unique top-level directories)
    services: set[str] = set()
    for dep in transitive:
        parts = Path(dep).parts
        if len(parts) >= 2:
            services.add(parts[-2] if len(parts) > 2 else parts[-1])

    # Score each dependent
    scored: list[DependentInfo] = []
    for dep, depth in dependents.items():
        score = 0.0
        reasons: list[str] = []

        # +3 if entry point
        if dep in ep_files:
            score += 3
            reasons.append("entry point")

        # +2 if has 5+ dependents itself
        dep_count = graph.in_degree(dep)
        if dep_count >= 5:
            score += 2
            reasons.append(f"{dep_count} dependents")
        elif dep_count > 0:
            reasons.append(f"{dep_count} dependents")

        # +1 per depth level
        score += depth

        scored.append(DependentInfo(
            file=dep,
            score=score,
            reasons=reasons,
        ))

    # Sort by score descending
    scored.sort(key=lambda x: x["score"], reverse=True)

    # Risk level
    t_count = len(transitive)
    if t_count >= 20:
        risk = "HIGH"
    elif t_count >= 5:
        risk = "MEDIUM"
    else:
        risk = "LOW"

    return ImpactReport(
        target_file=target,
        direct_count=len(direct),
        transitive_count=t_count,
        services_affected=len(services),
        critical_dependents=scored[:10],
        risk_level=risk,
    )


# ---------------------------------------------------------------------------
# Output formatting
# ---------------------------------------------------------------------------

def format_impact_report(report: ImpactReport) -> str:
    """Format an :class:`ImpactReport` as a human-readable terminal string.

    Args:
        report: The impact report dict produced by :func:`analyze_impact`.

    Returns:
        A multi-line string suitable for printing to stdout.

    Example:
        >>> report = analyze_impact(graph, target, file_paths)
        >>> print(format_impact_report(report))
        Impact report: cache.py
        ───────────────────────
          Direct dependents    : 2
          ...
    """
    lines: list[str] = []
    name = Path(report["target_file"]).name

    lines.append(f"\nImpact report: {name}")
    lines.append("─" * (len(name) + 16))

    lines.append(f"  Direct dependents    : {report['direct_count']}")
    lines.append(f"  Transitive dependents: {report['transitive_count']}")
    lines.append(f"  Services affected    : {report['services_affected']}")

    lines.append("\n  Critical dependents (ranked by score):")
    if report["critical_dependents"]:
        for dep in report["critical_dependents"]:
            label = Path(dep["file"]).name
            reasons = ", ".join(dep["reasons"]) if dep["reasons"] else ""
            lines.append(f"    [{dep['score']:.1f}]  {label:<35s} {reasons}")
    else:
        lines.append("    (none)")

    lines.append(f"\n  Risk level: {report['risk_level']}")

    return "\n".join(lines)
