"""
cni/analyzer/repo_scanner.py

Recursively scan a repository for supported source files and extract
import statements from Python modules.
"""

from __future__ import annotations

import ast
import os
from pathlib import Path

# Directories to skip during recursive scanning
_IGNORE_DIRS: set[str] = {".git", "node_modules", "__pycache__", ".cni"}


def scan_repository(path: str) -> list[str]:
    """Recursively scan *path* for Python, JavaScript, and TypeScript files.

    Args:
        path: Absolute or relative path to the repository root.

    Returns:
        List of absolute file path strings for every discovered source file.
    """
    file_paths: list[str] = []

    for root, dirs, files in os.walk(path):
        dirs[:] = [d for d in dirs if d not in _IGNORE_DIRS]
        for file in files:
            if file.endswith((".py", ".js", ".ts", ".jsx", ".tsx")):
                file_paths.append(os.path.join(root, file))

    return file_paths


def extract_imports(file_path: str) -> list[str]:
    """Extract all import statements from a Python file.

    Args:
        file_path: Absolute or relative path to a ``.py`` file.

    Returns:
        List of imported module name strings.
    """
    source = Path(file_path).read_text(encoding="utf-8", errors="replace")
    tree = ast.parse(source)

    imports: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                imports.append(alias.name)
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                imports.append(node.module)

    return imports