"""Tests for check_content.py. Run: python3 -m unittest discover -s scripts -p 'test_*.py'"""
import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

import check_content as cc

POI = "8fd832a5-7e3b-4e6d-a101-000000000001"


def doc(id_="ve-robot", kind="campus", status="draft", poi="", by="", at="", body="- Robot dùng LiDAR."):
    return (f"---\nid: {id_}\ntitle: T\nkind: {kind}\npoiId: {poi}\npriority:\nstatus: {status}\n"
            f"reviewedBy: {by}\nreviewedAt: {at}\n---\n{body}\n")


class CheckContentTest(unittest.TestCase):
    def run_check(self, files, evals=None):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for rel, text in files.items():
                p = root / "content" / rel
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text(text, encoding="utf-8")
            ev = evals or {"items": [{"id": "a", "category": "robot", "question": "Robot dùng gì?",
                                      "expect": {"behavior": "answer"}, "needsContent": ["ve-robot"]}]}
            (root / "q.json").write_text(json.dumps(ev, ensure_ascii=False), encoding="utf-8")
            out = io.StringIO()
            with redirect_stdout(out):
                rc = cc.main(["--content", str(root / "content"), "--evals", str(root / "q.json")])
            return rc, out.getvalue()

    def test_valid_draft_passes(self):
        rc, out = self.run_check({"campus/ve-robot.md": doc()})
        self.assertEqual(rc, 0, out)
        self.assertIn("0 approved", out)

    def test_approved_requires_reviewer_and_date(self):
        rc, out = self.run_check({"campus/ve-robot.md": doc(status="approved")})
        self.assertEqual(rc, 1)
        self.assertIn("reviewedBy", out)

    def test_approved_rejects_placeholders(self):
        rc, out = self.run_check({"campus/ve-robot.md": doc(status="approved", by="An", at="2026-10-13",
                                                            body="- Giờ mở cửa: [ĐIỀN]")})
        self.assertEqual(rc, 1)
        self.assertIn("placeholders", out)

    def test_placeholder_inside_comment_is_allowed(self):
        rc, out = self.run_check({"campus/ve-robot.md": doc(status="approved", by="An", at="2026-10-13",
                                                            body="<!-- TODO nguồn -->\n- Robot dùng LiDAR.")})
        self.assertEqual(rc, 0, out)

    def test_personal_data_rejected(self):
        rc, out = self.run_check({"campus/ve-robot.md": doc(body="Liên hệ an@example.com hoặc 0901 234 567")})
        self.assertEqual(rc, 1)
        self.assertIn("email address or phone", out)

    def test_poi_requires_guid_and_folder(self):
        rc, out = self.run_check({"campus/x.md": doc(id_="x", kind="poi", poi="not-a-guid"),
                                  "campus/ve-robot.md": doc()})
        self.assertEqual(rc, 1)
        self.assertIn("poiId must be the POI GUID", out)
        self.assertIn("must live in pois/", out)

    def test_duplicate_ids_rejected(self):
        rc, out = self.run_check({"campus/a.md": doc(), "campus/b.md": doc()})
        self.assertEqual(rc, 1)
        self.assertIn("also used by", out)

    def test_eval_unknown_content_rejected(self):
        ev = {"items": [{"id": "a", "category": "robot", "question": "Q?", "expect": {"behavior": "answer"},
                         "needsContent": ["khong-co"]}]}
        rc, out = self.run_check({"campus/ve-robot.md": doc()}, ev)
        self.assertEqual(rc, 1)
        self.assertIn("unknown content id", out)

    def test_eval_poi_must_exist(self):
        ev = {"items": [{"id": "a", "category": "poi", "question": "Q?", "expect": {"behavior": "answer"},
                         "poiId": POI}]}
        rc, out = self.run_check({"campus/ve-robot.md": doc()}, ev)
        self.assertEqual(rc, 1)
        rc, out = self.run_check({"campus/ve-robot.md": doc(),
                                  "pois/p.md": doc(id_="p", kind="poi", poi=POI)}, ev)
        self.assertEqual(rc, 0, out)

    def test_content_version_changes_only_with_approved_text(self):
        approved = doc(status="approved", by="An", at="2026-10-13")
        _, a = self.run_check({"campus/ve-robot.md": approved})
        _, b = self.run_check({"campus/ve-robot.md": approved, "campus/d.md": doc(id_="d")})
        _, c = self.run_check({"campus/ve-robot.md": approved.replace("LiDAR", "LiDAR 2D")})
        version = lambda out: out.split("contentVersion ")[1].split()[0]
        self.assertEqual(version(a), version(b))
        self.assertNotEqual(version(a), version(c))


if __name__ == "__main__":
    unittest.main()
