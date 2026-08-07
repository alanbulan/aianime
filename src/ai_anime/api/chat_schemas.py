"""Inbound schemas and payload mapping for Chat endpoints."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel

from ai_anime.modules.ai_assistant.public import (
    ChatScope,
    InteractiveChatScopeKind,
)


class ChatScopePayload(BaseModel):
    kind: InteractiveChatScopeKind = "home"
    id: str | None = None


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
    "ScopeSetIn",
    "attachment_payloads",
    "to_chat_scope",
]
