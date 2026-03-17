"""
cni/analysis/onboarder.py

Generates a structured onboarding report for developers who are new to a
codebase.

The report covers four things that matter most when ramping up on an unfamiliar
project:

1. **Entry points** — API routes, Celery tasks, CLI commands, Spiders, and
   other files where execution enters the system.  Detected via both
   *framework-pattern matching* and *graph-based analysis* (zero in-degree).
2. **Critical modules** — the top-10 files by betweenness centrality.  These
   are the "load-bearing walls" of the architecture.  Noise files such as
   ``__init__.py`` and ``conftest.py`` are filtered out.
3. **Dead modules** — files with no in-edges and no out-edges that are likely
   legacy or utility code never integrated into the main graph.
4. **Architecture summary** — an optional 2-3 sentence LLM-generated plain
   English description of how the codebase is organized.

Used by ``cni onboard``.
"""

from __future__ import annotations

from pathlib import Path
from typing import TypedDict

import networkx as nx

from cni.analysis.flow_tracer import (
    detect_entry_points,
    detect_entry_points_from_graph,
)


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
      1. Detect entry points using *both* framework patterns and graph analysis
      2. Rank modules by betweenness centrality (filtering noise)
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
    # ------------------------------------------------------------------
    # 1. Entry points — combine pattern-based + graph-based strategies
    # ------------------------------------------------------------------

    # Derive repo_path from file_paths (common ancestor)
    repo_path = "."
    if file_paths:
        try:
            parts = [Path(fp).parts for fp in file_paths[:20]]
            common = Path(*parts[0])
            for p in parts[1:]:
                while common.parts and common.parts != p[: len(common.parts)]:
                    common = common.parent
            repo_path = str(common)
        except Exception:
            repo_path = str(Path(file_paths[0]).parent)

    # Strategy 1: pattern based
    eps = detect_entry_points(file_paths, repo_path)
    pattern_entries = [ep["file"] for ep in eps]

    # Strategy 2: graph based
    graph_entries = detect_entry_points_from_graph(graph, file_paths)

    # Combine and deduplicate
    all_entries = list(dict.fromkeys(pattern_entries + graph_entries))

    # Use filenames only for display
    ep_names = all_entries

    # ------------------------------------------------------------------
    # 2. Betweenness centrality — filter noise from ranking
    # ------------------------------------------------------------------

    centrality: dict[str, float] = nx.betweenness_centrality(graph)
    ranked = sorted(centrality.items(), key=lambda x: x[1], reverse=True)

    noise = {
        "__init__", "conftest", "setup",
        "test_", "migrate", "wsgi", "asgi",
    }

    critical = [
        (node, score)
        for node, score in ranked
        if not any(n in Path(node).stem.lower() for n in noise)
    ][:10]

    top_10 = [
        (Path(node).name, round(score, 2))
        for node, score in critical
    ]

    # ------------------------------------------------------------------
    # 3. Dead modules
    # ------------------------------------------------------------------

    dead = [
        Path(n).name for n in graph.nodes
        if graph.in_degree(n) == 0
        and graph.out_degree(n) == 0
        and "__init__" not in Path(n).name
        and "test_" not in Path(n).name
        and "__main__" not in Path(n).name
    ]

    # ------------------------------------------------------------------
    # 4. Architecture summary via LLM (with graceful error handling)
    # ------------------------------------------------------------------

    summary = "(LLM summary not available — Ollama may not be running)"
    if llm_fn is not None and callable(llm_fn):
        try:
            module_info = "\n".join(
                f"  {name} (centrality: {score})" for name, score in top_10
            )
            ep_info = "\n".join(
                f"  {Path(e).name}" for e in ep_names[:5]
            )
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
        except Exception as e:
            error_str = str(e)
            if "500" in error_str:
                summary = (
                    "LLM temporarily unavailable.\n"
                    "  Try: ollama stop && ollama serve"
                )
            elif "ConnectionRefused" in error_str or "Connection refused" in error_str:
                summary = (
                    "Ollama is not running.\n"
                    "  Start it with: ollama serve"
                )
            else:
                summary = f"LLM unavailable: {error_str}"

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
    """Format an :class:`OnboardingReport` as a human-readable terminal string.

    Args:
        report: The onboarding report dict produced by
                :func:`generate_onboarding_report`.

    Returns:
        A multi-line string suitable for printing to stdout.

    Example:
        >>> report = generate_onboarding_report(graph, file_paths)
        >>> print(format_onboarding_report(report))
        CNI Onboarding Report
        ─────────────────────
        Entry points detected: 3
        ...
    """
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
