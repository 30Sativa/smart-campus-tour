import tempfile
import unittest
from pathlib import Path

from campus_assistant.config import ConfigError, Settings, load_dotenv
from helpers import REPO_AI, SERVICE_KEY


class ConfigTest(unittest.TestCase):
    def test_defaults_match_contract(self) -> None:
        s = Settings.from_env({"AI_SERVICE_KEY": SERVICE_KEY, "AI_PROVIDER": "fake"}).validate()
        self.assertEqual((s.request_budget_s, s.llm_attempt_timeout_s, s.retry_min_remaining_s), (18, 15, 5))
        self.assertEqual((s.max_concurrent_llm_calls, s.answer_max_chars, s.host), (8, 1200, "127.0.0.1"))
        self.assertEqual(s.content_dir, REPO_AI / "content")
        self.assertEqual(s.gemini_thinking_level, "low")
        self.assertEqual(Settings.from_env({"GEMINI_THINKING_LEVEL": ""}).gemini_thinking_level, "")

    def test_validation_errors(self) -> None:
        bad = [
            {},
            {"AI_SERVICE_KEY": "short", "AI_PROVIDER": "fake"},
            {"AI_SERVICE_KEY": SERVICE_KEY},  # gemini without key/model
            {"AI_SERVICE_KEY": SERVICE_KEY, "AI_PROVIDER": "openai"},
            {"AI_SERVICE_KEY": SERVICE_KEY, "AI_PROVIDER": "fake", "AI_PORT": "abc"},
            {"AI_SERVICE_KEY": SERVICE_KEY, "AI_PROVIDER": "fake", "AI_LLM_ATTEMPT_TIMEOUT_SECONDS": "30"},
            {"AI_SERVICE_KEY": SERVICE_KEY, "AI_PROVIDER": "fake", "AI_CONTENT_DIR": "/khong/ton/tai"},
        ]
        for env in bad:
            with self.subTest(env=env):
                with self.assertRaises(ConfigError):
                    Settings.from_env(env).validate()

    def test_repr_hides_secrets(self) -> None:
        s = Settings.from_env({"AI_SERVICE_KEY": SERVICE_KEY, "GEMINI_API_KEY": "AIza-hidden", "GEMINI_MODEL": "m"})
        self.assertNotIn(SERVICE_KEY, repr(s))
        self.assertNotIn("AIza-hidden", repr(s))

    def test_dotenv_reader(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / ".env"
            p.write_text('# c\nGEMINI_MODEL="m1"\nEMPTY=\n', encoding="utf-8")
            values = load_dotenv(p)
        self.assertEqual(values["GEMINI_MODEL"], "m1")
        self.assertEqual(values["EMPTY"], "")
        self.assertIn("PATH", load_dotenv(Path("/khong/co/.env")))


if __name__ == "__main__":
    unittest.main()
