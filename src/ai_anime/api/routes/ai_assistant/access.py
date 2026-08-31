"""Cross-context access checks for Chat API requests."""

from __future__ import annotations

from typing import Any

from ai_anime.modules.ai_assistant.public import ChatScope
from ai_anime.modules.project_workspace.public import (
    ProjectContext,
    resolve_project_context,
)

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


async def require_ai_assistant_access(
    *,
    user: dict[str, Any],
    scope: ChatScope,
) -> ProjectContext | None:
    return await project_context_for_scope(user, scope)


__all__ = ["project_context_for_scope", "require_ai_assistant_access"]
