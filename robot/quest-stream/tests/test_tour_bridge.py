"""Tests for the tour bridge (headset MC events). Run from robot/quest-stream/:

    python3 -m unittest discover -s tests -v
"""

import json
import sys
import threading
import time
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from types import SimpleNamespace

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import server  # noqa: E402
import tour_bridge  # noqa: E402
from tour_bridge import TourBridge, UsbReverse, start_bridge_server  # noqa: E402


def tour(step, stop="s1", visit="v1", held=False, name="Thư viện", text="Đây là thư viện.", tour_id="t1"):
    return {"tourId": tour_id, "step": step, "isHeld": held, "visitId": visit, "stopId": stop, "stopOrder": 1,
            "stopName": name, "narrationText": text}


class TourBridgeTests(unittest.TestCase):
    def setUp(self):
        self.bridge = TourBridge(clock=lambda: 1.0)
        self.start = self.bridge.wait(-1, 0)["seq"]

    def events(self):
        return self.bridge.wait(self.start, 0)["events"]

    def test_first_call_returns_the_sequence_without_old_events(self):
        self.bridge.update(tour("OBSERVING"))
        answer = self.bridge.wait(-1, 5)
        self.assertEqual(answer["events"], [])
        self.assertEqual(answer["seq"], self.start + 1)
        self.assertEqual(answer["current_stop"], "s1")

    def test_arrival_is_announced_once_per_visit_with_the_narration(self):
        for _ in range(3):
            self.bridge.update(tour("OBSERVING"))
        events = self.events()
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["type"], "arrived")
        self.assertEqual(events[0]["stop_id"], "s1")
        self.assertEqual(events[0]["name"], "Thư viện")
        self.assertEqual(events[0]["narration"], "Đây là thư viện.")

    def test_a_new_visit_of_the_same_stop_is_a_new_arrival(self):
        self.bridge.update(tour("OBSERVING", visit="v1"))
        self.bridge.update(tour("OBSERVING", visit="v2"))
        self.assertEqual([e["type"] for e in self.events()], ["arrived", "arrived"])

    def test_a_held_stop_waits_until_released(self):
        self.bridge.update(tour("OBSERVING", held=True))
        self.assertEqual(self.events(), [])
        self.assertEqual(self.bridge.wait(-1, 0)["state"], "holding")
        self.bridge.update(tour("OBSERVING", held=False))
        self.assertEqual([e["type"] for e in self.events()], ["arrived"])

    def test_departure_names_the_next_stop_once(self):
        self.bridge.update(tour("NAVIGATING", stop="s2", visit="", name="Sân bóng"))
        self.bridge.update(tour("NAVIGATING", stop="s2", visit="", name="Sân bóng"))
        events = self.events()
        self.assertEqual([(e["type"], e["target_stop"], e["target_name"]) for e in events],
                         [("departed", "s2", "Sân bóng")])

    def test_returning_to_the_end_is_a_departure_to_the_end(self):
        self.bridge.update(tour("RETURNING_TO_END", stop="", visit=""))
        self.assertEqual([(e["type"], e["target_name"]) for e in self.events()],
                         [("departed", tour_bridge.END_NAME)])

    def test_tour_ending_cancels_and_a_new_tour_starts_fresh(self):
        self.bridge.update(tour("OBSERVING"))
        self.bridge.update(None)
        self.bridge.update(tour("OBSERVING", tour_id="t2"))
        self.assertEqual([e["type"] for e in self.events()], ["arrived", "cancelled", "arrived"])

    def test_no_tour_ever_emits_nothing(self):
        self.bridge.update(None)
        self.assertEqual(self.events(), [])

    def test_wait_blocks_until_an_event(self):
        seq = self.bridge.wait(-1, 0)["seq"]
        threading.Timer(0.2, lambda: self.bridge.update(tour("OBSERVING"))).start()
        began = time.monotonic()
        answer = self.bridge.wait(seq, 5)
        self.assertLess(time.monotonic() - began, 3)
        self.assertEqual([e["type"] for e in answer["events"]], ["arrived"])


class BridgeHttpTests(unittest.TestCase):
    def setUp(self):
        self.bridge = TourBridge()
        self.httpd = start_bridge_server(self.bridge, "127.0.0.1", 0, token="secret")
        self.base = f"http://127.0.0.1:{self.httpd.server_address[1]}"

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()

    def call(self, path, body=None, token="secret"):
        request = urllib.request.Request(self.base + path, data=None if body is None else json.dumps(body).encode(),
                                         method="GET" if body is None else "POST")
        if token:
            request.add_header("Authorization", f"Bearer {token}")
        with urllib.request.urlopen(request, timeout=5) as response:
            raw = response.read()
            return response.status, json.loads(raw) if raw else None

    def test_events_need_the_token(self):
        with self.assertRaises(urllib.error.HTTPError) as caught:
            self.call("/quest/events?after=-1&wait=0", token="wrong")
        self.assertEqual(caught.exception.code, 401)

    def test_events_and_narration_reports(self):
        status, first = self.call("/quest/events?after=-1&wait=0")
        self.assertEqual(status, 200)
        self.bridge.update(tour("OBSERVING"))
        _, answer = self.call(f"/quest/events?after={first['seq']}&wait=1")
        self.assertEqual(answer["events"][0]["narration"], "Đây là thư viện.")
        status, _ = self.call("/quest/narration", {"stop_id": "s1", "state": "started"})
        self.assertEqual(status, 204)
        self.assertEqual(self.bridge.snapshot()["lastNarration"]["state"], "started")


class CameraPollFeedsTheBridgeTests(unittest.TestCase):
    def test_the_poll_answer_tour_reaches_the_bridge(self):
        cfg = server.Config(control_url="https://api.test/api/fleet/camera/v1/poll", robot_code="amr_01",
                            robot_credential_file=str(HERE / "fake_adb.py"))
        got = []

        class Answer:
            def __init__(self, body):
                self.body = json.dumps(body).encode()

            def read(self):
                return self.body

            def __enter__(self):
                return self

            def __exit__(self, *exc):
                return False

        body = {"data": {"wanted": True, "reason": "TOUR_RUNNING", "pollSeconds": 5, "tour": tour("OBSERVING")}}
        demand = server.CameraDemand(cfg, opener=lambda request, timeout: Answer(body), on_tour=got.append)
        demand.poll_once()
        body["data"].pop("tour")
        demand.poll_once()
        self.assertEqual(got, [tour("OBSERVING"), None])


class UsbReverseTests(unittest.TestCase):
    def test_reapplies_on_a_new_serial_and_after_a_while(self):
        calls = []
        serial = ["Q1"]
        runner = lambda cmd, **kw: calls.append(cmd) or SimpleNamespace(returncode=0, stdout="", stderr="")
        rev = UsbReverse("adb", 8890, lambda: serial[0], runner=runner, every=60)
        self.assertTrue(rev.apply_once(now=0))
        self.assertFalse(rev.apply_once(now=10))
        self.assertTrue(rev.apply_once(now=61))
        serial[0] = "Q2"
        self.assertTrue(rev.apply_once(now=62))
        serial[0] = ""
        self.assertFalse(rev.apply_once(now=63))
        self.assertEqual(calls[0], ["adb", "-s", "Q1", "reverse", "tcp:8890", "tcp:8890"])
        self.assertEqual(len(calls), 3)


if __name__ == "__main__":
    unittest.main()
