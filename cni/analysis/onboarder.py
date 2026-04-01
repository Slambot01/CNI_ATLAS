"""
cni/analysis/onboarder.py

Generates a structured onboarding report for developers who are new to a
codebase.

The report covers four things that matter most when ramping up on an unfamiliar
project:

1. **Entry points** — API routes, Celery tasks, CLI commands, Spiders, and
   other files where execution enters the system.  Detected via both
   *framework-pattern matching* and *graph-based analysis* (zero in-degree).
   Results are classified into source, test, and example categories.
2. **Critical modules** — the top-10 files by *combined criticality score*
   (weighted mix of in-degree, betweenness centrality, and out-degree).
   Noise files such as ``__init__.py`` and ``conftest.py`` are filtered out.
3. **Dead modules** — files with no in-edges and no out-edges that are likely
   legacy or utility code never integrated into the main graph.  Known
   active-by-convention files (``conf.py``, ``tasks.py``, etc.) are excluded.
4. **Architecture summary** — an optional 2-3 sentence LLM-generated plain
   English description of how the codebase is organized, using specific
   context about the most-imported files, entry points, and directory
   structure.

Used by ``cni onboard``.
"""

from __future__ import annotations

from pathlib import Path
from typing import TypedDict

import networkx as nx

from cni.analysis.flow_tracer import (
    detect_classified_entry_points,
    detect_framework,
)


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

class OnboardingReport(TypedDict):
    """Typed dict for the onboarding report."""

    entry_points: list[str]
    entry_points_tests: list[str]
    entry_points_examples: list[str]
    critical_modules: list[tuple[str, float]]
    dead_modules: list[str]
    architecture_summary: str


# ---------------------------------------------------------------------------
# Known-active file patterns (Bug 4)
# ---------------------------------------------------------------------------

_NEVER_DEAD_PATTERNS: set[str] = {
    "conf.py",          # Sphinx config
    "settings.py",      # Django settings
    "tasks.py",         # Celery tasks
    "celery.py",        # Celery app
    "wsgi.py",          # WSGI entry
    "asgi.py",          # ASGI entry
    "manage.py",        # Django management
    "setup.py",         # Package setup
    "conftest.py",      # Pytest fixtures
}

_NEVER_DEAD_DIRS: set[str] = {"docs", "doc"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def relative_path(abs_path: str, repo_path: str) -> str:
    """Convert an absolute path to a repo-relative path.

    Args:
        abs_path:  Absolute (or long) file path.
        repo_path: Root path of the repository.

    Returns:
        Relative path string (e.g. ``src/flask/app.py``).  Falls back to
        the bare filename if the path is not under *repo_path*.
    """
    try:
        return str(Path(abs_path).relative_to(Path(repo_path).resolve()))
    except ValueError:
        try:
            return str(Path(abs_path).relative_to(Path(repo_path)))
        except ValueError:
            return Path(abs_path).name


def is_likely_dead(node: str, graph: nx.DiGraph) -> bool:
    """Determine whether *node* is genuinely dead code.

    A file is considered dead only when all of the following are true:

    - It has zero in-degree AND zero out-degree.
    - Its filename is not in the ``_NEVER_DEAD_PATTERNS`` set.
    - It does not reside in a ``docs/`` or ``doc/`` directory.
    - It is not an ``__init__.py``, ``test_*``, or ``__main__.py`` file.

    Args:
        node:  Absolute file path string (graph node key).
        graph: Directed dependency graph.

    Returns:
        ``True`` if the file appears to be dead code.
    """
    filename = Path(node).name

    # Never flag known-active patterns
    if filename in _NEVER_DEAD_PATTERNS:
        return False

    # Never flag files in docs/ directory
    parts = set(Path(node).parts)
    if parts & _NEVER_DEAD_DIRS:
        return False

    # Skip noise files
    if "__init__" in filename:
        return False
    if filename.startswith("test_"):
        return False
    if "__main__" in filename:
        return False

    # Must have zero in-degree AND zero out-degree
    if graph.in_degree(node) > 0:
        return False
    if graph.out_degree(node) > 0:
        return False

    return True


def combined_criticality(
    graph: nx.DiGraph,
    node: str,
    betweenness: dict[str, float],
) -> float:
    """Compute a combined criticality score for a graph node.

    The score weights three signals:

    - **In-degree (60 %)** — direct dependency count matters most.
    - **Betweenness centrality (30 %)** — scaled by 1 000 to bring it into
      a comparable range with degree counts.
    - **Out-degree (10 %)** — files that import many others are also
      structurally important.

    Args:
        graph:       Directed dependency graph.
        node:        Graph node key (absolute file path).
        betweenness: Pre-computed betweenness centrality dict.

    Returns:
        Combined criticality score (higher = more critical).
    """
    indegree = graph.in_degree(node)
    between = betweenness.get(node, 0.0)
    outdegree = graph.out_degree(node)

    score = (indegree * 0.6) + (between * 1000 * 0.3) + (outdegree * 0.1)
    return score


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
      1. Detect and classify entry points (source / test / example)
      2. Rank modules by combined criticality score
      3. Flag dead modules using :func:`is_likely_dead`
      4. Optionally generate an LLM architecture summary with specific context

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
    # 1. Entry points — classified into source / test / example
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

    classified = detect_classified_entry_points(graph, file_paths, repo_path)

    # Convert to relative paths for display
    ep_source = [relative_path(e, repo_path) for e in classified.source]
    ep_tests = [relative_path(e, repo_path) for e in classified.tests]
    ep_examples = [relative_path(e, repo_path) for e in classified.examples]

    # ------------------------------------------------------------------
    # 2. Combined criticality — filter noise from ranking (Bug 3)
    # ------------------------------------------------------------------

    betweenness: dict[str, float] = nx.betweenness_centrality(graph)

    noise = {
        "__init__", "conftest", "setup",
        "test_", "migrate",
    }

    scored: list[tuple[str, float]] = []
    for node in graph.nodes:
        stem = Path(node).stem.lower()
        if any(n in stem for n in noise):
            continue
        score = combined_criticality(graph, node, betweenness)
        scored.append((node, score))

    scored.sort(key=lambda x: x[1], reverse=True)
    critical = scored[:10]

    # Relative paths + rounded scores for display
    top_10: list[tuple[str, float]] = [
        (relative_path(node, repo_path), round(score, 2))
        for node, score in critical
    ]

    # ------------------------------------------------------------------
    # 3. Dead modules (Bug 4 — filter known-active patterns)
    # ------------------------------------------------------------------

    dead: list[str] = [
        relative_path(n, repo_path)
        for n in graph.nodes
        if is_likely_dead(n, graph)
    ]

    # ------------------------------------------------------------------
    # 4. Architecture summary via LLM (Bug 5 — improved prompt)
    # ------------------------------------------------------------------

    summary = "(LLM summary not available — Ollama may not be running)"
    if llm_fn is not None and callable(llm_fn):
        try:
            # Compute top files by in-degree for specific context
            top_by_indegree = sorted(
                [
                    (relative_path(n, repo_path), graph.in_degree(n))
                    for n in graph.nodes
                    if "__init__" not in Path(n).name
                ],
                key=lambda x: x[1],
                reverse=True,
            )[:10]
            indegree_info = "\n".join(
                f"  {name} (imported by {deg} files)"
                for name, deg in top_by_indegree
            )

            # Source entry points
            ep_info = "\n".join(
                f"  {e}" for e in ep_source[:10]
            ) or "  (none detected)"

            # Unique directories for structure insight
            unique_dirs = sorted({
                str(Path(relative_path(fp, repo_path)).parent)
                for fp in file_paths[:100]
            })
            dir_info = "\n".join(f"  {d}" for d in unique_dirs[:20])

            # Detected frameworks
            detected_frameworks = detect_framework(repo_path)
            frameworks_info = ", ".join(detected_frameworks) if detected_frameworks else "none detected"

            # Repo name
            repo_name = Path(repo_path).name

            context = (
                f"Repository: {repo_name}\n\n"
                f"Most imported files (by in-degree):\n{indegree_info}\n\n"
                f"True entry points (zero in-degree, non-test):\n{ep_info}\n\n"
                f"Directory structure:\n{dir_info}\n\n"
                f"Framework indicators found: {frameworks_info}\n\n"
                f"Dead modules: {', '.join(dead[:5]) if dead else 'none'}"
            )
            question = (
                "Analyze this Python codebase and write a specific architecture "
                "summary in 3-4 sentences.\n\n"
                "Write a summary that:\n"
                "1. Identifies the specific type of project\n"
                "2. Explains the core architectural pattern\n"
                "3. Names the actual most important modules\n"
                "4. Describes how the entry points connect to core\n\n"
                "Do NOT write generic descriptions.\n"
                "Do NOT say 'app.py serves as entry point' unless app.py "
                "actually has zero in-degree.\n"
                "Be specific to THIS codebase."
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
        entry_points=ep_source,
        entry_points_tests=ep_tests,
        entry_points_examples=ep_examples,
        critical_modules=top_10,
        dead_modules=dead,
        architecture_summary=summary,
    )


# ---------------------------------------------------------------------------
# Output formatting
# ---------------------------------------------------------------------------

def format_onboarding_report(report: OnboardingReport) -> str:
    """Format an :class:`OnboardingReport` as a human-readable terminal string.

    All file paths are displayed as repo-relative paths (not bare filenames).

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

    # Source entry points
    lines.append(f"\nEntry points detected: {len(report['entry_points'])}")
    for ep in report["entry_points"][:15]:
        lines.append(f"  {ep}")

    # Test entry points (separate section)
    tests = report.get("entry_points_tests", [])
    if tests:
        lines.append(f"\nTest entry points: {len(tests)}")
        for ep in tests[:5]:
            lines.append(f"  {ep}")
        if len(tests) > 5:
            lines.append(f"  ... and {len(tests) - 5} more")

    # Example entry points (separate section)
    examples = report.get("entry_points_examples", [])
    if examples:
        lines.append(f"\nExample entry points: {len(examples)}")
        for ep in examples[:5]:
            lines.append(f"  {ep}")

    lines.append("\nMost critical modules (read these first):")
    for i, (name, score) in enumerate(report["critical_modules"], 1):
        lines.append(f"  {i:>2}.  {name:<40s} score: {score}")

    if report["dead_modules"]:
        lines.append("\nDead modules (possibly legacy):")
        for dm in report["dead_modules"][:10]:
            lines.append(f"  {dm}")
        lines.append(
            "\n  Note: CNI detects unused imports only. Files loaded at runtime\n"
            "  (Celery tasks, Sphinx configs, plugin systems) may appear\n"
            "  unused but are actually active."
        )

    lines.append(f"\nArchitecture summary:\n  {report['architecture_summary']}")

    return "\n".join(lines)
