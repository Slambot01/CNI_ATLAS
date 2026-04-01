"""
cni/graph/graph_builder.py

Builds and queries directed dependency graphs from repository source files.

This module is the heart of CNI's static analysis engine.  Given a list of
file paths it:

1. Reads every file and extracts its import statements (Python via AST,
   JS/TS via regex).
2. Resolves each import string to an absolute path inside the repo, building
   a lookup table that handles relative imports, dot-notation, and
   index-file conventions.
3. Constructs a :class:`networkx.DiGraph` where nodes are absolute file
   paths and edges represent ``(importer, importee)`` relationships.
4. Optionally merges multiple per-repo graphs into a unified cross-repo
   graph for ``cni connect``.

Supports Python (``.py``), JavaScript (``.js``), TypeScript (``.ts``),
JSX (``.jsx``), and TSX (``.tsx``).
"""

from __future__ import annotations

import ast
import os
import re
from pathlib import Path
from typing import Optional

import networkx as nx

from cni.utils.errors import warning



# ---------------------------------------------------------------------------
# Language support config — easy to extend later
# ---------------------------------------------------------------------------

SUPPORTED_EXTENSIONS: set[str] = {".py", ".js", ".ts", ".jsx", ".tsx"}

# Directories that contain test fixtures and should be deprioritized
# during import resolution.
_TEST_DIRS: set[str] = {
    "tests", "test", "spec", "__tests__",
    "fixtures", "test_apps", "testdata",
    "testing", "e2e",
}


# ---------------------------------------------------------------------------
# Import extraction
# ---------------------------------------------------------------------------

def _extract_python_imports(file_path: Path) -> list[str]:
    """
    Parse a Python file with the built-in AST and return imported module names.

    Falls back to an empty list on syntax errors.

    Args:
        file_path: Absolute path to a ``.py`` file.

    Returns:
        List of raw module name strings as written in the source
        (e.g. ``'os'``, ``'cni.utils.errors'``, ``'.relative_module'``).
    """
    try:
        source = file_path.read_text(encoding="utf-8", errors="replace")
        tree = ast.parse(source, filename=str(file_path))
    except SyntaxError:
        return []

    modules: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                modules.append(alias.name)
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                # Reconstruct the fully qualified name including leading dots
                dots = "." * (node.level or 0)
                modules.append(f"{dots}{node.module}")
    return modules


# Matches:  import X / import X as Y / import { X } from 'Y'  /  require('Y')
_JS_IMPORT_RE = re.compile(
    r"""
    (?:
        import\s+(?:[\w*{}\s,]+\s+from\s+)?   # import … from
        |require\s*\(\s*                         # require(
    )
    ['"]([^'"]+)['"]                             # the module path
    """,
    re.VERBOSE,
)


def _extract_js_imports(file_path: Path) -> list[str]:
    """
    Extract import/require specifiers from JS/TS files using regex.

    Matches ES module ``import`` statements and CommonJS ``require()`` calls.
    Returns raw specifiers as written in source (e.g. ``'./utils/auth'``).

    Args:
        file_path: Absolute path to a ``.js``, ``.ts``, ``.jsx``, or
                   ``.tsx`` file.

    Returns:
        List of raw import specifier strings.
    """
    try:
        source = file_path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return []

    return _JS_IMPORT_RE.findall(source)


def extract_imports(file_path: Path) -> list[str]:
    """Dispatch to the correct import extractor based on file extension.

    Args:
        file_path: Path to any supported source file.

    Returns:
        List of raw import strings for the file, or an empty list if the
        extension is not recognised.
    """
    ext = file_path.suffix.lower()
    if ext == ".py":
        return _extract_python_imports(file_path)
    if ext in {".js", ".ts", ".jsx", ".tsx"}:
        return _extract_js_imports(file_path)
    return []


# ---------------------------------------------------------------------------
# Import → file-path resolution
# ---------------------------------------------------------------------------

def _is_test_path(path: Path) -> bool:
    """Check whether *path* resides inside a test / fixture directory.

    Args:
        path: Absolute or relative :class:`~pathlib.Path`.

    Returns:
        ``True`` if any component of *path* is a known test directory name.
    """
    parts = set(path.parts)
    return bool(parts & _TEST_DIRS)


def _resolve_best_candidate(candidates: list[Path]) -> Optional[Path]:
    """Pick the best candidate from a list using priority rules.

    Resolution priority (applied in order, each step narrows the list):

    1. Prefer ``__init__.py`` packages over single-file modules.
    2. Deprioritize files inside test / fixture directories.
    3. Prefer files under a ``src/`` layout directory.

    Args:
        candidates: Non-empty list of candidate :class:`~pathlib.Path` objects.

    Returns:
        The best candidate, or ``None`` if the list is empty.
    """
    if not candidates:
        return None

    if len(candidates) == 1:
        return candidates[0]

    # Rule 1: prefer packages (__init__.py) over plain modules
    packages = [c for c in candidates if c.name == "__init__.py"]
    if packages:
        candidates = packages

    # Rule 2: deprioritize test directories
    non_test = [c for c in candidates if not _is_test_path(c)]
    if non_test:
        candidates = non_test

    # Rule 3: prefer src/ layout
    src_files = [
        c for c in candidates
        if "/src/" in str(c).replace("\\", "/")
    ]
    if src_files:
        candidates = src_files

    return candidates[0] if candidates else None


def _build_lookup(file_paths: list[Path]) -> dict[str, list[Path]]:
    """
    Build a mapping from every reasonable lookup key to a **list** of
    candidate :class:`~pathlib.Path` objects.

    Multiple files may share the same lookup key (e.g. ``flask`` matching
    both ``src/flask/__init__.py`` and ``tests/.../flask.py``).  Collecting
    all candidates lets the resolver apply priority rules later.

    Generates multiple keys per file so that import strings written in
    different styles (absolute path, relative slash, dot-notation) all
    resolve correctly:

    - Absolute path string
    - Path relative to each ancestor directory
    - Dot-notation module name  (e.g. ``'cni.utils.auth'``)
    - Slash-notation without extension (e.g. ``'cni/utils/auth'``)

    Args:
        file_paths: List of resolved :class:`~pathlib.Path` objects.

    Returns:
        Dict mapping lookup key strings to **lists** of
        :class:`~pathlib.Path` objects.
    """
    lookup: dict[str, list[Path]] = {}

    for fp in file_paths:
        fp = fp.resolve()
        lookup.setdefault(str(fp), []).append(fp)

        # Walk up directory tree and register relative sub-paths
        parts = fp.parts
        for start in range(len(parts)):
            rel = "/".join(parts[start:])
            stem_parts = list(parts[start:])
            stem_parts[-1] = fp.stem          # drop extension from last part
            dot_key = ".".join(stem_parts)    # dot-notation
            slash_key = "/".join(stem_parts)  # slash without extension

            lookup.setdefault(rel, []).append(fp)
            lookup.setdefault(slash_key, []).append(fp)
            lookup.setdefault(dot_key, []).append(fp)

    return lookup


def _lookup_best(
    key: str,
    lookup: dict[str, list[Path]],
) -> Optional[Path]:
    """Look up *key* in the multi-candidate lookup table and return the best.

    Args:
        key:    Lookup key string.
        lookup: Multi-candidate lookup table from :func:`_build_lookup`.

    Returns:
        Best matching :class:`~pathlib.Path`, or ``None``.
    """
    candidates = lookup.get(key)
    if not candidates:
        return None
    return _resolve_best_candidate(candidates)


def _resolve_python_import(
    module: str,
    source_file: Path,
    lookup: dict[str, list[Path]],
) -> Optional[Path]:
    """
    Try to map a Python import string to a file path in the repository.

    Resolution strategy (in order):

    1. **Relative imports** (leading dots) — resolved against the source
       file's directory, walking up one level per extra dot.
    2. **Absolute imports** — dot-to-slash conversion tried first, then
       direct dot-key lookup.

    When multiple candidates exist for a key, priority rules from
    :func:`_resolve_best_candidate` are applied to select the best match.

    Args:
        module:      Raw import string (e.g. ``'cni.utils.errors'`` or
                     ``'.relative_mod'``).
        source_file: Path to the file that contains the import statement.
        lookup:      Lookup table built by :func:`_build_lookup`.

    Returns:
        Resolved :class:`~pathlib.Path` of the imported file, or ``None``
        if the import cannot be resolved to a repo-local file.
    """
    if module.startswith("."):
        # Relative import: count leading dots
        level = len(module) - len(module.lstrip("."))
        tail = module.lstrip(".")
        base = source_file.parent
        for _ in range(level - 1):
            base = base.parent

        candidate_parts = [base] + (tail.split(".") if tail else [])
        candidate = Path(*candidate_parts)

        # Try as a module file or package __init__
        for suffix in (".py", "/__init__.py"):
            key = str(candidate) + suffix
            result = _lookup_best(key, lookup)
            if result is not None:
                return result
        return None

    # Absolute import
    slash_key = module.replace(".", "/")
    for candidate in (slash_key, slash_key + "/__init__"):
        result = _lookup_best(candidate, lookup)
        if result is not None:
            return result

    # Try dot-notation key directly
    result = _lookup_best(module, lookup)
    if result is not None:
        return result

    return None


def _resolve_js_import(
    specifier: str,
    source_file: Path,
    lookup: dict[str, list[Path]],
) -> Optional[Path]:
    """
    Resolve a JS/TS import specifier to a file path in the repository.

    Only relative imports (starting with ``./`` or ``../``) are resolved.
    Bare module specifiers (npm packages such as ``'react'``) are ignored.

    Args:
        specifier:   Raw import specifier from the source file.
        source_file: Path to the file that contains the import statement.
        lookup:      Lookup table built by :func:`_build_lookup`.

    Returns:
        Resolved :class:`~pathlib.Path`, or ``None`` for third-party
        packages or specifiers that cannot be found in the repo.
    """
    if not specifier.startswith("."):
        return None  # third-party package — skip

    base = source_file.parent
    candidate = (base / specifier).resolve()

    # Try exact path, then with each supported extension
    result = _lookup_best(str(candidate), lookup)
    if result is not None:
        return result

    for ext in (".js", ".ts", ".jsx", ".tsx", "/index.js", "/index.ts"):
        key = str(candidate) + ext
        result = _lookup_best(key, lookup)
        if result is not None:
            return result

    return None


def resolve_import(
    raw_import: str,
    source_file: Path,
    lookup: dict[str, list[Path]],
) -> Optional[Path]:
    """Unified import resolver — dispatches by source file extension.

    Args:
        raw_import:  Raw import string extracted from the source file.
        source_file: Path to the file that contains the import.
        lookup:      Lookup table from :func:`_build_lookup`.

    Returns:
        Resolved :class:`~pathlib.Path` of the imported file, or ``None``
        if the import points to a third-party library or cannot be found.
    """
    ext = source_file.suffix.lower()
    if ext == ".py":
        return _resolve_python_import(raw_import, source_file, lookup)
    if ext in {".js", ".ts", ".jsx", ".tsx"}:
        return _resolve_js_import(raw_import, source_file, lookup)
    return None


# ---------------------------------------------------------------------------
# Graph construction
# ---------------------------------------------------------------------------

def build_dependency_graph(file_paths: list[str]) -> nx.DiGraph:
    """
    Build a directed dependency graph for the given repository files.

    Nodes  — absolute file path strings
    Edges  — (importer, importee)  directed dependency

    After graph construction, ``indegree`` and ``outdegree`` node attributes
    are computed from the **final** edge set to guarantee consistency:

    .. code-block:: text

        sum(indegrees) == sum(outdegrees) == number_of_edges

    Args:
        file_paths: List of file path strings (relative or absolute).

    Returns:
        nx.DiGraph with all resolved intra-repo dependencies.
    """
    # Normalise to Path objects, filter to supported extensions
    paths: list[Path] = [
        Path(p).resolve()
        for p in file_paths
        if Path(p).suffix.lower() in SUPPORTED_EXTENSIONS
    ]

    if not paths:
        print(
            "No supported source files found.\n"
            "CNI supports: .py .js .ts .jsx .tsx"
        )
        return nx.DiGraph()

    lookup = _build_lookup(paths)
    graph = nx.DiGraph()

    # Track all valid file path strings for Rule 4 (skip unresolvable)
    all_node_keys: set[str] = set()

    # Add every file as a node (skip deleted files)
    for fp in paths:
        if not fp.exists():
            warning(f"File deleted since scan: {fp.name} — skipping")
            continue
        key = str(fp)
        all_node_keys.add(key)
        graph.add_node(
            key,
            language=fp.suffix.lstrip("."),
            filename=fp.name,
        )

    # Add edges for every resolvable import (deduplicated per file pair)
    for fp in paths:
        if str(fp) not in graph:
            continue  # was deleted
        for raw_imp in extract_imports(fp):
            target = resolve_import(raw_imp, fp, lookup)
            if target is not None and str(target) != str(fp):
                # Rule 4: only add edge if target is a known node
                if str(target) in all_node_keys:
                    # Fix 1: deduplicate — one edge per (source, target) pair
                    # Multiple import styles (import x, from x import y)
                    # all collapse into a single dependency edge.
                    if not graph.has_edge(str(fp), str(target)):
                        graph.add_edge(str(fp), str(target), label=raw_imp)

    # Detect circular imports and warn (but do not crash)
    try:
        cycle = nx.find_cycle(graph, orientation="original")
        cycle_str = " → ".join(Path(edge[0]).name for edge in cycle)
        warning(f"Circular import detected: {cycle_str}")
    except nx.NetworkXNoCycle:
        pass

    # ------------------------------------------------------------------
    # Compute degree attributes from FINAL graph state (Bug 1 fix)
    # ------------------------------------------------------------------
    for node in graph.nodes:
        graph.nodes[node]["indegree"] = graph.in_degree(node)
        graph.nodes[node]["outdegree"] = graph.out_degree(node)

    # Integrity assertions — degrees must match edge count
    assert sum(d for _, d in graph.in_degree()) == graph.number_of_edges(), (
        f"Indegree sum {sum(d for _, d in graph.in_degree())} != "
        f"edge count {graph.number_of_edges()}"
    )
    assert sum(d for _, d in graph.out_degree()) == graph.number_of_edges(), (
        f"Outdegree sum {sum(d for _, d in graph.out_degree())} != "
        f"edge count {graph.number_of_edges()}"
    )

    return graph


def validate_graph(graph: nx.DiGraph) -> dict[str, object]:
    """Validate graph degree invariants.

    Computes the total edge count and compares it against the sums of
    in-degrees and out-degrees.  In a well-formed directed graph these
    three values must always be equal.

    Args:
        graph: Directed dependency graph to validate.

    Returns:
        Dict with keys:

        - ``valid``          — ``True`` when all invariants hold.
        - ``edge_count``     — Total number of edges.
        - ``indegree_sum``   — Sum of all node in-degrees.
        - ``outdegree_sum``  — Sum of all node out-degrees.
        - ``indegree_error`` — Difference ``indegree_sum - edge_count``.
        - ``outdegree_error``— Difference ``outdegree_sum - edge_count``.
    """
    total_edges: int = graph.number_of_edges()
    indegree_sum: int = sum(d for _, d in graph.in_degree())
    outdegree_sum: int = sum(d for _, d in graph.out_degree())

    return {
        "valid": (
            indegree_sum == total_edges
            and outdegree_sum == total_edges
        ),
        "edge_count": total_edges,
        "indegree_sum": indegree_sum,
        "outdegree_sum": outdegree_sum,
        "indegree_error": indegree_sum - total_edges,
        "outdegree_error": outdegree_sum - total_edges,
    }


# ---------------------------------------------------------------------------
# Graph statistics  (used by `cni stats`)
# ---------------------------------------------------------------------------

def get_graph_stats(graph: nx.DiGraph) -> dict[str, int]:
    """
    Return a dictionary of summary statistics for a dependency graph.

    Args:
        graph: Directed dependency graph.

    Returns:
        Dict with keys:

        - ``files`` — total number of nodes.
        - ``dependencies`` — total number of edges.
        - ``isolated`` — count of files with in-degree = 0 AND out-degree = 0.
        - ``most_imported`` — highest in-degree across all nodes.

    Example:
        >>> stats = get_graph_stats(graph)
        >>> stats['files']
        26
    """
    if graph.number_of_nodes() == 0:
        return {
            "files": 0,
            "dependencies": 0,
            "isolated": 0,
            "most_imported": 0,
        }

    in_degrees = dict(graph.in_degree())
    return {
        "files": graph.number_of_nodes(),
        "dependencies": graph.number_of_edges(),
        "isolated": sum(
            1
            for n in graph.nodes
            if graph.in_degree(n) == 0 and graph.out_degree(n) == 0
        ),
        "most_imported": max(in_degrees.values(), default=0),
    }


def print_graph_stats(graph: nx.DiGraph) -> None:
    """Pretty-print dependency graph statistics to stdout.

    Args:
        graph: Directed dependency graph to summarise.

    Example output::

        Repository statistics
        ------------------------------
          Files indexed     : 26
          Dependencies      : 27
          Isolated files    : 9
          Most imported     : 6 dependents
    """
    stats = get_graph_stats(graph)
    print("Repository statistics")
    print("-" * 30)
    print(f"  Files indexed     : {stats['files']}")
    print(f"  Dependencies      : {stats['dependencies']}")
    print(f"  Isolated files    : {stats['isolated']}")
    print(f"  Most imported     : {stats['most_imported']} dependents")

# ---------------------------------------------------------------------------
# Multi-repo graph merging
# ---------------------------------------------------------------------------

def merge_graphs(
    repo_graphs: list[tuple[str, nx.DiGraph]],
) -> tuple[nx.DiGraph, list[tuple[str, str]]]:
    """Merge multiple repo graphs into a unified cross-repo graph.

    Each repo's nodes are prefixed with the repo name to avoid collisions.
    Cross-service connections are detected by matching shared module names
    and API client import patterns.

    Args:
        repo_graphs: List of ``(repo_name, graph)`` tuples.

    Returns:
        Tuple of ``(unified_graph, cross_connections)`` where
        cross_connections is a list of ``(source_node, target_node)`` pairs.
    """
    from cni.utils.platform import normalize_path

    unified = nx.DiGraph()

    # Pass 1: Add all nodes and edges with repo-prefixed names
    node_map: dict[str, str] = {}
    for repo_name, graph in repo_graphs:
        for node in graph.nodes:
            prefixed = normalize_path(str(Path(repo_name) / Path(node).name))
            node_map[node] = prefixed
            unified.add_node(prefixed, repo=repo_name, original_path=node)

        for u, v, data in graph.edges(data=True):
            unified.add_edge(node_map[u], node_map[v], **data)

    # Pass 2: Detect cross-service connections
    cross_connections = _detect_cross_service(repo_graphs, unified)

    return unified, cross_connections


def _detect_cross_service(
    repo_graphs: list[tuple[str, nx.DiGraph]],
    unified: nx.DiGraph,
) -> list[tuple[str, str]]:
    """Detect edges that cross repository boundaries in a unified graph.

    Two detection strategies are applied:

    1. **Shared module names** — if two files from different repos have the
       same stem name, they likely represent the same logical component and
       a cross-service edge is added.
    2. **API client pattern** — files named ``*_client.py`` or containing
       ``'client'`` are linked to same-named service files in other repos.

    Args:
        repo_graphs: Original list of ``(repo_name, graph)`` tuples.
        unified:     The merged graph built in :func:`merge_graphs`.  This
                     function both queries and mutates it.

    Returns:
        List of ``(source_node, target_node)`` cross-repo edge tuples.
    """
    from cni.utils.platform import normalize_path
    
    connections: list[tuple[str, str]] = []

    # module_name -> list of prefixed nodes
    name_to_nodes: dict[str, list[str]] = {}
    for node in unified.nodes:
        base_name = Path(node).stem
        name_to_nodes.setdefault(base_name, []).append(node)

    # Strategy 1: shared module names
    for nodes in name_to_nodes.values():
        repos_seen: set[str] = set()
        for node in nodes:
            repos_seen.add(unified.nodes[node].get("repo", ""))
        if len(repos_seen) > 1:
            for i, n1 in enumerate(nodes):
                for n2 in nodes[i + 1:]:
                    r1 = unified.nodes[n1].get("repo", "")
                    r2 = unified.nodes[n2].get("repo", "")
                    if r1 != r2 and not unified.has_edge(n1, n2):
                        unified.add_edge(n1, n2, label="shared_module")
                        connections.append((n1, n2))

    # Strategy 2: client pattern
    for node in list(unified.nodes):
        name = Path(node).stem
        if name.endswith("_client") or "client" in name.lower():
            service_name = name.replace("_client", "").replace("client", "")
            if service_name and service_name in name_to_nodes:
                for target in name_to_nodes[service_name]:
                    src_repo = unified.nodes[node].get("repo", "")
                    tgt_repo = unified.nodes[target].get("repo", "")
                    if src_repo != tgt_repo and not unified.has_edge(node, target):
                        unified.add_edge(node, target, label="api_client")
                        connections.append((node, target))

    return connections


# ---------------------------------------------------------------------------
# Quick smoke-test
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import sys

    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
    all_files = [
        str(p)
        for p in root.rglob("*")
        if p.suffix.lower() in SUPPORTED_EXTENSIONS
    ]
    g = build_dependency_graph(all_files)
    print_graph_stats(g)