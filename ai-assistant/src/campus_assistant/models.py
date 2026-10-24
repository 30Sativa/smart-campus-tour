"""Request/response schemas of POST /v1/answer (docs/architecture.md §7.1)."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel

from .guards import normalize_text


class _Model(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")


class Turn(_Model):
    question: str = Field(min_length=1, max_length=500)
    answer: str = Field(min_length=1, max_length=1200)


class PoiSnapshot(_Model):
    id: UUID
    name: str = Field(min_length=1, max_length=150)
    description: str | None = Field(default=None, max_length=2000)
    narration_text: str | None = Field(default=None, max_length=8000)


class AnswerRequest(_Model):
    request_id: UUID
    question: str = Field(max_length=500)
    recent_turns: list[Turn] = Field(default_factory=list, max_length=3)
    poi: PoiSnapshot | None = None
    language: Literal["vi"] = "vi"

    @field_validator("question")
    @classmethod
    def _question_not_blank(cls, value: str) -> str:
        value = normalize_text(value)
        if not value:
            raise ValueError("question must not be empty")
        return value


class AnswerResponse(_Model):
    answer: str
    out_of_scope: bool
    used_sources: list[str]
    content_version: str


class LlmAnswer(BaseModel):
    """The JSON object the LLM must return; parsed strictly."""

    model_config = ConfigDict(extra="ignore")

    answer: str = Field(min_length=1)
    outOfScope: bool
    usedSources: list[str] = Field(default_factory=list)
