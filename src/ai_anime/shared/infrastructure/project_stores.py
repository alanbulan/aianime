"""Factories for project-scoped persistence adapters."""

from __future__ import annotations

from typing import TYPE_CHECKING

from ai_anime.modules.project_workspace.public import ProjectContext, require_project_home_node
from ai_anime.utils.project_paths import ProjectPaths

if TYPE_CHECKING:
    from ai_anime.modules.knowledge_graph import CogneeStore
    from ai_anime.sqlite_store import SQLiteStore


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
