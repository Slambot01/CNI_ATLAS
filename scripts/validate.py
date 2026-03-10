"""
scripts/validate.py

CNI Validation Suite — tests every CLI command against the CNI repo itself.

Usage:
    python scripts/validate.py
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parent.parent / "cni"
PYTHON = sys.executable
CNI = [PYTHON, "-m", "cni"]

GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
RESET = "\033[0m"
BOLD = "\033[1m"

PASS_MARK = "v"  # ASCII-safe for Windows cp1252 consoles
FAIL_MARK = "x"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _run(cmd: list[str], *, cwd: Path = REPO_ROOT, timeout: int = 60) -> subprocess.CompletedProcess:
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    return subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        cwd=str(cwd),
        timeout=timeout,
        env=env,
    )


def _ollama_running() -> bool:
    """Return True if the local Ollama server is reachable."""
    try:
        import urllib.request
        urllib.request.urlopen("http://localhost:11434/api/tags", timeout=3)
        return True
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Test runner
# ---------------------------------------------------------------------------

class TestResult:
    def __init__(self, num: int, name: str, passed: bool, note: str = "",
                 stdout: str = "", stderr: str = "", skipped: bool = False):
        self.num = num
        self.name = name
        self.passed = passed
        self.note = note
        self.stdout = stdout
        self.stderr = stderr
        self.skipped = skipped


def run_test(
    num: int,
    name: str,
    cmd: list[str],
    *,
    expect_exit: int | None = 0,
    expect_nonzero: bool = False,
    output_contains: list[str] | None = None,
    file_exists: Path | None = None,
    note: str = "",
) -> TestResult:
    label = f"TEST {num:<2} {name:<28}"
    print(f"  {label}", end="", flush=True)

    try:
        result = _run(cmd)
    except subprocess.TimeoutExpired:
        print(f"{RED}{FAIL_MARK}  FAIL{RESET}  (timeout)")
        return TestResult(num, name, False, "timeout")

    combined = result.stdout + result.stderr

    # Exit code check
    if expect_nonzero:
        exit_ok = result.returncode != 0
    elif expect_exit is not None:
        exit_ok = result.returncode == expect_exit
    else:
        exit_ok = True

    # Content checks
    content_ok = True
    if output_contains:
        for expected in output_contains:
            if expected.lower() not in combined.lower():
                content_ok = False
                break

    # File existence check
    file_ok = True
    if file_exists is not None:
        file_ok = file_exists.exists()

    passed = exit_ok and content_ok and file_ok

    suffix = f"  {note}" if note else ""
    if passed:
        print(f"{GREEN}{PASS_MARK}  PASS{RESET}{suffix}")
    else:
        reasons = []
        if not exit_ok:
            reasons.append(f"exit code: {result.returncode}")
        if not content_ok:
            reasons.append("output mismatch")
        if not file_ok:
            reasons.append(f"file not found: {file_exists}")
        print(f"{RED}{FAIL_MARK}  FAIL{RESET}  {', '.join(reasons)}")

    return TestResult(num, name, passed, note, result.stdout, result.stderr)


def skip_test(num: int, name: str, reason: str) -> TestResult:
    label = f"TEST {num:<2} {name:<28}"
    print(f"  {label}{YELLOW}-  SKIP{RESET}  {reason}")
    return TestResult(num, name, True, reason, skipped=True)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    print()
    print(f"{BOLD}CNI Validation Suite{RESET}")
    print("\u2500" * 60)
    print()

    results: list[TestResult] = []

    # TEST 1 ----------------------------------------------------------------
    results.append(run_test(
        1, "cni analyze .",
        CNI + ["analyze", "."],
        output_contains=["Files scanned"],
    ))

    # TEST 2 ----------------------------------------------------------------
    graph_out = REPO_ROOT / "dependency_graph.png"
    results.append(run_test(
        2, "cni graph .",
        CNI + ["graph", ".", "--output", str(graph_out.with_suffix("")), "--format", "png"],
        file_exists=graph_out,
    ))

    # TEST 3 ----------------------------------------------------------------
    results.append(run_test(
        3, "cni explain main.py",
        CNI + ["explain", "main.py", "."],
        output_contains=["File:", "Imports:"],
    ))

    # TEST 4 ----------------------------------------------------------------
    results.append(run_test(
        4, "cni path cli/main.py graph/dependency_graph.py",
        CNI + ["path", "cli/main.py", "graph/dependency_graph.py", "."],
        output_contains=["main.py"],
    ))

    # TEST 5 ----------------------------------------------------------------
    results.append(run_test(
        5, "cni health",
        CNI + ["health", "."],
        output_contains=["Health"],
    ))

    # TEST 6 ----------------------------------------------------------------
    results.append(run_test(
        6, "cni onboard",
        CNI + ["onboard", "."],
        output_contains=["Entry points"],
    ))

    # TEST 7 ----------------------------------------------------------------
    results.append(run_test(
        7, "cni impact repo_scanner.py",
        CNI + ["impact", "repo_scanner.py", "."],
        output_contains=["Impact"],
    ))

    # TEST 8 ----------------------------------------------------------------
    results.append(run_test(
        8, "cni doctor",
        CNI + ["doctor"],
        output_contains=["Ollama", "Graphviz"],
    ))

    # TEST 9 ----------------------------------------------------------------
    results.append(run_test(
        9, "invalid path (reject check)",
        CNI + ["analyze", "/nonexistent/path/xyz"],
        expect_nonzero=True,
        note="(correctly rejected)",
    ))

    # TEST 10 ---------------------------------------------------------------
    results.append(run_test(
        10, "explain nonexistent_file.py",
        CNI + ["explain", "nonexistent_file_xyz_abc.py", "."],
        # Should either exit 1 with an error OR exit 0 with "not found" message
        expect_exit=None,
        output_contains=["not found"],
    ))

    # TEST 11 (optional) — cni ask ------------------------------------------
    print()
    if _ollama_running():
        results.append(run_test(
            11, "cni ask (Ollama detected)",
            CNI + ["ask", "What does repo_scanner do?", "."],
            output_contains=["scan", "file"],
            note="(LLM-powered)",
        ))
    else:
        results.append(skip_test(
            11, "cni ask",
            "Ollama not running — start with: ollama serve",
        ))

    # -----------------------------------------------------------------------
    # Summary
    # -----------------------------------------------------------------------
    real_results = [r for r in results if not r.skipped]
    passed_count = sum(1 for r in real_results if r.passed)
    total_count = len(real_results)
    failed = [r for r in real_results if not r.passed]
    skipped = [r for r in results if r.skipped]

    print()
    print("\u2500" * 60)
    print(f"Results: {passed_count}/{total_count} passed", end="")
    if skipped:
        print(f"  ({len(skipped)} skipped)", end="")
    print()

    if failed:
        print(f"\n{RED}Failed tests:{RESET}")
        for r in failed:
            print(f"\n  TEST {r.num}: {r.name}")
            if r.stdout.strip():
                preview = r.stdout.strip()[:400]
                print(f"  stdout: {preview}")
            if r.stderr.strip():
                preview = r.stderr.strip()[:400]
                print(f"  stderr: {preview}")
        print()
        print("If a test fails:")
        print("  1. Check the stdout/stderr above for the actual error message.")
        print("  2. Run the failing command directly: python -m cni <cmd> [args]")
        print("  3. Check Ollama is running for ask/flow/onboard: cni doctor")
        print("  4. Ensure you are running from inside the cni/ directory.")
        sys.exit(1)
    else:
        print(f"\n{GREEN}All tests passed!{RESET}")
        sys.exit(0)


if __name__ == "__main__":
    main()
