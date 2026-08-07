"""Chat conversation scope."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal, cast

ChatScopeKind = Literal["home", "project", "asset", "task"]
InteractiveChatScopeKind = Literal["home", "project"]


@dataclass(frozen=True)
class ChatScope:
    kind: ChatScopeKind
    id: str | None = None

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
        return cls(kind=cast(ChatScopeKind, kind), id=scope_id)

    def to_dict(self) -> dict[str, str | None]:
        return {"kind": self.kind, "id": self.id}
