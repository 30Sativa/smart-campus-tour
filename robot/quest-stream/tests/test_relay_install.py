"""ADR-0055: the relay asks the backend about every connection, and its reaper cuts ended viewers.
ADR-0063: fallback-<tourId> is published on demand by a script that asks the backend what to play.

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
        for off in ("metrics: no", "pprof: no", "playback: no", "rtmp: no", "hls: no"):
            self.assertIn(off + "\n", config)

    def test_rtsp_listens_only_on_the_loopback_for_the_fallback_publisher(self):
        config = self.config()
        self.assertIn("rtsp: yes\nrtspAddress: 127.0.0.1:8554\nrtspTransports: [tcp]\nrtspEncryption: \"no\"\n", config)
        self.assertNotIn("rtspAddress: :", config)

    def test_fallback_paths_are_published_on_demand(self):
        paths = self.config().split("paths:\n", 1)[1]
        self.assertIn('  "~^fallback-[0-9a-f]{32}$":\n    source: publisher\n'
                      '    runOnDemand: /usr/local/bin/mediamtx-relay-fallback\n', paths)
        self.assertIn("    runOnDemandCloseAfter: 10s\n", paths)
        # The fallback path has no SRT passphrase of its own: only the backend-approved publisher may publish.
        self.assertEqual(paths.count("srtPublishPassphrase"), 1)

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


@unittest.skipUnless(HAVE_TOOLS, "bash and jq are needed")
class FallbackPublisherTests(unittest.TestCase):
    """The stub curl plays the backend's fallback-source; the stub ffmpeg records what it would publish."""

    PATH_NAME = "fallback-0123456789abcdef0123456789abcdef"
    SIGNED = ("https://res.cloudinary.com/demo/video/authenticated/s--abcdefgh--/"
              "c_limit,h_720,w_1280,vc_h264:baseline:3.1,ki_2.0/smartcampus/tours/fallback/x.mp4")

    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.dir)
        (self.dir / "fallback").write_text(run("--print-fallback"))
        bin_dir = self.dir / "bin"
        bin_dir.mkdir()
        curl = bin_dir / "curl"
        curl.write_text(textwrap.dedent(f"""\
            #!/usr/bin/env bash
            echo "$*" >> {self.dir}/curl.log
            [ -f {self.dir}/answer ] || exit 22
            cat {self.dir}/answer
            """))
        ffmpeg = bin_dir / "ffmpeg"
        ffmpeg.write_text(f"#!/usr/bin/env bash\nprintf '%s\\n' \"$@\" > {self.dir}/ffmpeg.args\n")
        for tool in (curl, ffmpeg):
            tool.chmod(tool.stat().st_mode | stat.S_IEXEC)

    def publish(self, answer=None, path=PATH_NAME):
        if answer is not None:
            (self.dir / "answer").write_text(answer)
        env = {**os.environ, "PATH": f"{self.dir / 'bin'}:{os.environ['PATH']}", "API_URL": "https://api.example.test",
               "RELAY_KEY": "relaykey123", "MTX_PATH": path, "RTSP_PORT": "8554"}
        return subprocess.run(["bash", str(self.dir / "fallback")], env=env, capture_output=True, text=True)

    def ffmpeg_args(self):
        args = self.dir / "ffmpeg.args"
        return args.read_text().splitlines() if args.exists() else None

    def test_asks_the_backend_with_the_path_and_the_relay_key_and_publishes_on_the_loopback(self):
        result = self.publish(self.SIGNED)
        self.assertEqual(result.returncode, 0, result.stderr)
        call = (self.dir / "curl.log").read_text()
        self.assertIn("--data-urlencode path=" + self.PATH_NAME, call)
        self.assertIn("https://api.example.test/api/internal/stream-relay/fallback-source?key=relaykey123", call)
        args = self.ffmpeg_args()
        self.assertEqual(args[args.index("-i") + 1], self.SIGNED)
        self.assertIn("-stream_loop", args)
        self.assertEqual(args[args.index("-c:v") + 1], "copy")
        self.assertEqual(args[args.index("-c:a") + 1], "libopus")
        self.assertEqual(args[-1], f"rtsp://fallback:relaykey123@127.0.0.1:8554/{self.PATH_NAME}")

    def test_publishes_nothing_when_the_backend_refuses(self):
        result = self.publish()
        self.assertNotEqual(result.returncode, 0)
        self.assertIsNone(self.ffmpeg_args())

    def test_refuses_a_source_that_is_not_cloudinary(self):
        result = self.publish("http://169.254.169.254/latest/meta-data/")
        self.assertNotEqual(result.returncode, 0)
        self.assertIsNone(self.ffmpeg_args())

    def test_refuses_a_path_that_is_not_a_fallback_path(self):
        result = self.publish(self.SIGNED, path="quest")
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.dir / "curl.log").exists())


if __name__ == "__main__":
    unittest.main()
