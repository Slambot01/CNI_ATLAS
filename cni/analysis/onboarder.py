"""
cni/analysis/onboarder.py

Generates a structured onboarding report for unfamiliar codebases.
"""

from __future__ import annotations

from pathlib import Path
from typing import TypedDict

import networkx as nx

from cni.analysis.flow_tracer import detect_entry_points


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

class OnboardingReport(TypedDict):
    entry_points: list[str]
    critical_modules: list[tuple[str, float]]
    dead_modules: list[str]
    architecture_summary: str


# ---------------------------------------------------------------------------
# Core
# ---------------------------------------------------------------------------

def generate_onboarding_report(
    graph: nx.DiGraph,
    file_paths: list[str],
    llm_fn: object | None = None,
) -> OnboardingReport:
    """Generate a comprehensive onboarding report.

    Steps:
      1. Detect entry points (API routes, tasks, etc.)
      2. Rank modules by betweenness centrality
      3. Flag dead modules (zero in-degree AND zero out-degree)
      4. Optionally generate an LLM architecture summary

    Args:
        graph:      Directed dependency graph.
        file_paths: All file paths in the repo.
        llm_fn:     Optional callable ``(context, question) -> str`` for
                    generating the architecture summary.  If ``None``, a
                    placeholder is used.

    Returns:
        An :class:`OnboardingReport` dict.
    """
    # 1. Entry points
    eps = detect_entry_points(file_paths)
    ep_names = [ep["file"] for ep in eps]

    # 2. Betweenness centrality
    centrality: dict[str, float] = nx.betweenness_centrality(graph)
    ranked = sorted(centrality.items(), key=lambda x: x[1], reverse=True)
    top_10 = [(Path(node).name, round(score, 2)) for node, score in ranked[:10]]

    # 3. Dead modules
    dead: list[str] = []
    for node in graph.nodes:
        if graph.in_degree(node) == 0 and graph.out_degree(node) == 0:
            dead.append(Path(node).name)

    # 4. Architecture summary via LLM
    summary = "(LLM summary not available — Ollama may not be running)"
    if llm_fn is not None and callable(llm_fn):
        try:
            module_info = "\n".join(
                f"  {name} (centrality: {score})" for name, score in top_10
            )
            ep_info = "\n".join(f"  {Path(e).name}" for e in ep_names[:5])
            context = (
                f"Top modules by centrality:\n{module_info}\n\n"
                f"Entry points:\n{ep_info}\n\n"
                f"Dead modules: {', '.join(dead[:5]) if dead else 'none'}"
            )
            question = (
                "Based on the module relationships above, write a 2-3 sentence "
                "plain English summary of how this codebase is architecturally "
                "organized. Mention what the main services do and how they "
                "connect."
            )
            summary = llm_fn(context, question)
        except Exception:
            summary = "(Failed to generate LLM summary)"

    return OnboardingReport(
        entry_points=ep_names,
        critical_modules=top_10,
        dead_modules=dead,
        architecture_summary=summary,
    )


# ---------------------------------------------------------------------------
# Output formatting
# ---------------------------------------------------------------------------

def format_onboarding_report(report: OnboardingReport) -> str:
    """Format an onboarding report for terminal output."""
    lines: list[str] = []

    lines.append("\nCNI Onboarding Report")
    lines.append("─────────────────────")

    lines.append(f"\nEntry points detected: {len(report['entry_points'])}")
    for ep in report["entry_points"][:10]:
        lines.append(f"  {Path(ep).name}")

    lines.append("\nMost critical modules (read these first):")
    for i, (name, score) in enumerate(report["critical_modules"], 1):
        lines.append(f"  {i:>2}.  {name:<35s} centrality: {score}")

    if report["dead_modules"]:
        lines.append("\nDead modules (possibly legacy):")
        for dm in report["dead_modules"][:10]:
            lines.append(f"  {dm}")

    lines.append(f"\nArchitecture summary:\n  {report['architecture_summary']}")

    return "\n".join(lines)
