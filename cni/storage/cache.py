"""
cni/storage/cache.py

Persistent cache for scanned file paths and dependency-graph edges.

Cache location: ``<repo_root>/.cni/cache.json``
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Optional


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _cache_path(repo_path: str) -> Path:
    """Return the absolute path to the cache file for *repo_path*."""
    from cni.utils.platform import get_cache_dir
    return get_cache_dir(repo_path) / "cache.json"


def _file_mtime(file_path: str) -> float:
    """Return the modification time of *file_path*, or ``-1`` if missing."""
    try:
        return os.path.getmtime(file_path)
    except OSError:
        return -1.0


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def save_cache(
    repo_path: str,
    file_paths: list[str],
    edges: list[tuple[str, str]],
) -> None:
    """Save scan results to ``<repo_root>/.cni/cache.json``.

    The cache stores:

    * **file_paths** — list of scanned source file paths.
    * **edges** — dependency graph edges as ``[source, target]`` pairs.
    * **mtimes** — mapping of each file path to its last-modified time.

    Args:
        repo_path:  Path to the repository root directory.
        file_paths: List of scanned file path strings.
        edges:      List of ``(source, target)`` edge tuples.
    """
    cache_file = _cache_path(repo_path)
    cache_file.parent.mkdir(parents=True, exist_ok=True)

    mtimes: dict[str, float] = {
        fp: _file_mtime(fp) for fp in file_paths
    }

    data = {
        "file_paths": file_paths,
        "edges": [list(e) for e in edges],
        "mtimes": mtimes,
    }
    cache_file.write_text(json.dumps(data, indent=2), encoding="utf-8", errors="replace")


def load_cache(
    repo_path: str,
) -> Optional[tuple[list[str], list[tuple[str, str]]]]:
    """Load cached scan results from ``<repo_root>/.cni/cache.json``.

    Args:
        repo_path: Path to the repository root directory.

    Returns:
        A tuple of ``(file_paths, edges)`` if the cache file exists and
        is valid JSON, or ``None`` otherwise.
    """
    cache_file = _cache_path(repo_path)

    if not cache_file.exists():
        return None

    try:
        data = json.loads(cache_file.read_text(encoding="utf-8", errors="replace"))
    except (json.JSONDecodeError, OSError):
        return None

    file_paths: list[str] = data.get("file_paths", [])
    raw_edges: list[list[str]] = data.get("edges", [])
    edges: list[tuple[str, str]] = [
        (e[0], e[1]) for e in raw_edges if len(e) == 2
    ]

    return file_paths, edges


def is_cache_valid(
    repo_path: str,
    file_paths: list[str],
) -> bool:
    """Check whether the cache is still valid for the given file list.

    Validation logic:

    1. Load stored modification timestamps from ``cache.json``.
    2. Compare against the current ``mtime`` of each file on disk.
    3. If any file is missing or its mtime has changed, return ``False``.
    4. If the set of files has changed (added / removed), return ``False``.
    5. Otherwise return ``True``.

    Args:
        repo_path:  Path to the repository root directory.
        file_paths: Current list of scanned file path strings to validate
                    against the cache.

    Returns:
        ``True`` if all cached mtimes match current disk state.
    """
    cache_file = _cache_path(repo_path)

    if not cache_file.exists():
        return False

    try:
        data = json.loads(cache_file.read_text(encoding="utf-8", errors="replace"))
    except (json.JSONDecodeError, OSError):
        return False

    cached_mtimes: dict[str, float] = data.get("mtimes", {})

    # Quick check: same set of files?
    if set(cached_mtimes.keys()) != set(file_paths):
        return False

    # Detailed check: every file's mtime still matches
    for fp in file_paths:
        current_mtime = _file_mtime(fp)
        if current_mtime < 0:
            return False  # file is missing on disk
        cached = cached_mtimes.get(fp)
        if cached is None or abs(current_mtime - cached) > 0.001:
            return False

    return True
