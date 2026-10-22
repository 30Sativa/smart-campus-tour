#!/usr/bin/env python3
"""Exercise the TRX gate without requiring .NET, Docker, or SQL Server."""

from __future__ import annotations

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


PARSER = Path(__file__).with_name("verify-test-results.py")


class VerifyTestResultsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(prefix="campustour-trx-")
        self.root = Path(self.temp.name)

    def tearDown(self) -> None:
        self.temp.cleanup()

    def write_result(self, scope: str, outcome: str = "Passed") -> None:
        folder = self.root / scope
        folder.mkdir(parents=True, exist_ok=True)
        executed = "0" if outcome in {"NotExecuted", "NotRunnable"} else "1"
        (folder / "result.trx").write_text(
            "<TestRun><ResultSummary><Counters total=\"1\" executed=\"" + executed +
            "\" /></ResultSummary><Results><UnitTestResult outcome=\"" + outcome +
            "\" /></Results></TestRun>",
            encoding="utf-8",
        )

    def run_gate(self, required: bool) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(PARSER), str(self.root), str(required).lower()],
            capture_output=True, text=True, check=False,
        )

    def test_required_sql_gate_accepts_executed_results_for_each_scope(self) -> None:
        for scope in ("unit", "integration", "sql"):
            self.write_result(scope)
        result = self.run_gate(required=True)
        self.assertEqual(0, result.returncode, result.stderr)

    def test_required_sql_gate_rejects_skipped_sql_tests(self) -> None:
        self.write_result("unit")
        self.write_result("integration")
        self.write_result("sql", "NotExecuted")
        result = self.run_gate(required=True)
        self.assertNotEqual(0, result.returncode)
        self.assertIn("skipped", result.stderr)

    def test_required_sql_gate_rejects_missing_sql_results(self) -> None:
        self.write_result("unit")
        self.write_result("integration")
        result = self.run_gate(required=True)
        self.assertNotEqual(0, result.returncode)
        self.assertIn("No TRX files", result.stderr)

    def test_local_gate_allows_documented_optional_sql_skips(self) -> None:
        self.write_result("unit")
        self.write_result("integration", "NotExecuted")
        result = self.run_gate(required=False)
        self.assertEqual(0, result.returncode, result.stderr)


if __name__ == "__main__":
    unittest.main()
