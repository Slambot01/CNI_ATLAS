"""
cni/server/state.py

Singleton in-memory state manager for the currently analyzed repository.

Holds the scanned file paths, built dependency graph, and computed stats
so that API routes never need to rescan from scratch.  Integrates with
the persistent disk cache in :mod:`cni.storage.cache` for fast restarts.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

import networkx as nx

from cni.analyzer.repo_scanner import scan_repository
from cni.graph.graph_builder import build_dependency_graph, get_graph_stats
from cni.storage.cache import load_cache, save_cache, is_cache_valid
from cni.storage.history import save_analysis
from cni.utils.errors import success, warning


class RepoStateError(Exception):
    """Raised when a route accesses state before analysis has run."""


class RepoState:
    """Singleton that caches the current repository's analysis in memory.

    Lifecycle:
        1. ``analyze(repo_path)`` — scan (or load from cache), build graph,
           store everything in instance attributes.
        2. ``get_graph()`` / ``get_file_paths()`` / ``get_repo_path()`` —
           return cached data instantly; raise :class:`RepoStateError` if
           ``analyze`` has not been called yet.

    Cache hierarchy (fastest → slowest):
        - In-memory instance attributes  (same process, ~0 ms)
        - Disk cache via ``cni/storage/cache.py``  (~50 ms)
        - Full rescan + graph build  (5-10 s on large repos)
    """

    def __init__(self) -> None:
        """Initialise with empty state."""
        self._repo_path: Optional[str] = None
        self._file_paths: Optional[list[str]] = None
        self._graph: Optional[nx.DiGraph] = None
        self._stats: Optional[dict] = None
        self._onboard_report: Optional[dict] = None
        self._semantic_index = None  # SemanticIndex from retrieval module

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def analyze(self, repo_path: str) -> dict:
        """Scan a repository (or serve from cache) and store results.

        Decision tree:
            1. Same repo already in memory AND files unchanged → return stats.
            2. Disk cache exists and is valid → rebuild graph from cached
               edges (skips the expensive import-extraction pass).
            3. Otherwise → full scan + graph build + persist to disk.

        Args:
            repo_path: Absolute or relative path to the repository root.

        Returns:
            Stats dict with keys ``files``, ``dependencies``,
            ``isolated``, ``most_imported``.
        """
        resolved = str(Path(repo_path).resolve())

        # ── Fast path: same repo, nothing changed on disk ──
        if self._repo_path == resolved and self._file_paths is not None:
            if is_cache_valid(resolved, self._file_paths):
                success("Using in-memory cache (no files changed)")
                self._persist_analysis(resolved)
                return self._stats  # type: ignore[return-value]

        # ── Medium path: disk cache is still valid ──
        file_paths = scan_repository(resolved)
        if is_cache_valid(resolved, file_paths):
            cached = load_cache(resolved)
            if cached is not None:
                cached_paths, cached_edges = cached
                graph = self._rebuild_graph_from_edges(cached_paths, cached_edges)
                self._store(resolved, cached_paths, graph)
                success("Loaded from disk cache")
                self._persist_analysis(resolved)
                return self._stats  # type: ignore[return-value]

        # ── Slow path: full scan + build ──
        graph = build_dependency_graph(file_paths)
        edges: list[tuple[str, str]] = list(graph.edges())
        save_cache(resolved, file_paths, edges)
        self._store(resolved, file_paths, graph)
        success("Full scan complete — cached to memory + disk")
        self._persist_analysis(resolved)
        return self._stats  # type: ignore[return-value]

    def get_graph(self) -> nx.DiGraph:
        """Return the cached dependency graph.

        Raises:
            RepoStateError: If no repo has been analyzed yet.
        """
        if self._graph is None:
            raise RepoStateError(
                "No repo analyzed yet. Send POST /api/analyze first."
            )
        return self._graph

    def get_file_paths(self) -> list[str]:
        """Return the cached list of scanned file paths.

        Raises:
            RepoStateError: If no repo has been analyzed yet.
        """
        if self._file_paths is None:
            raise RepoStateError(
                "No repo analyzed yet. Send POST /api/analyze first."
            )
        return self._file_paths

    def get_repo_path(self) -> str:
        """Return the path to the currently analyzed repository.

        Raises:
            RepoStateError: If no repo has been analyzed yet.
        """
        if self._repo_path is None:
            raise RepoStateError(
                "No repo analyzed yet. Send POST /api/analyze first."
            )
        return self._repo_path

    def get_stats(self) -> dict:
        """Return the cached graph stats.

        Raises:
            RepoStateError: If no repo has been analyzed yet.
        """
        if self._stats is None:
            raise RepoStateError(
                "No repo analyzed yet. Send POST /api/analyze first."
            )
        return self._stats

    def is_analyzed(self) -> bool:
        """Return ``True`` if a repo has been analyzed and is in memory."""
        return self._graph is not None

    def get_onboard_report(self) -> Optional[dict]:
        """Return the cached onboarding report, or ``None`` if not yet generated."""
        return self._onboard_report

    def cache_onboard_report(self, report: dict) -> None:
        """Store an onboarding report in memory for follow-up chat context.

        Args:
            report: The onboarding report dict with keys
                    ``entry_points``, ``critical_modules``,
                    ``dead_modules``, ``architecture_summary``.
        """
        self._onboard_report = report

    def get_semantic_index(self):
        """Return the cached semantic index, building it if necessary.

        Uses :func:`cni.retrieval.semantic_search.build_index` on the
        first call, then caches the resulting :class:`SemanticIndex` in
        memory for fast repeated queries.

        Returns:
            The module-level :class:`SemanticIndex` singleton.

        Raises:
            RepoStateError: If no repo has been analyzed yet.
            RuntimeError:   If the index cannot be built.
        """
        if self._file_paths is None:
            raise RepoStateError(
                "No repo analyzed yet. Send POST /api/analyze first."
            )

        if self._semantic_index is not None:
            return self._semantic_index

        from cni.retrieval.semantic_search import build_index, _index as module_index

        # Build the index (populates the module-level _index singleton)
        build_index(self._file_paths)

        from cni.retrieval import semantic_search
        self._semantic_index = semantic_search._index
        return self._semantic_index

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _store(
        self,
        repo_path: str,
        file_paths: list[str],
        graph: nx.DiGraph,
    ) -> None:
        """Populate all instance caches at once.

        Args:
            repo_path:  Resolved repo root path string.
            file_paths: Scanned file list.
            graph:      Built dependency graph.
        """
        self._repo_path = repo_path
        self._file_paths = file_paths
        self._graph = graph
        self._stats = get_graph_stats(graph)
        self._onboard_report = None  # invalidate on new repo
        self._semantic_index = None  # invalidate on new repo

    def _persist_analysis(self, repo_path: str) -> None:
        """Save a snapshot of the current analysis to the history database.

        Computes the health score on-the-fly so it is recorded alongside
        file and dependency counts.  Fail-safe: errors are logged but
        never propagated.
        """
        if self._stats is None or self._graph is None:
            return
        try:
            from cni.analysis.health import compute_health

            health_score = 0.0
            try:
                report = compute_health(self._graph)
                health_score = report.get("health_score", 0.0)
            except Exception:  # noqa: BLE001
                pass

            save_analysis(
                repo_path=repo_path,
                files_count=self._stats.get("files", 0),
                dependencies_count=self._stats.get("dependencies", 0),
                health_score=health_score,
            )
        except Exception:  # noqa: BLE001
            pass  # history module already logs internally

    @staticmethod
    def _rebuild_graph_from_edges(
        file_paths: list[str],
        edges: list[tuple[str, str]],
    ) -> nx.DiGraph:
        """Reconstruct an ``nx.DiGraph`` from cached paths and edges.

        This is much faster than :func:`build_dependency_graph` because
        it skips file I/O and import extraction entirely.

        Edges are deduplicated (one edge per source→target pair) and
        ``indegree`` / ``outdegree`` node attributes are set from the
        final graph state to stay consistent with the live builder.

        Args:
            file_paths: Node list (absolute file path strings).
            edges:      Edge list as ``(source, target)`` tuples.

        Returns:
            Directed graph with the same structure as a freshly built one.
        """
        graph = nx.DiGraph()
        for fp in file_paths:
            p = Path(fp)
            graph.add_node(
                fp,
                language=p.suffix.lstrip("."),
                filename=p.name,
            )
        for src, tgt in edges:
            if src in graph and tgt in graph:
                # Deduplicate: one edge per (source, target) pair
                if not graph.has_edge(src, tgt):
                    graph.add_edge(src, tgt)

        # Set degree attributes from final graph state
        for node in graph.nodes:
            graph.nodes[node]["indegree"] = graph.in_degree(node)
            graph.nodes[node]["outdegree"] = graph.out_degree(node)

        return graph


# Global singleton — import this in route modules.
repo_state = RepoState()
