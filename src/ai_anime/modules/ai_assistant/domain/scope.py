"""Chat conversation scope."""

from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Any, Literal, cast

ChatScopeKind = Literal["home", "project", "asset", "task"]
InteractiveChatScopeKind = Literal["home", "project"]


@dataclass(frozen=True)
class ChatScope:
    kind: ChatScopeKind
    id: str | None = None
    conversation_id: str = "main"

    @classmethod
    def from_payload(cls, payload: dict[str, Any] | None) -> "ChatScope":
        payload = payload or {"kind": "home"}
        kind = str(payload.get("kind") or "home")
        if kind not in {"home", "project"}:
            raise ValueError(f"unsupported chat scope: {kind}")
        raw_id = payload.get("id")
        scope_id = str(raw_id).strip() if raw_id is not None else None
        if kind == "home":
            scope_id = None
        if kind != "home" and not scope_id:
            raise ValueError(f"scope id is required for {kind}")
        raw_conversation_id = payload.get(
            "conversationId",
            payload.get("conversation_id", "main"),
        )
        conversation_id = str(raw_conversation_id or "main").strip() or "main"
        if re.fullmatch(r"[A-Za-z0-9_-]{1,64}", conversation_id) is None:
            raise ValueError("invalid conversation id")
        return cls(
            kind=cast(ChatScopeKind, kind),
            id=scope_id,
            conversation_id=conversation_id,
        )

    def to_dict(self) -> dict[str, str | None]:
        return {
            "kind": self.kind,
            "id": self.id,
            "conversationId": self.conversation_id,
        }
