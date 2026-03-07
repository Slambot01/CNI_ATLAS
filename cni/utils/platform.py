"""
cni/utils/platform.py

Cross-platform helpers for path normalisation, cache directories, and
OS detection.
"""

from __future__ import annotations

import sys
from pathlib import Path


def get_platform() -> str:
    """Detect the current operating system.

    Returns:
        ``'windows'``, ``'macos'``, or ``'linux'``.
    """
    if sys.platform.startswith("win"):
        return "windows"
    if sys.platform == "darwin":
        return "macos"
    return "linux"


def get_cache_dir(repo_path: str) -> Path:
    """Return the ``.cni`` cache directory path for a given repo.

    Uses :class:`pathlib.Path` to ensure correct separators on all
    platforms.

    Args:
        repo_path: Root path of the repository being analysed.

    Returns:
        Absolute :class:`~pathlib.Path` to the ``.cni/`` directory.
    """
    return Path(repo_path).resolve() / ".cni"


def normalize_path(path: str) -> str:
    """Normalise a file-path string to use forward slashes.

    On Windows converts backslashes to ``/`` so that graph node keys
    are consistent regardless of OS.

    Args:
        path: Raw file-path string.

    Returns:
        Path string with forward slashes.
    """
    return str(Path(path)).replace("\\", "/")
