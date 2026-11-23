"""
tests/run_tests.py — Unified test & quality-gate CLI entrypoint for GoogleSheet_UI_auditor.

Usage:
    .venv/Scripts/python.exe tests/run_tests.py --layer unit
    .venv/Scripts/python.exe tests/run_tests.py --layer all --check-static --coverage
    .venv/Scripts/python.exe tests/run_tests.py --live-smoke
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path
from typing import List

ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT_DIR / "backend"
TESTS_DIR = ROOT_DIR / "tests"

LAYER_PATHS = {
    "unit": str(TESTS_DIR / "unit"),
    "api": str(TESTS_DIR / "api"),
    "integration": str(TESTS_DIR / "integration"),
    "contract": str(TESTS_DIR / "contract"),
}


def run_static_check() -> int:
    print("==> Running ruff static analysis (backend & tests)...")
    cmd = [sys.executable, "-m", "ruff", "check", "backend", "tests"]
    res = subprocess.run(cmd, cwd=str(ROOT_DIR))
    return res.returncode


def run_live_smoke_probe() -> int:
    print("==> Running opt-in live Google Apps Script deployment smoke probe (ZZ999)...")
    if str(BACKEND_DIR) not in sys.path:
        sys.path.insert(0, str(BACKEND_DIR))

    # pyrefly: ignore[missing-import]
    from app.core.config import ENDPOINT_REGISTRY, extract_gid, extract_spreadsheet_id
    # pyrefly: ignore[missing-import]
    from app.services.sheet_service import SheetService

    svc = SheetService()
    endpoint_url = ENDPOINT_REGISTRY[("english", "expression")]
    payload = {
        "action": "update_launch",
        "spreadsheet_id": extract_spreadsheet_id(endpoint_url),
        "gid": extract_gid(endpoint_url),
        "script_id": "ZZ999",
        "video_ready": True,
        "video_date": "22/11/26",
    }
    res = svc._http_post(svc.master_url, payload)
    print(f"Probe response: {res}")

    msg = str(res.get("message", ""))
    if "not found" in msg.lower() and res.get("status") == "error":
        print("Live Apps Script probe PASSED: handleUpdateLaunch is active.")
        return 0

    print(
        f"Live Apps Script probe FAILED: unexpected response (possible undeployed Code.gs): {res}",
        file=sys.stderr,
    )
    return 1


def run_pytest_layers(layer: str, coverage: bool, extra_pytest_args: List[str]) -> int:
    targets = list(LAYER_PATHS.values()) if layer == "all" else [LAYER_PATHS[layer]]
    cmd = [sys.executable, "-m", "pytest", "-v", *targets]
    if coverage:
        cmd.extend(["--cov=backend/app", "--cov-report=term-missing"])
    cmd.extend(extra_pytest_args)

    print(f"==> Running pytest layer '{layer}': {' '.join(cmd)}")
    res = subprocess.run(cmd, cwd=str(ROOT_DIR))
    return res.returncode


def main() -> int:
    parser = argparse.ArgumentParser(description="GoogleSheet_UI_auditor test & quality gate runner")
    parser.add_argument(
        "--layer",
        choices=["unit", "api", "integration", "contract", "all"],
        default="all",
        help="Test layer to execute (default: all)",
    )
    parser.add_argument(
        "--check-static",
        action="store_true",
        help="Run ruff static checks before running pytest",
    )
    parser.add_argument(
        "--coverage",
        action="store_true",
        help="Collect coverage report for backend/app via pytest-cov",
    )
    parser.add_argument(
        "--live-smoke",
        action="store_true",
        help="Run opt-in live Google Apps Script deployment health probe",
    )
    args, unknown = parser.parse_known_args()

    if args.check_static:
        rc = run_static_check()
        if rc != 0:
            return rc

    if args.live_smoke:
        return run_live_smoke_probe()

    return run_pytest_layers(args.layer, args.coverage, unknown)


if __name__ == "__main__":
    raise SystemExit(main())
