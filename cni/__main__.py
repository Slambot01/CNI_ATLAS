"""
cni/__main__.py

Entry point that allows CNI to be invoked as a Python module:

    python -m cni <command> [args]

This file simply imports the Typer ``app`` object from :mod:`cni.cli.main`
and calls it so that all Typer command routing is handled in one place.
"""

from cni.cli.main import app

if __name__ == "__main__":
    app()
