"""
graph/graph_builder.py

Builds a dependency graph from a repository's file paths.
Supports Python (.py) and JavaScript/TypeScript (.js, .ts, .jsx, .tsx).
"""

from __future__ import annotations

import ast
import os
import re
from pathlib import Path

import networkx as nx


# ---------------------------------------------------------------------------
# Language support config — easy to extend later
# ---------------------------------------------------------------------------

SUPPORTED_EXTENSIONS: set[str] = {".py", ".js", ".ts", ".jsx", ".tsx"}


# ---------------------------------------------------------------------------
# Import extraction
# ---------------------------------------------------------------------------

def _extract_python_imports(file_path: Path) -> list[str]:
    """
    Parse a Python file with the built-in AST and return a list of
    raw module names that are imported.
    Falls back to an empty list on syntax errors.
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
    Extract import/require paths from JS/TS files using regex.
    Returns raw specifiers as written in source (e.g. './utils/auth').
    """
    try:
        source = file_path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return []

    return _JS_IMPORT_RE.findall(source)


def extract_imports(file_path: Path) -> list[str]:
    """Dispatch to the correct extractor based on file extension."""
    ext = file_path.suffix.lower()
    if ext == ".py":
        return _extract_python_imports(file_path)
    if ext in {".js", ".ts", ".jsx", ".tsx"}:
        return _extract_js_imports(file_path)
    return []


# ---------------------------------------------------------------------------
# Import → file-path resolution
# ---------------------------------------------------------------------------

def _build_lookup(file_paths: list[Path]) -> dict[str, Path]:
    """
    Build a mapping from every reasonable lookup key to an absolute Path.

    Keys stored for each file:
      • absolute path string
      • path relative to each parent (for package-style lookups)
      • dot-notation module name  (e.g. 'utils.auth')
    """
    lookup: dict[str, Path] = {}

    for fp in file_paths:
        fp = fp.resolve()
        lookup[str(fp)] = fp

        # Walk up directory tree and register relative sub-paths
        parts = fp.parts
        for start in range(len(parts)):
            rel = "/".join(parts[start:])
            # Without extension
            rel_no_ext = "/".join(parts[start:])
            stem_parts = list(parts[start:])
            stem_parts[-1] = fp.stem          # drop extension from last part
            dot_key = ".".join(stem_parts)    # dot-notation
            slash_key = "/".join(stem_parts)  # slash without extension

            lookup.setdefault(rel, fp)
            lookup.setdefault(slash_key, fp)
            lookup.setdefault(dot_key, fp)

    return lookup


def _resolve_python_import(
    module: str,
    source_file: Path,
    lookup: dict[str, Path],
) -> Path | None:
    """
    Try to map a Python import string to a file in the repository.

    Strategy (in order):
      1. Relative imports  → resolve against source_file's directory
      2. Absolute imports  → try dot → slash conversion across lookup
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
            if key in lookup:
                return lookup[key]
        return None

    # Absolute import
    slash_key = module.replace(".", "/")
    for candidate in (slash_key, slash_key + "/__init__"):
        if candidate in lookup:
            return lookup[candidate]

    # Try dot-notation key directly
    if module in lookup:
        return lookup[module]

    return None


def _resolve_js_import(
    specifier: str,
    source_file: Path,
    lookup: dict[str, Path],
) -> Path | None:
    """
    Resolve a JS/TS import specifier to a file.
    Only resolves relative imports (starting with ./ or ../).
    Bare module specifiers (npm packages) are ignored.
    """
    if not specifier.startswith("."):
        return None  # third-party package — skip

    base = source_file.parent
    candidate = (base / specifier).resolve()

    # Try exact path, then with each supported extension
    if str(candidate) in lookup:
        return lookup[str(candidate)]

    for ext in (".js", ".ts", ".jsx", ".tsx", "/index.js", "/index.ts"):
        key = str(candidate) + ext
        if key in lookup:
            return lookup[key]

    return None


def resolve_import(
    raw_import: str,
    source_file: Path,
    lookup: dict[str, Path],
) -> Path | None:
    """Unified resolver — dispatches by source file extension."""
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
        return nx.DiGraph()

    lookup = _build_lookup(paths)
    graph = nx.DiGraph()

    # Add every file as a node (even if it imports nothing)
    for fp in paths:
        graph.add_node(
            str(fp),
            language=fp.suffix.lstrip("."),
            filename=fp.name,
        )

    # Add edges for every resolvable import
    for fp in paths:
        for raw_imp in extract_imports(fp):
            target = resolve_import(raw_imp, fp, lookup)
            if target is not None and str(target) != str(fp):
                graph.add_edge(str(fp), str(target), label=raw_imp)

    return graph


# ---------------------------------------------------------------------------
# Graph statistics  (used by `cni stats`)
# ---------------------------------------------------------------------------

def get_graph_stats(graph: nx.DiGraph) -> dict[str, int]:
    """
    Return a dictionary of graph statistics.

    Keys:
        files        — total nodes
        dependencies — total edges
        isolated     — files with no imports and not imported by anyone
        most_imported — in-degree of the most-depended-upon file
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
    """Pretty-print graph statistics to stdout (for `cni stats`)."""
    stats = get_graph_stats(graph)
    print("Repository statistics")
    print("-" * 30)
    print(f"  Files indexed     : {stats['files']}")
    print(f"  Dependencies      : {stats['dependencies']}")
    print(f"  Isolated files    : {stats['isolated']}")
    print(f"  Most imported     : {stats['most_imported']} dependents")


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