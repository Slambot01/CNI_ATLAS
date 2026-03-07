"""
cni/analysis/health.py

Computes codebase health metrics and produces a structured report.
"""

from __future__ import annotations

from pathlib import Path
from typing import TypedDict

import networkx as nx


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

class ModuleFlag(TypedDict):
    file: str
    value: int
    severity: str


class HealthReport(TypedDict):
    total_modules: int
    total_edges: int
    avg_in_degree: float
    avg_out_degree: float
    god_modules: list[ModuleFlag]
    coupled_modules: list[ModuleFlag]
    isolated_count: int
    health_score: int


# ---------------------------------------------------------------------------
# Core
# ---------------------------------------------------------------------------

def compute_health(graph: nx.DiGraph) -> HealthReport:
    """Compute codebase health metrics.

    Metrics:
      - **God modules**:    in-degree ≥ 10
      - **Coupled modules**: out-degree ≥ 15
      - **Isolated modules**: in-degree = 0 AND out-degree = 0

    Health score formula::

        score = 100 - 2×gods - 1×coupled - 0.1×isolated

    Args:
        graph: Directed dependency graph.

    Returns:
        A :class:`HealthReport` dict.
    """
    n_nodes = graph.number_of_nodes()
    n_edges = graph.number_of_edges()

    if n_nodes == 0:
        return HealthReport(
            total_modules=0,
            total_edges=0,
            avg_in_degree=0.0,
            avg_out_degree=0.0,
            god_modules=[],
            coupled_modules=[],
            isolated_count=0,
            health_score=100,
        )

    avg_in = n_edges / n_nodes
    avg_out = n_edges / n_nodes

    # God modules: in-degree >= 10
    gods: list[ModuleFlag] = []
    for node in graph.nodes:
        in_deg = graph.in_degree(node)
        if in_deg >= 10:
            severity = "CRITICAL" if in_deg >= 20 else "WARNING"
            gods.append(ModuleFlag(
                file=Path(node).name,
                value=in_deg,
                severity=severity,
            ))
    gods.sort(key=lambda x: x["value"], reverse=True)

    # Coupled modules: out-degree >= 15
    coupled: list[ModuleFlag] = []
    for node in graph.nodes:
        out_deg = graph.out_degree(node)
        if out_deg >= 15:
            severity = "CRITICAL" if out_deg >= 25 else "WARNING"
            coupled.append(ModuleFlag(
                file=Path(node).name,
                value=out_deg,
                severity=severity,
            ))
    coupled.sort(key=lambda x: x["value"], reverse=True)

    # Isolated modules
    isolated = sum(
        1 for n in graph.nodes
        if graph.in_degree(n) == 0 and graph.out_degree(n) == 0
    )

    # Health score
    score = max(0, int(100 - 2 * len(gods) - 1 * len(coupled) - 0.1 * isolated))

    return HealthReport(
        total_modules=n_nodes,
        total_edges=n_edges,
        avg_in_degree=round(avg_in, 1),
        avg_out_degree=round(avg_out, 1),
        god_modules=gods,
        coupled_modules=coupled,
        isolated_count=isolated,
        health_score=score,
    )


# ---------------------------------------------------------------------------
# Output formatting
# ---------------------------------------------------------------------------

def format_health_report(report: HealthReport) -> str:
    """Format a health report for terminal output."""
    lines: list[str] = []

    lines.append("\nCodebase Health Report")
    lines.append("──────────────────────")

    lines.append(f"  Total modules   : {report['total_modules']:,}")
    lines.append(f"  Total edges     : {report['total_edges']:,}")
    lines.append(f"  Avg in-degree   : {report['avg_in_degree']}")
    lines.append(f"  Avg out-degree  : {report['avg_out_degree']}")

    lines.append("\n  God modules (in-degree >= 10):")
    if report["god_modules"]:
        for gm in report["god_modules"]:
            lines.append(
                f"    {gm['file']:<35s} in-degree: {gm['value']:<5d} {gm['severity']}"
            )
    else:
        lines.append("    (none)")

    lines.append("\n  Highly coupled modules (out-degree >= 15):")
    if report["coupled_modules"]:
        for cm in report["coupled_modules"]:
            lines.append(
                f"    {cm['file']:<35s} out-degree: {cm['value']:<5d} {cm['severity']}"
            )
    else:
        lines.append("    (none)")

    lines.append(f"\n  Isolated modules: {report['isolated_count']}")
    lines.append(f"\n  Overall health score: {report['health_score']} / 100")

    return "\n".join(lines)
