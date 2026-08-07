"""Factories for project-scoped persistence adapters."""

from __future__ import annotations

import asyncio
from contextvars import ContextVar, Token
from typing import TYPE_CHECKING

from ai_anime.modules.project_workspace.public import ProjectContext, require_project_home_node
from ai_anime.shared.utils.project_paths import ProjectPaths

if TYPE_CHECKING:
    from ai_anime.modules.knowledge_graph import CogneeStore
    from ai_anime.sqlite_store import SQLiteStore


# Request-scoped SQLiteStore registry. Legacy project routes open stores via
# ``make_sqlite_store_for_context`` without closing them, which leaks aiosqlite
# connections on the long-lived desktop process. Stores created by the HTTP
# request task are registered here and closed once the response completes (see
# ``api/middleware/request_store_close.py``).
#
# Background tasks spawned during a request (inline task runners) inherit this
# context, so registration is gated on the request owner task id: only the task
# that began tracking may register, and background runners are never closed out
# from under them (they manage their own lifecycle).
_REQUEST_STORE_OWNER_TASK: ContextVar[int | None] = ContextVar(
    "request_store_owner_task",
    default=None,
)
_REQUEST_SQLITE_STORES: ContextVar[list["SQLiteStore"]] = ContextVar(
    "request_sqlite_stores",
    default=[],
)


def begin_request_store_tracking() -> tuple[
    Token[int | None],
    Token[list["SQLiteStore"]],
]:
    """Start collecting stores for the current HTTP request."""
    task = asyncio.current_task()
    owner_token = _REQUEST_STORE_OWNER_TASK.set(id(task) if task else None)
    stores_token = _REQUEST_SQLITE_STORES.set([])
    return owner_token, stores_token


def end_request_store_tracking(
    tokens: tuple[Token[int | None], Token[list["SQLiteStore"]]],
) -> list["SQLiteStore"]:
    """Stop collecting and return every store opened by the request task."""
    owner_token, stores_token = tokens
    stores = list(_REQUEST_SQLITE_STORES.get())
    _REQUEST_SQLITE_STORES.reset(stores_token)
    _REQUEST_STORE_OWNER_TASK.reset(owner_token)
    return stores


def register_request_store(store: "SQLiteStore") -> None:
    """Register a store for request-end closing (no-op outside an HTTP request)."""
    task = asyncio.current_task()
    if task is None:
        return
    if _REQUEST_STORE_OWNER_TASK.get() != id(task):
        return
    stores = _REQUEST_SQLITE_STORES.get()
    if stores is None:
        return
    stores.append(store)


async def make_cognee_store(username: str, project: str) -> CogneeStore:
    from ai_anime.modules.knowledge_graph import CogneeStore

    paths = ProjectPaths(username, project)
    store = CogneeStore(
        f"{username}/{project}",
        output_dir=str(paths.output_dir),
        state_dir=str(paths.state_dir),
    )
    await store.initialize()
    return store


async def make_sqlite_store(username: str, project: str) -> SQLiteStore:
    from ai_anime.sqlite_store import SQLiteStore

    paths = ProjectPaths(username, project)
    store = SQLiteStore(
        f"{username}/{project}",
        output_dir=str(paths.output_dir),
        state_dir=str(paths.state_dir),
    )
    await store.initialize()
    await store.load_graph_state()
    register_request_store(store)
    return store


async def make_sqlite_store_for_context(ctx: ProjectContext) -> SQLiteStore:
    from ai_anime.sqlite_store import SQLiteStore

    require_project_home_node(ctx, operation="open project SQLite store")
    store = SQLiteStore(
        ctx.owner_project_label,
        output_dir=str(ctx.output_dir),
        state_dir=str(ctx.state_dir),
    )
    await store.initialize()
    await store.load_graph_state()
    register_request_store(store)
    return store


async def make_cognee_store_for_context(
    ctx: ProjectContext,
    *,
    text_model: str | None = None,
    embedding_model: str | None = None,
    embedding_dimensions: int | None = None,
    load_graph_state: bool = False,
) -> CogneeStore:
    from ai_anime.modules.knowledge_graph import CogneeStore

    require_project_home_node(ctx, operation="open project graph store")
    store = CogneeStore(
        ctx.owner_project_label,
        output_dir=str(ctx.output_dir),
        state_dir=str(ctx.state_dir),
        text_model=text_model,
        embedding_model=embedding_model,
        embedding_dimensions=embedding_dimensions,
    )
    await store.initialize()
    if load_graph_state:
        await store.load_graph_state()
    return store


__all__ = [
    "make_cognee_store",
    "make_cognee_store_for_context",
    "make_sqlite_store",
    "make_sqlite_store_for_context",
]
