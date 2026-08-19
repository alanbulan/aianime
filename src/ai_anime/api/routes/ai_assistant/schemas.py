"""Inbound schemas and payload mapping for Chat endpoints."""

from __future__ import annotations

from typing import Any, TypeVar

from pydantic import BaseModel, Field, ValidationError

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
    "ChatUiEventIn",
    "ConversationDeleteIn",
    "InboundFrameInvalid",
    "ScopeSetIn",
    "attachment_payloads",
    "parse_inbound_frame",
    "to_chat_scope",
]
