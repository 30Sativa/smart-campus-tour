"""Input normalization, robot-command refusal and answer sanitizing.

The robot-command check runs before any LLM call: requests to move, stop or
steer the robot get a fixed answer (docs/architecture.md §7.1). It only fires
on imperative wording, never on questions about the robot.
"""

from __future__ import annotations

import re
import unicodedata

ROBOT_COMMAND_ANSWER = (
    "Mình không điều khiển được robot. Việc di chuyển, dừng hay đổi hướng robot do nhân viên vận hành "
    "(Staff) phụ trách. Nếu đoàn muốn đi nhánh tham quan khác, đại diện đoàn có thể gửi đề nghị để Staff duyệt."
)
NO_CONTENT_ANSWER = (
    "Mình chưa có thông tin để trả lời câu này. Bạn có thể hỏi về chuyến tham quan, robot hoặc điểm "
    "tham quan đang xem nhé."
)
FALLBACK_ANSWER = "Xin lỗi, mình chưa trả lời được câu này. Bạn thử hỏi lại theo cách khác nhé."

_SPACE = re.compile(r"\s+")
_TOKEN = re.compile(r"[a-z0-9]+")
_URL = re.compile(r"(?:https?://|www\.)[^\s<>\"')\]]+", re.IGNORECASE)
_SENTENCE_END = re.compile(r"[.!?…](?=\s|$)")

# Accent-free phrases that make a sentence an instruction to the robot.
_COMMAND_PHRASES = (
    "cho robot", "robot oi", "dieu khien", "ra lenh", "quay camera", "xoay camera", "quay dau",
    "xoay dau", "di tiep", "bo qua diem", "bo qua cho", "dung lai", "dung robot", "re trai", "re phai", "quay lai",
    "lui lai", "tang toc", "giam toc", "di nhanh", "di cham", "di toi", "di den", "chay toi",
    "chay den", "chay nhanh", "di thang", "quay trai", "quay phai", "sang trai", "sang phai",
)
# Words/phrases that mark a question ("có … không", "làm sao", "ai", …).
_QUESTION_TOKENS = frozenset(
    {"khong", "ko", "k", "hong", "chua", "sao", "gi", "nao", "bao", "may", "dau", "ai", "ha", "hok"}
)
_QUESTION_PHRASES = ("the nao", "lam sao", "duoc khong", "co the", "khi nao", "tai sao", "vi sao")


def normalize_text(text: str) -> str:
    """NFC-normalize, drop control/format characters and collapse whitespace."""
    text = unicodedata.normalize("NFC", text)
    text = "".join(
        ch if ch in "\n\t" or unicodedata.category(ch) not in ("Cc", "Cf") else " " for ch in text
    )
    return _SPACE.sub(" ", text).strip()


def fold(text: str) -> str:
    """Lowercase and strip Vietnamese diacritics: 'Dừng lại!' -> 'dung lai!'."""
    text = unicodedata.normalize("NFD", text.lower()).replace("đ", "d")
    return "".join(ch for ch in text if unicodedata.category(ch) != "Mn")


def is_robot_command(question: str) -> bool:
    if "?" in question:
        return False
    tokens = _TOKEN.findall(fold(question))
    joined = " " + " ".join(tokens) + " "
    if any(t in _QUESTION_TOKENS for t in tokens) or any(f" {p} " in joined for p in _QUESTION_PHRASES):
        return False
    return any(f" {p} " in joined for p in _COMMAND_PHRASES)


def sanitize_answer(answer: str, allowed_text: str, max_chars: int) -> str:
    """Remove links that are not in the supplied content and cap the length."""

    def keep_known(match: re.Match[str]) -> str:
        url = match.group(0).rstrip(".,;:")
        return match.group(0) if url in allowed_text else ""

    text = normalize_text(_URL.sub(keep_known, answer))
    if len(text) <= max_chars:
        return text
    head = text[:max_chars]
    ends = [m.end() for m in _SENTENCE_END.finditer(head)]
    if ends and ends[-1] >= max_chars // 2:
        return head[: ends[-1]].strip()
    cut = head.rsplit(" ", 1)[0] if " " in head else head
    return cut.rstrip(" ,;:") + "…"
