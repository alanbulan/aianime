"""Inbound schemas and payload mapping for Chat endpoints."""

from __future__ import annotations

from typing import Any, Literal, TypeVar

from pydantic import BaseModel, Field, ValidationError, model_validator

from ai_anime.modules.ai_assistant.public import (
    ChatScope,
    InteractiveChatScopeKind,
)

_InboundT = TypeVar("_InboundT", bound=BaseModel)


class InboundFrameInvalid(Exception):
    """A client frame failed schema validation.

    Carries a client-safe ``reason`` so the transport adapter can answer with
    an error event instead of dropping the connection.
    """

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


def _validation_summary(exc: ValidationError) -> str:
    """Name the offending fields without echoing client-supplied values."""
    fields = sorted(
        {
            ".".join(str(part) for part in error.get("loc", ()))
            for error in exc.errors()
        }
    )
    joined = ", ".join(field for field in fields if field)
    return f"invalid fields: {joined}" if joined else "payload validation failed"


def parse_inbound_frame(model: type[_InboundT], raw: Any) -> _InboundT:
    """Validate one inbound frame, raising :class:`InboundFrameInvalid`.

    Keeps pydantic validation (and its error shapes) inside this schema module
    so transport adapters never have to import model machinery.
    """
    try:
        return model.model_validate(raw)
    except ValidationError as exc:
        raise InboundFrameInvalid(_validation_summary(exc)) from exc


class ChatScopePayload(BaseModel):
    kind: InteractiveChatScopeKind = "home"
    id: str | None = None
    conversationId: str = "main"


class ChatAttachmentIn(BaseModel):
    id: str | None = None
    type: str | None = None
    kind: str | None = None
    mimeType: str | None = None
    fileName: str | None = None
    fileSize: int | None = None
    content: str | None = None
    url: str | None = None
    path: str | None = None
    label: str | None = None


class ChatMessageIn(BaseModel):
    type: str
    scope: ChatScopePayload | None = None
    text: str
    turn_id: str | None = None
    attachments: list[ChatAttachmentIn] = []


class ScopeSetIn(BaseModel):
    type: str
    scope: ChatScopePayload


class SessionModelGetIn(BaseModel):
    type: Literal["session.model.get"]
    scope: ChatScopePayload


class SessionModelSetIn(BaseModel):
    type: Literal["session.model.set"]
    scope: ChatScopePayload
    selector: str | None = Field(default=None, max_length=768)
    reasoning_effort: str | None = Field(default=None, max_length=64)

    @model_validator(mode="after")
    def validate_selector(self) -> "SessionModelSetIn":
        if self.selector is not None:
            normalized = self.selector.strip()
            if not normalized:
                self.selector = None
            else:
                if not (
                    normalized.startswith("cloud:")
                    or normalized.startswith("byok:")
                ):
                    raise ValueError("selector must be a commercial model route")
                if any(ord(char) < 32 or ord(char) == 127 for char in normalized):
                    raise ValueError("selector contains control characters")
                self.selector = normalized
        if self.reasoning_effort is not None:
            effort = self.reasoning_effort.strip()
            if not effort:
                self.reasoning_effort = None
            elif any(ord(char) < 32 or ord(char) == 127 for char in effort):
                raise ValueError("reasoning_effort contains control characters")
            else:
                self.reasoning_effort = effort
        return self


class ConversationDeleteIn(BaseModel):
    type: str
    scope: ChatScopePayload
    conversationId: str = Field(
        min_length=1,
        max_length=64,
        pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]*$",
    )


class ChatUiEventIn(BaseModel):
    scope: ChatScopePayload
    turn_id: str
    event: dict[str, Any]


class ChatNotificationIn(BaseModel):
    scope: ChatScopePayload | None = None
    text: str


class ChatSlashCommandIn(BaseModel):
    scope: ChatScopePayload
    command: Literal["compact", "context", "reset", "version"]


class MessageContextUpdateIn(BaseModel):
    scope: ChatScopePayload
    state: Literal["normal", "pinned", "excluded"]


class DecisionOptionIn(BaseModel):
    id: str = Field(
        min_length=1,
        max_length=64,
        pattern=r"^[A-Za-z0-9][A-Za-z0-9_.:-]*$",
    )
    label: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=300)


class DecisionQuestionIn(BaseModel):
    id: str = Field(
        min_length=1,
        max_length=64,
        pattern=r"^[A-Za-z0-9][A-Za-z0-9_.:-]*$",
    )
    header: str = Field(min_length=1, max_length=12)
    question: str = Field(min_length=1, max_length=500)
    options: list[DecisionOptionIn] = Field(min_length=2, max_length=3)
    recommended_option_id: str | None = Field(default=None, max_length=64)
    allow_custom: bool = False

    @model_validator(mode="after")
    def validate_options(self) -> "DecisionQuestionIn":
        option_ids = [option.id for option in self.options]
        if len(option_ids) != len(set(option_ids)):
            raise ValueError("decision option ids must be unique")
        if (
            self.recommended_option_id is not None
            and self.recommended_option_id not in option_ids
        ):
            raise ValueError("recommended_option_id must name an option")
        if (
            self.recommended_option_id is not None
            and self.recommended_option_id != option_ids[0]
        ):
            raise ValueError("recommended option must be first")
        return self


class DecisionCreateIn(BaseModel):
    title: str = Field(default="需要你的确认", min_length=1, max_length=120)
    project_id: str | None = Field(default=None, max_length=200)
    source: str = Field(default="question", min_length=1, max_length=64)
    questions: list[DecisionQuestionIn] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_questions(self) -> "DecisionCreateIn":
        question_ids = [question.id for question in self.questions]
        if len(question_ids) != len(set(question_ids)):
            raise ValueError("decision question ids must be unique")
        return self


class DecisionAnswerIn(BaseModel):
    question_id: str = Field(min_length=1, max_length=64)
    option_id: str | None = Field(default=None, max_length=64)
    custom_text: str | None = Field(default=None, max_length=500)


class DecisionResolveIn(BaseModel):
    answers: list[DecisionAnswerIn] = Field(min_length=1)


def decision_question_payloads(
    questions: list[DecisionQuestionIn],
) -> list[dict[str, Any]]:
    return [question.model_dump(exclude_none=True) for question in questions]


def decision_answer_payloads(
    answers: list[DecisionAnswerIn],
) -> list[dict[str, Any]]:
    return [answer.model_dump(exclude_none=True) for answer in answers]


def to_chat_scope(model: ChatScopePayload | None) -> ChatScope:
    return ChatScope.from_payload(model.model_dump() if model else None)


def attachment_payloads(
    attachments: list[ChatAttachmentIn],
) -> list[dict[str, Any]]:
    payloads: list[dict[str, Any]] = []
    for attachment in attachments:
        payload = attachment.model_dump(exclude_none=True)
        if payload:
            payloads.append(payload)
    return payloads


__all__ = [
    "ChatAttachmentIn",
    "ChatMessageIn",
    "ChatNotificationIn",
    "ChatScopePayload",
    "ChatSlashCommandIn",
    "ChatUiEventIn",
    "ConversationDeleteIn",
    "DecisionCreateIn",
    "DecisionResolveIn",
    "InboundFrameInvalid",
    "MessageContextUpdateIn",
    "ScopeSetIn",
    "SessionModelGetIn",
    "SessionModelSetIn",
    "attachment_payloads",
    "decision_answer_payloads",
    "decision_question_payloads",
    "parse_inbound_frame",
    "to_chat_scope",
]
