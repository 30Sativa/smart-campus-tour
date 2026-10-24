import importlib.util
import io
import sys
import unittest
import uuid
from contextlib import redirect_stdout

from campus_assistant.content import ContentPack
from campus_assistant.models import PoiSnapshot
from helpers import POI_A, POI_B, REPO_AI, TempContent, doc


def load_checker():
    spec = importlib.util.spec_from_file_location("check_content", REPO_AI / "scripts" / "check_content.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules["check_content"] = module
    spec.loader.exec_module(module)
    return module


FILES = {
    "campus/tour.md": doc("tour", "- Tour dài khoảng 30 phút.", priority="1", title="Về chuyến tham quan"),
    "campus/school.md": doc("school", "- Trường có nhiều ngành.", priority="3", title="Về trường"),
    "campus/draft.md": doc("draft", "- Chưa duyệt.", status="draft"),
    "pois/a.md": doc("a", "- Lab có 30 máy.", kind="poi", poi=POI_A.upper(), title="AI Lab"),
    "pois/b.md": doc("b", "- Thư viện mở 8h.", kind="poi", poi=POI_B, title="Thư viện"),
}


class ContentPackTest(unittest.TestCase):
    def test_only_approved_documents_are_loaded(self) -> None:
        with TempContent(FILES) as root:
            pack = ContentPack.load(root)
        self.assertEqual(sorted(d.id for d in pack.docs), ["a", "b", "school", "tour"])

    def test_version_matches_checker_script(self) -> None:
        checker = load_checker()
        with TempContent(FILES) as root:
            pack = ContentPack.load(root)
            out = io.StringIO()
            with redirect_stdout(out):
                checker.main(["--content", str(root), "--evals", str(root / "missing.json")])
        self.assertIn(f"contentVersion {pack.version}", out.getvalue())

    def test_selection_order_with_poi(self) -> None:
        with TempContent(FILES) as root:
            pack = ContentPack.load(root)
        poi = PoiSnapshot(id=uuid.UUID(POI_A), name="AI Lab", description="Phòng lab AI")
        sources = [c.source for c in pack.select(poi)]
        self.assertEqual(sources, ["AI Lab", "AI Lab", "Về chuyến tham quan", "Thư viện", "Về trường"])
        self.assertIn("Phòng lab AI", pack.select(poi)[0].text)

    def test_selection_without_poi(self) -> None:
        with TempContent(FILES) as root:
            pack = ContentPack.load(root)
        expected = ["Về chuyến tham quan", "AI Lab", "Thư viện", "Về trường"]
        self.assertEqual([c.source for c in pack.select(None)], expected)

    def test_budget_drops_low_priority_items_first(self) -> None:
        big = "x" * 300
        files = {
            "campus/tour.md": doc("tour", big, priority="1"),
            "campus/school.md": doc("school", big, priority="3"),
            "pois/b.md": doc("b", "- nhỏ", kind="poi", poi=POI_B, title="Thư viện"),
        }
        with TempContent(files) as root:
            pack = ContentPack.load(root, budget=400)
        self.assertEqual([c.source for c in pack.select(None)], ["tour", "Thư viện"])

    def test_empty_pack_selects_nothing_without_poi(self) -> None:
        with TempContent({"campus/draft.md": doc("draft", "x", status="draft")}) as root:
            pack = ContentPack.load(root)
        self.assertEqual(pack.select(None), [])
        poi = PoiSnapshot(id=uuid.UUID(POI_A), name="AI Lab")
        self.assertEqual(len(pack.select(poi)), 1)

    def test_repository_content_pack_loads(self) -> None:
        pack = ContentPack.load(REPO_AI / "content")
        self.assertTrue(all(d.id for d in pack.docs))


if __name__ == "__main__":
    unittest.main()
