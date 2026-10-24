#!/usr/bin/env python3
"""Compile every jq program in the backend deployment pipeline with the real jq binary.

The deployment harness fakes jq with a lookup table, so it cannot prove that a
filter is valid jq. A key containing '-' accessed with dot syntax, such as
.services.db-init.image, is parsed as subtraction and either fails to compile
or silently selects the wrong value on the EC2 host.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import unittest
from pathlib import Path


REPO = Path(__file__).resolve().parents[2]
SOURCES = sorted((REPO / "backend" / "deploy").glob("*.sh")) + sorted((REPO / ".github" / "workflows").glob("backend-*.yml"))
JQ_CALL = re.compile(r"(?<![\w/.-])jq((?:\s+(?:--arg\s+\w+\s+(?:\"[^\"]*\"|\S+)|-[A-Za-z]+))*)\s+'([^']*)'")
JQ_CALL_LOOSE = re.compile(r"(?<![\w/.-])jq\s+['-]")
ARG_NAME = re.compile(r"--arg\s+(\w+)")
JQ_STRING = re.compile(r'"(?:[^"\\]|\\.)*"')
HYPHENATED_DOT_KEY = re.compile(r"\.[A-Za-z_][A-Za-z0-9_]*(?:-[A-Za-z_][A-Za-z0-9_]*)+")
IMAGE_GATE = re.compile(r'\.services(?:\.\w+|\["[\w-]+"\])\.image')
JQ_COMPILE_ERROR = 3


def jq_programs(path: Path) -> list[tuple[int, str, list[str]]]:
    text = path.read_text(encoding="utf-8").replace("\\\n", " \n")
    programs = []
    for match in JQ_CALL.finditer(text):
        line = text.count("\n", 0, match.start()) + 1
        programs.append((line, match.group(2), ARG_NAME.findall(match.group(1))))
    return programs


def hyphenated_dot_keys(program: str) -> list[str]:
    return HYPHENATED_DOT_KEY.findall(JQ_STRING.sub('""', program))


def compile_with_jq(jq: str, program: str, arg_names: list[str]) -> subprocess.CompletedProcess[str]:
    command = [jq, "-n"]
    for name in arg_names:
        command += ["--arg", name, ""]
    return subprocess.run(command + [program], text=True, capture_output=True, stdin=subprocess.DEVNULL, check=False)


class JqProgramTests(unittest.TestCase):
    def test_extraction_covers_every_jq_invocation(self) -> None:
        for path in SOURCES:
            text = path.read_text(encoding="utf-8").replace("\\\n", " \n")
            with self.subTest(path=path.relative_to(REPO).as_posix()):
                self.assertEqual(len(JQ_CALL_LOOSE.findall(text)), len(jq_programs(path)))
        deploy = jq_programs(REPO / "backend" / "deploy" / "deploy-ec2.sh")
        self.assertTrue(any('.services["db-init"].image' in program for _, program, _ in deploy))

    def test_hyphenated_keys_use_bracket_notation(self) -> None:
        self.assertEqual([".db-init"], hyphenated_dot_keys(".services.db-init.image"))
        self.assertEqual([".x-length"], hyphenated_dot_keys(".services.x-length"))
        self.assertEqual([], hyphenated_dot_keys('.services["db-init"].image'))
        self.assertEqual([], hyphenated_dot_keys('.volumes["sqlserver-data"].name // empty'))
        for path in SOURCES:
            for line, program, _ in jq_programs(path):
                with self.subTest(location=f"{path.relative_to(REPO).as_posix()}:{line}"):
                    self.assertEqual([], hyphenated_dot_keys(program), program)

    def test_every_program_compiles_with_real_jq(self) -> None:
        jq = shutil.which("jq")
        if jq is None:
            if os.environ.get("CI"):
                self.fail("jq is required in CI to compile deployment jq programs.")
            self.skipTest("jq is not installed; CI compiles deployment jq programs.")
        self.assertEqual(JQ_COMPILE_ERROR, compile_with_jq(jq, ".services.db-init.image", []).returncode)
        for path in SOURCES:
            for line, program, arg_names in jq_programs(path):
                with self.subTest(location=f"{path.relative_to(REPO).as_posix()}:{line}"):
                    result = compile_with_jq(jq, program, arg_names)
                    self.assertNotEqual(JQ_COMPILE_ERROR, result.returncode, result.stderr)

    def test_image_digest_gates_select_each_compose_service(self) -> None:
        jq = shutil.which("jq")
        if jq is None:
            if os.environ.get("CI"):
                self.fail("jq is required in CI to evaluate deployment digest gates.")
            self.skipTest("jq is not installed; CI evaluates deployment digest gates.")
        images = {"api": "api@sha256:1", "db-init": "init@sha256:2", "sqlserver": "sql@sha256:3"}
        resolved = json.dumps({"services": {name: {"image": image} for name, image in images.items()}})
        gates = [program for _, program, _ in jq_programs(REPO / "backend" / "deploy" / "deploy-ec2.sh")
                 if IMAGE_GATE.fullmatch(program)]
        selected = []
        for program in gates:
            result = subprocess.run([jq, "-r", program], input=resolved, text=True, capture_output=True, check=False)
            self.assertEqual(0, result.returncode, result.stderr)
            selected.append(result.stdout.strip())
        self.assertEqual(sorted(images.values()), sorted(selected))


if __name__ == "__main__":
    unittest.main()
