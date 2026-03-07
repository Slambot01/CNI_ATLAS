"""
tests/conftest.py

Shared pytest fixtures for the CNI test suite.
"""

from __future__ import annotations

from pathlib import Path

import networkx as nx
import pytest


# ---------------------------------------------------------------------------
# Fixture: sample_repo
# ---------------------------------------------------------------------------

_SAMPLE_FILES: dict[str, str] = {
    "main.py": (
        "from auth import login\n"
        "from database import get_connection\n"
        "\n"
        "def main():\n"
        "    login()\n"
        "    get_connection()\n"
    ),
    "auth.py": (
        "from database import get_connection\n"
        "from utils import hash_password\n"
        "\n"
        "def login():\n"
        "    pass\n"
        "\n"
        "def logout():\n"
        "    pass\n"
    ),
    "database.py": (
        "from utils import load_env\n"
        "\n"
        "def get_connection():\n"
        "    pass\n"
        "\n"
        "def run_query(sql):\n"
        "    pass\n"
    ),
    "utils.py": (
        "def hash_password(pw):\n"
        "    return pw\n"
        "\n"
        "def load_env():\n"
        "    pass\n"
    ),
    "config.py": (
        "DATABASE_URL = 'sqlite:///test.db'\n"
        "SECRET_KEY = 'changeme'\n"
    ),
}


@pytest.fixture()
def sample_repo(tmp_path: Path) -> Path:
    """Create a temporary repository with 5 Python files that form a
    realistic dependency graph.

    Structure:
        main.py     → imports auth, database
        auth.py     → imports database, utils
        database.py → imports utils
        utils.py    → imports nothing
        config.py   → imports nothing
    """
    for name, content in _SAMPLE_FILES.items():
        (tmp_path / name).write_text(content, encoding="utf-8")
    return tmp_path


# ---------------------------------------------------------------------------
# Fixture: sample_graph
# ---------------------------------------------------------------------------

@pytest.fixture()
def sample_graph() -> nx.DiGraph:
    """Return a pre-built DiGraph with 8 nodes and 10 edges representing a
    realistic dependency structure."""
    g = nx.DiGraph()

    nodes = [
        "src/main.py",
        "src/auth.py",
        "src/database.py",
        "src/utils.py",
        "src/config.py",
        "src/api/routes.py",
        "src/api/middleware.py",
        "src/services/email.py",
    ]
    for n in nodes:
        g.add_node(n, language="py", filename=Path(n).name)

    edges = [
        ("src/main.py", "src/auth.py"),
        ("src/main.py", "src/database.py"),
        ("src/main.py", "src/api/routes.py"),
        ("src/auth.py", "src/database.py"),
        ("src/auth.py", "src/utils.py"),
        ("src/database.py", "src/utils.py"),
        ("src/database.py", "src/config.py"),
        ("src/api/routes.py", "src/auth.py"),
        ("src/api/routes.py", "src/services/email.py"),
        ("src/api/middleware.py", "src/utils.py"),
    ]
    g.add_edges_from(edges)

    return g
