"""Process-local attribution context for model usage instrumentation."""

from __future__ import annotations

import contextvars
from typing import Any, Optional

_PROJECT_CTX: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "ai_anime_project_id", default=None
)
_USER_CTX: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "ai_anime_llm_user_id", default=None
)
_RESOURCE_KIND_CTX: contextvars.ContextVar[str] = contextvars.ContextVar(
    "ai_anime_llm_resource_kind", default=""
)
_BILLING_METADATA_CTX: contextvars.ContextVar[dict[str, Any]] = contextvars.ContextVar(
    "ai_anime_billing_metadata", default={}
)
_CREDIT_RESERVATION_STACK: contextvars.ContextVar[tuple[str, ...]] = (
    contextvars.ContextVar(
        "st_credit_reservation_stack",
        default=(),
    )
)
_MODEL_CALL_RESERVATION_ACTIVE: contextvars.ContextVar[bool] = contextvars.ContextVar(
    "st_agent_credit_reservation_active",
    default=False,
)

_ALLOWED_RESOURCE_KINDS = frozenset(
    {"portrait", "sketch", "render", "video", "tts", "script", "ingest"}
)


def set_project_context(project_id: Optional[str]) -> None:
    _PROJECT_CTX.set(project_id or None)


def get_project_context() -> Optional[str]:
    return _PROJECT_CTX.get()


def get_llm_user_context() -> Optional[str]:
    return _USER_CTX.get()


def get_resource_kind_context() -> str:
    return _RESOURCE_KIND_CTX.get()


def get_billing_metadata_context() -> dict[str, Any]:
    return dict(_BILLING_METADATA_CTX.get() or {})


def clear_llm_usage_context() -> None:
    _USER_CTX.set(None)
    set_project_context(None)
    _RESOURCE_KIND_CTX.set("")
    _BILLING_METADATA_CTX.set({})


def set_llm_usage_context(
    user_id: Optional[str],
    project_id: Optional[str] = None,
    resource_kind: str = "",
    billing_metadata: Optional[dict[str, Any]] = None,
) -> None:
    _USER_CTX.set(user_id)
    set_project_context(project_id)
    kind = resource_kind if resource_kind in _ALLOWED_RESOURCE_KINDS else ""
    _RESOURCE_KIND_CTX.set(kind)
    _BILLING_METADATA_CTX.set(dict(billing_metadata or {}))


def push_credit_reservation(reservation_id: str) -> None:
    if not reservation_id:
        return
    stack = _CREDIT_RESERVATION_STACK.get()
    _CREDIT_RESERVATION_STACK.set((*stack, reservation_id))


def pop_credit_reservation() -> str:
    stack = _CREDIT_RESERVATION_STACK.get()
    if not stack:
        return ""
    reservation_id = stack[-1]
    _CREDIT_RESERVATION_STACK.set(stack[:-1])
    return reservation_id


def model_call_reservation_active() -> bool:
    return _MODEL_CALL_RESERVATION_ACTIVE.get()


def set_model_call_reservation_active(active: bool) -> contextvars.Token:
    return _MODEL_CALL_RESERVATION_ACTIVE.set(active)


def reset_model_call_reservation_active(token: contextvars.Token) -> None:
    _MODEL_CALL_RESERVATION_ACTIVE.reset(token)
