"""Cross-context access checks for Chat API requests."""

from __future__ import annotations

from typing import Any

from ai_anime.modules.ai_assistant.public import ChatScope
from ai_anime.modules.model_usage.public import get_usage_meter
from ai_anime.modules.project_workspace.public import (
    ProjectContext,
    resolve_project_context,
)

_AI_ASSISTANT_CHAT_FEATURE_KEY = "ai_assistant_chat"


async def project_context_for_scope(
    user: dict[str, Any],
    scope: ChatScope,
) -> ProjectContext | None:
    if scope.kind != "project" or not scope.id:
        return None
    return await resolve_project_context(
        user=user,
        project_id=str(scope.id),
        required_role="viewer",
    )


def _requester_user_id(
    user: dict[str, Any],
    project_ctx: ProjectContext | None,
) -> str:
    if project_ctx is not None and project_ctx.requester_user_id:
        return project_ctx.requester_user_id
    user_id = str(user.get("id") or user.get("user_id") or "").strip()
    if user_id:
        return user_id
    return str(user.get("username") or "").strip()


async def require_ai_assistant_access(
    *,
    user: dict[str, Any],
    scope: ChatScope,
) -> ProjectContext | None:
    project_ctx = await project_context_for_scope(user, scope)
    user_id = _requester_user_id(user, project_ctx)
    await get_usage_meter().require_feature_credit_balance(
        user_id=user_id,
        feature_key=_AI_ASSISTANT_CHAT_FEATURE_KEY,
        project_id=str(scope.id or "") if scope.kind == "project" else "",
        resource_kind="chat",
        metadata={"scope": scope.to_dict()},
    )
    return project_ctx


__all__ = ["project_context_for_scope", "require_ai_assistant_access"]
