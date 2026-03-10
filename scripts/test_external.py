"""
scripts/test_external.py

Validates CNI against the FastAPI repository (external codebase).

Usage:
    python scripts/test_external.py
    python scripts/test_external.py --cleanup   # delete clone after tests
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

FASTAPI_REPO = "https://github.com/tiangolo/fastapi"
CLONE_DIR = Path(os.environ.get("CNI_TEST_DIR", str(Path.home() / ".cni_test" / "fastapi_test")))
PYTHON = sys.executable
CNI = [PYTHON, "-m", "cni"]

GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
RESET = "\033[0m"
BOLD = "\033[1m"

PASS_MARK = "v"
FAIL_MARK = "x"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _run(
    cmd: list[str],
    *,
    cwd: Path | None = None,
    timeout: int = 120,
) -> subprocess.CompletedProcess:
    """Run a command and return the result."""
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    return subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        cwd=str(cwd) if cwd else None,
        timeout=timeout,
        env=env,
    )


def _ensure_clone() -> Path:
    """Clone FastAPI if not already present, return the path."""
    if CLONE_DIR.exists() and (CLONE_DIR / ".git").exists():
        print(f"  FastAPI repo already cloned at {CLONE_DIR}")
        return CLONE_DIR

    print(f"  Cloning FastAPI into {CLONE_DIR} ...")
    CLONE_DIR.parent.mkdir(parents=True, exist_ok=True)

    result = _run(
        ["git", "clone", "--depth", "1", FASTAPI_REPO, str(CLONE_DIR)],
        timeout=120,
    )
    if result.returncode != 0:
        print(f"{RED}Failed to clone FastAPI:{RESET}")
        print(result.stderr)
        sys.exit(1)

    print(f"  Clone complete: {CLONE_DIR}")
    return CLONE_DIR


# ---------------------------------------------------------------------------
# Test runner
# ---------------------------------------------------------------------------

class TestResult:
    def __init__(
        self,
        num: int,
        name: str,
        passed: bool,
        note: str = "",
        stdout: str = "",
        stderr: str = "",
        skipped: bool = False,
    ):
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
    output_value_check: str | None = None,
    file_exists: Path | None = None,
    note: str = "",
    timeout: int = 120,
) -> TestResult:
    label = f"TEST {num:<2} {name:<35}"
    print(f"  {label}", end="", flush=True)

    try:
        result = _run(cmd, timeout=timeout)
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

    # Value check (e.g. "Files scanned > 50")
    value_ok = True
    if output_value_check == "files_gt_50":
        import re
        m = re.search(r"Files scanned:\s*(\d+)", combined)
        if m:
            value_ok = int(m.group(1)) > 50
        else:
            value_ok = False

    # File existence check
    file_ok = True
    if file_exists is not None:
        file_ok = file_exists.exists()

    passed = exit_ok and content_ok and file_ok and value_ok

    suffix = f"  {note}" if note else ""
    if passed:
        print(f"{GREEN}{PASS_MARK}  PASS{RESET}{suffix}")
    else:
        reasons = []
        if not exit_ok:
            reasons.append(f"exit code: {result.returncode}")
        if not content_ok:
            reasons.append("output mismatch")
        if not value_ok:
            reasons.append("value check failed")
        if not file_ok:
            reasons.append(f"file not found: {file_exists}")
        print(f"{RED}{FAIL_MARK}  FAIL{RESET}  {', '.join(reasons)}")

    return TestResult(num, name, passed, note, result.stdout, result.stderr)


def skip_test(num: int, name: str, reason: str) -> TestResult:
    label = f"TEST {num:<2} {name:<35}"
    print(f"  {label}{YELLOW}-  SKIP{RESET}  {reason}")
    return TestResult(num, name, True, reason, skipped=True)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="CNI external validation")
    parser.add_argument(
        "--cleanup", action="store_true",
        help="Delete the cloned repository after tests complete.",
    )
    args = parser.parse_args()

    print()
    print(f"{BOLD}CNI External Validation Suite (FastAPI){RESET}")
    print("\u2500" * 60)
    print()

    # Step 0: ensure clone
    repo_path = _ensure_clone()
    repo_str = str(repo_path)
    print()

    results: list[TestResult] = []

    # TEST 1 ----------------------------------------------------------------
    results.append(run_test(
        1, "cni analyze (FastAPI)",
        CNI + ["analyze", repo_str],
        output_contains=["Files scanned"],
        output_value_check="files_gt_50",
        note="(>50 files expected)",
    ))

    # TEST 2 ----------------------------------------------------------------
    graph_out = repo_path / "dependency_graph.png"
    # Clean up any old graph output first
    if graph_out.exists():
        graph_out.unlink()
    results.append(run_test(
        2, "cni graph (FastAPI)",
        CNI + ["graph", repo_str, "--output", str(graph_out.with_suffix("")), "--format", "png"],
        file_exists=graph_out,
    ))

    # TEST 3 ----------------------------------------------------------------
    results.append(run_test(
        3, "cni health (FastAPI)",
        CNI + ["health", repo_str],
        output_contains=["Health"],
    ))

    # TEST 4 ----------------------------------------------------------------
    results.append(run_test(
        4, "cni onboard (FastAPI)",
        CNI + ["onboard", repo_str],
        output_contains=["entry points"],
    ))

    # TEST 5 ----------------------------------------------------------------
    results.append(run_test(
        5, "cni explain routing.py (FastAPI)",
        CNI + ["explain", "routing.py", repo_str],
        expect_exit=None,
        output_contains=["routing"],
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
                preview = r.stdout.strip()[:500]
                print(f"  stdout: {preview}")
            if r.stderr.strip():
                preview = r.stderr.strip()[:500]
                print(f"  stderr: {preview}")

        print()
        print("Troubleshooting:")
        print("  1. Check the stdout/stderr above for the actual error.")
        print("  2. Run the failing command directly:")
        print(f"       python -m cni <cmd> {repo_str}")
        print("  3. Ensure the FastAPI clone is complete:")
        print(f"       ls {CLONE_DIR}")
        print("  4. Run `cni doctor` to check dependencies.")

    else:
        print(f"\n{GREEN}All external tests passed!{RESET}")

    # Cleanup
    if args.cleanup and CLONE_DIR.exists():
        print(f"\nCleaning up {CLONE_DIR} ...")
        shutil.rmtree(CLONE_DIR, ignore_errors=True)
        print("Done.")

    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
