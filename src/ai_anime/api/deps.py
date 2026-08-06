"""Project-scoped FastAPI dependencies."""

from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, AsyncIterator

from fastapi import Depends

from ai_anime.api.auth import get_api_user
from ai_anime.modules.project_workspace.public import (
    ProjectContext,
    require_project_home_node,
    resolve_project_context,
)
from ai_anime.shared.infrastructure.project_stores import (
    make_cognee_store,
    make_cognee_store_for_context,
    make_sqlite_store,
    make_sqlite_store_for_context,
)
from ai_anime.shared.project_media import (
    make_project_static_url as make_project_static_url,
    make_static_url_for_context as make_static_url_for_context,
)

if TYPE_CHECKING:
    from ai_anime.modules.knowledge_graph import CogneeStore
    from ai_anime.sqlite_store import SQLiteStore


@dataclass(frozen=True)
class ProjectResolution:
    """Resolved project scope for project_id-based API routes."""

    ctx: ProjectContext
    username: str
    project_name: str
    project_dir: Path
    output_dir: str
    state_dir: str
    runtime_dir: str


async def resolve_project_scope(
    project: str,
    user: dict,
    *,
    required_role: str = "viewer",
    operation: str = "resolve project files",
) -> ProjectResolution:
    """Resolve a route project_id to ProjectContext-backed local paths."""
    ctx = await resolve_project_context(
        user=user,
        project_id=project,
        required_role=required_role,
    )
    require_project_home_node(ctx, operation=operation)
    return ProjectResolution(
        ctx=ctx,
        username=ctx.owner_username,
        project_name=ctx.project_name,
        project_dir=Path(ctx.output_dir),
        output_dir=str(ctx.output_dir),
        state_dir=str(ctx.state_dir),
        runtime_dir=str(ctx.runtime_dir),
    )


async def _make_cognee_store_scope(
    username: str, project: str
) -> AsyncIterator["CogneeStore"]:
    store = await make_cognee_store(username, project)
    try:
        yield store
    finally:
        close = getattr(store, "close", None)
        if close:
            await close()


async def _make_sqlite_store_scope(
    username: str, project: str
) -> AsyncIterator["SQLiteStore"]:
    store = await make_sqlite_store(username, project)
    try:
        yield store
    finally:
        close = getattr(store, "close", None)
        if close:
            await close()


sqlite_store_scope = asynccontextmanager(_make_sqlite_store_scope)
cognee_store_scope = asynccontextmanager(_make_cognee_store_scope)


async def get_sqlite_store(
    project: str,
    user: dict = Depends(get_api_user),
) -> AsyncIterator["SQLiteStore"]:
    """FastAPI dependency: 当前 project_id 作用域的 SQLiteStore。"""
    ctx = await resolve_project_context(
        user=user,
        project_id=project,
        required_role="viewer",
    )
    store = await make_sqlite_store_for_context(ctx)
    try:
        yield store
    finally:
        close = getattr(store, "close", None)
        if close:
            await close()


async def get_cognee_store(
    project: str,
    user: dict = Depends(get_api_user),
) -> AsyncIterator["CogneeStore"]:
    """FastAPI dependency: 当前 project_id 作用域的 CogneeStore。"""
    ctx = await resolve_project_context(
        user=user,
        project_id=project,
        required_role="viewer",
    )
    store = await make_cognee_store_for_context(ctx)
    try:
        yield store
    finally:
        close = getattr(store, "close", None)
        if close:
            await close()


async def get_project_context_dependency(
    project_id: str,
    user: dict = Depends(get_api_user),
) -> ProjectContext:
    return await resolve_project_context(user=user, project_id=project_id)
