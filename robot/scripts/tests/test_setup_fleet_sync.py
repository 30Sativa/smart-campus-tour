import os
import shlex
import sys
import contextlib
import io
import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))
import setup_fleet_sync as setup  # noqa: E402


TOKEN = "A" * 43


class SetupFleetSyncTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.home = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def test_setup_saves_shell_safe_private_files_without_secret_in_env(self):
        env_path, credential_path = setup.save_configuration(
            self.home, "https://sync.example.test/path", "amr_01", "map 'alpha';$(id)",
            "map frame", TOKEN)

        config = env_path.read_text(encoding="utf-8")
        self.assertNotIn(TOKEN, config)
        self.assertIn("FLEET_ROBOT_CREDENTIAL_FILE=", config)
        self.assertIn("'\"'\"'", config)  # embedded apostrophe is safely quoted for POSIX shell
        self.assertEqual(credential_path.read_text(encoding="utf-8").strip(), TOKEN)
        self.assertEqual(os.stat(env_path.parent).st_mode & 0o777, 0o700)
        self.assertEqual(os.stat(env_path).st_mode & 0o777, 0o600)
        self.assertEqual(os.stat(credential_path).st_mode & 0o777, 0o600)

        values = {}
        for line in config.splitlines():
            key, shell_value = line.removeprefix("export ").split("=", 1)
            values[key] = shlex.split(shell_value)[0]
        self.assertEqual(values["FLEET_ROBOT_MAP_KEY"], "map 'alpha';$(id)")
        self.assertEqual(values["FLEET_ROBOT_FRAME_ID"], "map frame")

    def test_existing_setup_is_not_overwritten_without_explicit_choice(self):
        env_path, credential_path = setup.save_configuration(
            self.home, "https://sync.example.test/path", "amr_01", "map-v1", "map", TOKEN)
        with self.assertRaises(FileExistsError):
            setup.save_configuration(self.home, "https://sync.example.test/path", "amr_01",
                                     "map-v2", "map", "B" * 43)
        self.assertEqual(credential_path.read_text(encoding="utf-8").strip(), TOKEN)
        self.assertIn("map-v1", env_path.read_text(encoding="utf-8"))


    def test_probe_reuses_existing_probe_and_never_receives_plaintext_in_argv_or_env(self):
        env_path, credential_path = setup.save_configuration(
            self.home, "https://sync.example.test/path", "amr_01", "map-v1", "map", TOKEN)
        seen = {}

        def runner(argv, env, check):
            seen.update(argv=argv, env=env, check=check)
            return type("Result", (), {"returncode": 0})()

        self.assertEqual(setup.run_probe(env_path, {"PATH": "safe"}, runner, lambda _: "y"), 0)
        self.assertEqual(Path(seen["argv"][1]), setup.PROBE)
        self.assertNotIn(TOKEN, seen["argv"])
        self.assertNotIn(TOKEN, seen["env"].values())
        self.assertEqual(seen["env"]["FLEET_ROBOT_CREDENTIAL_FILE"], str(credential_path))
        self.assertFalse(seen["check"])


    def test_probe_cancels_without_running_if_bridge_is_not_confirmed_stopped(self):
        env_path, _ = setup.save_configuration(
            self.home, "https://sync.example.test/path", "amr_01", "map-v1", "map", TOKEN)
        invoked = False

        def runner(*args, **kwargs):
            nonlocal invoked
            invoked = True
            raise AssertionError("probe must not run")

        self.assertEqual(setup.run_probe(env_path, {}, runner, lambda _: "n"), 2)
        self.assertFalse(invoked)


    def test_robot_code_and_credential_contracts(self):
        self.assertTrue(setup.ROBOT_CODE.fullmatch("amr_01.-"))
        self.assertTrue(setup.ROBOT_CODE.fullmatch("A" * 100))
        self.assertFalse(setup.ROBOT_CODE.fullmatch("-amr"))
        self.assertFalse(setup.ROBOT_CODE.fullmatch("éclair"))
        self.assertFalse(setup.ROBOT_CODE.fullmatch("A" * 101))

    def test_main_saves_private_configuration_from_outside_repo_without_pythonpath(self):
        answers = iter(["", "amr_01", "map-v1", "map", "n"])
        stdout = io.StringIO()
        stderr = io.StringIO()
        with tempfile.TemporaryDirectory() as outside:
            original_cwd = Path.cwd()
            try:
                os.chdir(outside)
                with patch.dict(os.environ, {"PYTHONPATH": ""}, clear=False), \
                        contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                    result = setup.main(lambda _: next(answers), lambda _: TOKEN, self.home, environment={})
            finally:
                os.chdir(original_cwd)

        env_path = self.home / ".config" / "campustour" / "fleet-sync.env"
        credential_path = self.home / ".config" / "campustour" / "amr_01.credential"
        self.assertEqual(result, 0)
        self.assertTrue(env_path.is_file())
        self.assertTrue(credential_path.is_file())
        self.assertEqual(os.stat(env_path.parent).st_mode & 0o777, 0o700)
        self.assertEqual(os.stat(env_path).st_mode & 0o777, 0o600)
        self.assertEqual(os.stat(credential_path).st_mode & 0o777, 0o600)
        self.assertNotIn(TOKEN, stdout.getvalue() + stderr.getvalue())

    def test_main_probe_uses_repository_probe_with_exact_saved_configuration_and_no_production_request(self):
        answers = iter(["https://sync.example.test/api/fleet/v1/sync", "amr_01", "map-v1", "map", "y", "y"])
        calls = []
        stdout = io.StringIO()
        stderr = io.StringIO()

        def runner(argv, env, check):
            calls.append((argv, env, check))
            return type("Result", (), {"returncode": 0})()

        with tempfile.TemporaryDirectory() as outside:
            original_cwd = Path.cwd()
            try:
                os.chdir(outside)
                with patch.dict(os.environ, {"PYTHONPATH": ""}, clear=False), \
                        contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                    result = setup.main(lambda _: next(answers), lambda _: TOKEN, self.home,
                                        environment={}, runner=runner)
            finally:
                os.chdir(original_cwd)

        self.assertEqual(result, 0)
        self.assertEqual(len(calls), 1)
        argv, env, check = calls[0]
        self.assertEqual(Path(argv[1]), setup.PROBE)
        self.assertEqual(env["FLEET_SYNC_URL"], "https://sync.example.test/api/fleet/v1/sync")
        self.assertEqual(env["FLEET_ROBOT_CODE"], "amr_01")
        self.assertEqual(env["FLEET_ROBOT_MAP_KEY"], "map-v1")
        self.assertEqual(env["FLEET_ROBOT_FRAME_ID"], "map")
        self.assertEqual(env["FLEET_ROBOT_CREDENTIAL_FILE"],
                         str(self.home / ".config" / "campustour" / "amr_01.credential"))
        self.assertNotIn(TOKEN, argv)
        self.assertNotIn(TOKEN, env.values())
        self.assertNotIn(TOKEN, stdout.getvalue() + stderr.getvalue())
        self.assertFalse(check)

    def test_main_reports_missing_probe_without_traceback_or_secret(self):
        answers = iter(["", "amr_01", "map-v1", "map", "n"])
        stdout = io.StringIO()
        stderr = io.StringIO()
        missing_probe = self.home / "missing" / "fleet_sync_probe.py"
        with patch.object(setup, "PROBE", missing_probe), \
                contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            result = setup.main(lambda _: next(answers), lambda _: TOKEN, self.home, environment={})

        self.assertEqual(result, 2)
        self.assertIn("Fleet Sync probe is unavailable", stderr.getvalue())
        self.assertNotIn("Traceback", stderr.getvalue())
        self.assertNotIn(TOKEN, stdout.getvalue() + stderr.getvalue())
        self.assertFalse((self.home / ".config" / "campustour").exists())
