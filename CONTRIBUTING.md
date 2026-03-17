# Contributing to CNI

Thank you for your interest in contributing to **CNI — Codebase Neural Interface**!
This guide covers everything you need to get started.

---

## Development Setup

```bash
# 1. Fork & clone
git clone https://github.com/Slambot01/CNI_ATLAS.git
cd CNI_ATLAS

# 2. (Recommended) Create a virtual environment
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate

# 3. Install in editable mode with dev dependencies
pip install -e ".[dev]"
```

> **Windows note**: If the `cni` command is not found after installation, your
> Python Scripts directory may not be on your `PATH`.  Use `python -m cni`
> as a drop-in replacement for all commands below.

---

## Running Tests

```bash
# Run the full test suite
pytest tests/

# Run with coverage report
pytest tests/ --cov=cni --cov-report=term-missing

# Run a specific test file
pytest tests/test_cli.py -v
```

---

## Running CNI Locally

```bash
# Analyze the CNI repo itself
cni analyze .

# Export a dependency graph image
cni graph . --output docs/arch --format svg

# Ask a question (requires Ollama — see below)
cni ask "How does the cache invalidation work?"
```

### Ollama Setup (required for `cni ask`, `cni flow`, `cni onboard`)

```bash
# Install Ollama from https://ollama.com/download, then:
ollama serve
ollama pull qwen2.5-coder:7b

# Verify everything is configured correctly
cni doctor
```

---

## Project Structure

| Path | Description |
|------|-------------|
| `cni/__init__.py` | Package root; exports `__version__`. |
| `cni/__main__.py` | Enables `python -m cni`; delegates to `cli/main.py`. |
| `cni/cli/main.py` | Typer CLI entry point; defines all commands. |
| `cni/analyzer/repo_scanner.py` | Recursively walks the repo and extracts imports from Python files. |
| `cni/graph/graph_builder.py` | Builds a `networkx.DiGraph` from file paths; resolves Python and JS/TS imports. |
| `cni/graph/export.py` | Renders the graph to PNG/SVG/PDF via Graphviz; supports depth/import/cluster filters. |
| `cni/analysis/path_finder.py` | Finds the shortest dependency path between two files using BFS. |
| `cni/analysis/explainer.py` | Shows what a file imports and which files import it. |
| `cni/analysis/flow_tracer.py` | Detects API/task entry points and traces execution flows for a concept. |
| `cni/analysis/impact.py` | Reverse-BFS blast-radius analysis with criticality scoring. |
| `cni/analysis/onboarder.py` | Generates a structured onboarding report (entry points, centrality, dead modules). |
| `cni/analysis/health.py` | Computes god-module / coupling / isolation metrics and a 0-100 health score. |
| `cni/retrieval/context_builder.py` | Builds LLM-ready context strings using function-level and file-level semantic search. |
| `cni/retrieval/semantic_search.py` | Sentence-transformer embedding index; exposes `build_index` / `search_index`. |
| `cni/storage/cache.py` | JSON-based scan cache stored in `<repo>/.cni/cache.json`; validates via mtimes. |
| `cni/llm/llm_client.py` | Ollama HTTP client; health-checks the server and sends RAG-style prompts. |
| `cni/utils/errors.py` | Centralised `error`, `success`, `warning`, and `abort` helpers using Typer styling. |
| `cni/utils/platform.py` | OS detection, cross-platform cache-dir resolution, and path normalization. |
| `tests/` | pytest test suite covering CLI commands, context building, and repo scanning. |
| `docs/` | Documentation assets and the demo graph generation script. |

---

## Adding a New CLI Command

1. Create your logic in the appropriate module under `cni/`
2. Import it in `cni/cli/main.py`
3. Add a new `@app.command()` function following existing patterns
4. Add help text to **every argument and option**
5. Add tests in `tests/test_cli.py`
6. Update the Project Structure table in this file

---

## Adding Support for a New Language

1. Add the file extension to `SUPPORTED_EXTENSIONS` in `cni/analyzer/repo_scanner.py`
2. Add an import extractor function `_extract_<language>_imports()` in `cni/graph/graph_builder.py`
3. Add a resolver function `_resolve_<language>_import()` in the same file
4. Register both in the `extract_imports()` and `resolve_import()` dispatcher functions
5. Add tests in `tests/test_repo_scanner.py`

---

## Code Style

- **Python 3.10+** with `from __future__ import annotations`.
- Follow **PEP 8**. Line length limit: **88 characters** (enforced by `ruff`).
- Use **type hints** on all functions (checked by `mypy`).
- Every public function must have a **docstring** following this format:

```python
def function_name(param: type) -> type:
    """
    One line summary of what this function does.

    Args:
        param: Description of the parameter.

    Returns:
        Description of what is returned.

    Raises:
        ExceptionType: When and why this is raised.

    Example:
        >>> function_name(value)
        expected_output
    """
```

- Every **module** must have a module-level docstring starting with its
  canonical path (e.g. `cni/utils/errors.py`) followed by a paragraph
  describing its role in the architecture.
- Run `ruff check .` before submitting a PR.

---

## Pull Request Checklist

- [ ] All existing tests pass (`pytest tests/`)
- [ ] New features include corresponding tests
- [ ] Public functions have complete docstrings
- [ ] `cni --help` and the affected command's `--help` output looks correct
- [ ] No regressions in `cni analyze .` or `cni doctor`
- [ ] `ruff check .` passes with no errors

---

## Reporting Issues

Please open a GitHub issue with:

1. The exact command you ran.
2. The full error output (run with `python -m cni` if `cni` is not found).
3. Your OS, Python version (`python --version`), and CNI version (`cni --version`).

---

## License

By contributing you agree that your contributions will be licensed under the
project's **MIT License**.
