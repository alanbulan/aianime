"""Identity values and local desktop-session encoding."""

from __future__ import annotations

from base64 import urlsafe_b64decode, urlsafe_b64encode
from dataclasses import dataclass
from enum import Enum
from typing import Any


class AuthFailureReason(str, Enum):
    MISSING = "missing"
    INVALID = "invalid"
    REVOKED = "revoked"
    EXPIRED = "expired"
    USER_SUSPENDED = "suspended"


class AuthError(Exception):
    def __init__(self, reason: AuthFailureReason, detail: str = "") -> None:
        self.reason = reason
        self.detail = detail
        super().__init__(f"{reason.value}: {detail}" if detail else reason.value)


@dataclass(frozen=True)
class AuthenticatedUser:
    id: str
    username: str
    role: str
    status: str = "active"

    def to_legacy_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "user_id": self.id,
            "username": self.username,
            "role": self.role,
        }


@dataclass(frozen=True)
class AgentAuthenticatedUser(AuthenticatedUser):
    agent_session_id: str = ""
    agent_kind: str = "agent"
    worker_id: str | None = None
    scopes: tuple[str, ...] = ()
    current_scope_kind: str = "home"
    current_project_id: str | None = None
    parent_session_id: str | None = None

    def to_legacy_dict(self) -> dict[str, Any]:
        data = super().to_legacy_dict()
        data.update(
            {
                "credential_kind": "agent_session",
                "agent_session_id": self.agent_session_id,
                "agent_kind": self.agent_kind,
                "worker_id": self.worker_id,
                "scopes": list(self.scopes),
                "current_scope_kind": self.current_scope_kind,
                "current_project_id": self.current_project_id,
                "parent_session_id": self.parent_session_id,
            }
        )
        return data


@dataclass(frozen=True)
class AgentSessionToken:
    value: str
    session_id: str
    user: str
    scopes: tuple[str, ...]
    exp: int
    worker_id: str
    agent_kind: str = "agent"


def create_desktop_session(username: str) -> str:
    encoded = urlsafe_b64encode(username.encode("utf-8")).decode("ascii").rstrip("=")
    return f"desktop.{encoded}"


def desktop_session_username(raw_cookie: str | None) -> str | None:
    if not raw_cookie or not raw_cookie.startswith("desktop."):
        return None
    encoded = raw_cookie.removeprefix("desktop.")
    try:
        value = urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)).decode("utf-8")
    except (UnicodeDecodeError, ValueError):
        return None
    value = value.strip()
    return value if 0 < len(value) <= 128 else None
