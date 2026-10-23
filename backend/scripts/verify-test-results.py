#!/usr/bin/env python3
"""Reject empty, undiscovered, or unexpectedly skipped backend test runs."""

from __future__ import annotations

import sys
import xml.etree.ElementTree as ET
from pathlib import Path


def fail(message: str) -> int:
    print(f"FAIL: {message}", file=sys.stderr)
    return 1


def read_results(directory: Path) -> tuple[int, int, int]:
    files = sorted(directory.glob("*.trx")) if directory.is_dir() else []
    if not files:
        raise ValueError(f"No TRX files were produced in {directory}.")

    total = executed = skipped = 0
    for path in files:
        root = ET.parse(path).getroot()
        counters = root.find(".//{*}Counters")
        if counters is None:
            raise ValueError(f"TRX file has no counters: {path.name}.")

        total += int(counters.get("total", "0"))
        executed += int(counters.get("executed", "0"))
        result_nodes = root.findall(".//{*}UnitTestResult")
        skipped += sum(result.get("outcome") in {"NotExecuted", "NotRunnable"} for result in result_nodes)

    return total, executed, skipped


def check_scope(name: str, directory: Path, require_no_skips: bool) -> tuple[bool, int]:
    try:
        total, executed, skipped = read_results(directory)
    except (OSError, ET.ParseError, ValueError) as error:
        print(f"FAIL: {name}: {error}", file=sys.stderr)
        return False, 0

    print(f"{name}: discovered={total}, executed={executed}, skipped={skipped}")
    if total == 0:
        print(f"FAIL: {name} discovered no tests.", file=sys.stderr)
        return False, executed
    if require_no_skips and skipped:
        print(f"FAIL: {name} has {skipped} skipped or non-runnable tests.", file=sys.stderr)
        return False, executed
    if require_no_skips and executed == 0:
        print(f"FAIL: {name} discovered no executed tests.", file=sys.stderr)
        return False, executed
    return True, executed


def main() -> int:
    if len(sys.argv) != 3 or sys.argv[2].lower() not in {"true", "false"}:
        return fail("usage: verify-test-results.py RESULTS_DIR REQUIRE_SQL_TESTS(true|false)")

    root = Path(sys.argv[1])
    require_sql = sys.argv[2].lower() == "true"
    scopes = ["unit", "integration", "sql"] if require_sql else ["unit", "integration"]
    all_ok = True
    for scope in scopes:
        ok, _ = check_scope(scope, root / scope, require_no_skips=require_sql)
        all_ok = all_ok and ok
    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
