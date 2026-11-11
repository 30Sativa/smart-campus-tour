"""ADR-0055: the relay asks the backend about every connection, and its reaper cuts ended viewers.

Runs install-relay.sh in its print modes (no root, no network) and the generated reaper against a
stub `curl` that plays both the MediaMTX API and the backend. Needs bash and jq.
"""
import json
import os
import shutil
import stat
import subprocess
import tempfile
import textwrap
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "relay" / "install-relay.sh"
HAVE_TOOLS = shutil.which("bash") is not None and shutil.which("jq") is not None


def run(*args, env=None):
    return subprocess.run(["bash", str(SCRIPT), *args], check=True, capture_output=True, text=True,
                          env={**os.environ, **(env or {})}).stdout


@unittest.skipUnless(HAVE_TOOLS, "bash and jq are needed")
class RelayConfigTests(unittest.TestCase):
    ENV = {"PUBLISH_USER": "nuc", "SRT_PASSPHRASE": "srt-pass", "RELAY_KEY": "relay-key-123",
           "PUBLIC_IP": "203.0.113.7", "API_URL": "https://api.example.test", "CONF_DIR": "/etc/mediamtx-relay"}

    def config(self):
        return run("stream.example.test", "--print-config", env=self.ENV)

    def test_every_publish_and_read_goes_to_the_backend(self):
        config = self.config()
        self.assertIn("authMethod: http\n", config)
        self.assertIn("authHTTPAddress: https://api.example.test/api/internal/stream-relay/auth?key=relay-key-123\n", config)
        self.assertNotIn("authInternalUsers", config)
        self.assertNotIn("user: any", config)

    def test_only_the_local_control_api_skips_the_check(self):
        config = self.config()
        excluded = config.split("authHTTPExclude:\n", 1)[1].split("\n\n", 1)[0]
        self.assertEqual(excluded.strip(), "- action: api")
        self.assertIn("apiAddress: 127.0.0.1:9997\n", config)
        for off in ("metrics: no", "pprof: no", "playback: no", "rtsp: no", "rtmp: no", "hls: no"):
            self.assertIn(off + "\n", config)

    def test_the_nuc_still_needs_the_srt_passphrase(self):
        self.assertIn("srtPublishPassphrase: srt-pass\n", self.config())

    def test_print_config_refuses_missing_secrets(self):
        env = {k: v for k, v in self.ENV.items() if k != "RELAY_KEY"}
        result = subprocess.run(["bash", str(SCRIPT), "stream.example.test", "--print-config"], capture_output=True,
                                text=True, env={k: v for k, v in os.environ.items() if k != "RELAY_KEY"} | env)
        self.assertNotEqual(result.returncode, 0)


@unittest.skipUnless(HAVE_TOOLS, "bash and jq are needed")
class ReaperTests(unittest.TestCase):
    """The stub curl answers the session list, the backend recheck (by token) and records kicks."""

    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.dir)
        (self.dir / "reaper").write_text(run("--print-reaper"))
        stub = self.dir / "bin" / "curl"
        stub.parent.mkdir()
        stub.write_text(textwrap.dedent(f"""\
            #!/usr/bin/env bash
            log={self.dir}/calls.log
            url="${{@: -1}}"
            echo "$*" >> "$log"
            case "$url" in
              *webrtcsessions/list*) cat {self.dir}/sessions.json ;;
              *webrtcsessions/kick/*) echo "KICK ${{url##*/}}" >> {self.dir}/kicks.log ;;
              *stream-relay/recheck*)
                body="$*"
                case "$body" in
                  *token=ended*) printf 403 ;;
                  *token=live*) printf 204 ;;
                  *token=badkey*) printf 401 ;;
                  *) printf 000 ;;
                esac ;;
            esac
            """))
        stub.chmod(stub.stat().st_mode | stat.S_IEXEC)

    def reap(self, sessions):
        (self.dir / "sessions.json").write_text(json.dumps({"items": sessions}))
        env = {**os.environ, "PATH": f"{self.dir / 'bin'}:{os.environ['PATH']}", "API_URL": "https://api.example.test",
               "RELAY_KEY": "k", "REAPER_ONCE": "1"}
        subprocess.run(["bash", str(self.dir / "reaper")], check=True, env=env, capture_output=True, text=True)
        kicks = self.dir / "kicks.log"
        return kicks.read_text().split() if kicks.exists() else []

    def test_kicks_only_sessions_the_backend_refuses(self):
        kicks = self.reap([
            {"id": "a", "path": "quest", "query": "token=live"},
            {"id": "b", "path": "quest", "query": "token=ended"},
            {"id": "c", "path": "quest", "query": "token=badkey"},
            {"id": "d", "path": "quest", "query": "token=down"},
        ])
        self.assertEqual(kicks, ["KICK", "b"])

    def test_leaves_sessions_it_cannot_check(self):
        self.assertEqual(self.reap([{"id": "e", "path": "quest"}, {"id": "f", "path": "quest", "query": ""}]), [])
        self.assertNotIn("recheck", (self.dir / "calls.log").read_text())

    def test_sends_path_and_query_with_the_relay_key(self):
        self.reap([{"id": "a", "path": "quest", "query": "token=live"}])
        call = next(line for line in (self.dir / "calls.log").read_text().splitlines() if "recheck" in line)
        self.assertIn('{"path":"quest","query":"token=live"}', call)
        self.assertIn("https://api.example.test/api/internal/stream-relay/recheck?key=k", call)


if __name__ == "__main__":
    unittest.main()
