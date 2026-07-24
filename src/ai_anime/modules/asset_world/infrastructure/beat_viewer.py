"""Local project adapters for Beat viewer read use cases."""

from __future__ import annotations

from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from ai_anime.modules.asset_world.application.ports import BeatViewerStore
from ai_anime.modules.asset_world.application.prop_catalog import PropCatalogUseCases
from ai_anime.modules.asset_world.infrastructure.prop_catalog import (
    LocalCachedPropRepository,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.shared import project_media
from ai_anime.shared.infrastructure import project_stores


class SqliteBeatViewerWorkspace:
    @asynccontextmanager
    async def session(
        self,
        context: ProjectContext,
    ) -> AsyncIterator[BeatViewerStore]:
        store = await project_stores.make_sqlite_store_for_context(context)
        try:
            yield store
        finally:
            await store.close()


class CompatibleBeatViewerEpisodeSource:
    def episode_or_none(
        self,
        store: BeatViewerStore,
        episode_num: int,
    ) -> Any | None:
        get_episode = getattr(store, "get_episode", None)
        if get_episode is None:
            return None
        try:
            return get_episode(int(episode_num))
        except Exception:
            return None


class AssetWorldBeatViewerRuntimePropMenuSource:
    def __init__(self, prop_catalog: PropCatalogUseCases) -> None:
        self._prop_catalog = prop_catalog

    def for_episode(
        self,
        store: BeatViewerStore,
        episode: Any,
        beats: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        return self._prop_catalog.runtime_episode_prop_menu(
            repository=LocalCachedPropRepository(store),
            episode=episode,
            beats=beats,
        )


class ProjectBeatViewerMediaUrls:
    def asset_url(
        self,
        context: ProjectContext,
    ) -> Callable[[str | Path], str]:
        return project_media.make_project_asset_url_builder(
            context,
            context.output_dir,
            project_media.make_project_static_url,
        )


__all__ = [
    "AssetWorldBeatViewerRuntimePropMenuSource",
    "CompatibleBeatViewerEpisodeSource",
    "ProjectBeatViewerMediaUrls",
    "SqliteBeatViewerWorkspace",
]
