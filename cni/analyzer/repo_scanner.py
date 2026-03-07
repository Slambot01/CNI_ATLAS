"""
cni/analyzer/repo_scanner.py

Recursively scan a repository for supported source files and extract
import statements from Python modules.
"""

from __future__ import annotations

import ast
import os
import sys
from pathlib import Path

# Directories to skip during recursive scanning
_IGNORE_DIRS: set[str] = {".git", "node_modules", "__pycache__", ".cni"}

# Maximum file size to process (1 MB)
_MAX_FILE_BYTES: int = 1_048_576


def _warn(message: str) -> None:
    """Print a yellow warning to stderr."""
    sys.stderr.write(f"\033[33m⚠  {message}\033[0m\n")


def scan_repository(path: str) -> list[str]:
    """Recursively scan *path* for Python, JavaScript, and TypeScript files.

    Edge cases handled:
      - Symlinks are skipped to prevent infinite loops.
      - Permission errors are caught and warned.

    Args:
        path: Absolute or relative path to the repository root.

    Returns:
        List of absolute file path strings for every discovered source file.
    """
    file_paths: list[str] = []

    for root, dirs, files in os.walk(path, followlinks=False):
        dirs[:] = [d for d in dirs if d not in _IGNORE_DIRS]

        # Skip symlinked directories
        dirs[:] = [
            d for d in dirs
            if not Path(os.path.join(root, d)).is_symlink()
        ]

        for file in files:
            if not file.endswith((".py", ".js", ".ts", ".jsx", ".tsx")):
                continue

            full_path = os.path.join(root, file)
            p = Path(full_path)

            # Skip symlinked files
            if p.is_symlink():
                continue

            # Skip files we can't access
            try:
                stat = p.stat()
            except OSError as exc:
                _warn(f"Skipping inaccessible file: {file} ({exc})")
                continue

            # Skip huge files (> 1 MB)
            if stat.st_size > _MAX_FILE_BYTES:
                size_mb = stat.st_size / 1_048_576
                _warn(f"Skipping large file: {file} (size: {size_mb:.1f}MB)")
                continue

            file_paths.append(full_path)

    return file_paths


def _safe_read(file_path: str) -> str | None:
    """Read a file safely, handling binary / permission / empty edge cases.

    Returns:
        File content as a string, or ``None`` if the file cannot be read.
    """
    p = Path(file_path)
    try:
        content = p.read_text(encoding="utf-8", errors="replace")
        return content
    except UnicodeDecodeError:
        _warn(f"Skipping binary file: {p.name}")
        return None
    except OSError as exc:
        _warn(f"Cannot read {p.name}: {exc}")
        return None


def extract_imports(file_path: str) -> list[str]:
    """Extract all import statements from a Python file.

    Edge cases handled:
      - Binary files → UnicodeDecodeError caught, returns [].
      - Permission errors → OSError caught, returns [].
      - Empty files / syntax errors → returns [].

    Args:
        file_path: Absolute or relative path to a ``.py`` file.

    Returns:
        List of imported module name strings.
    """
    content = _safe_read(file_path)
    if content is None:
        return []

    # Empty files
    if not content.strip():
        return []

    try:
        tree = ast.parse(content)
    except SyntaxError:
        return []

    imports: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                imports.append(alias.name)
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                imports.append(node.module)

    return imports


# ---------------------------------------------------------------------------
# Function/Class extraction (Problem 6 — function-level indexing)
# ---------------------------------------------------------------------------

def extract_functions(file_path: str) -> list[dict]:
    """Extract individual functions and classes from a Python file.

    Uses the Python AST to locate top-level and nested ``def`` and
    ``class`` statements.  Each extracted unit contains the source code,
    line range, and docstring.

    Edge cases handled:
      - Non-Python files → returns [].
      - Binary / unreadable files → returns [].
      - Empty files / syntax errors → returns [].

    Args:
        file_path: Absolute or relative path to a ``.py`` file.

    Returns:
        List of dicts with keys: ``name``, ``file_path``, ``line_start``,
        ``line_end``, ``source``, ``docstring``.  Returns an empty list
        for non-Python files or if parsing fails.
    """
    path = Path(file_path)
    if path.suffix != ".py":
        return []

    content = _safe_read(file_path)
    if content is None or not content.strip():
        return []

    try:
        tree = ast.parse(content)
    except SyntaxError:
        return []

    source_lines = content.splitlines()
    units: list[dict] = []

    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            continue

        line_start: int = node.lineno
        line_end: int = node.end_lineno or node.lineno

        # Extract source lines (1-indexed to 0-indexed)
        snippet = "\n".join(source_lines[line_start - 1 : line_end])

        docstring = ast.get_docstring(node) or ""

        units.append({
            "name": node.name,
            "file_path": str(path.resolve()),
            "line_start": line_start,
            "line_end": line_end,
            "source": snippet,
            "docstring": docstring,
        })

    return units