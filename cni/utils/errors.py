"""
cni/utils/errors.py

Centralised formatting utilities for error, success, and warning messages.
Every module should import from here instead of rolling its own coloring.
"""

from __future__ import annotations

import sys

import typer


def error(message: str, hint: str = "") -> None:
    """Print a formatted red error message with optional hint.

    Args:
        message: Primary error description.
        hint:    Optional follow-up line (e.g. fix instructions).
    """
    typer.echo(typer.style(f"✗  {message}", fg=typer.colors.RED), err=True)
    if hint:
        typer.echo(f"   {hint}", err=True)


def success(message: str) -> None:
    """Print a formatted green success message.

    Args:
        message: Description of what succeeded.
    """
    typer.echo(typer.style(f"✓  {message}", fg=typer.colors.GREEN))


def warning(message: str) -> None:
    """Print a formatted yellow warning message.

    Args:
        message: Warning text.
    """
    typer.echo(typer.style(f"⚠  {message}", fg=typer.colors.YELLOW), err=True)


def abort(message: str, hint: str = "") -> None:
    """Print a formatted error then exit with code 1.

    Args:
        message: Primary error description.
        hint:    Optional follow-up line.
    """
    error(message, hint)
    raise typer.Exit(code=1)
