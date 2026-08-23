"""Local adapters for the prop catalog."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from ai_anime.modules.production.public import collect_prop_marker_ids_from_beat
from ai_anime.modules.asset_world.application.prop_models import NovelProp
from ai_anime.modules.narrative_planning.public import build_prop_menu
from ai_anime.modules.asset_world.application.dto import CreatePropCommand
from ai_anime.modules.asset_world.application.ports import PropCatalogRepository
from ai_anime.modules.asset_world.domain.asset_names import move_asset_dir
from ai_anime.modules.asset_world.infrastructure.asset_metadata import (
    newest_updated_at,
    tree_updated_at,
    utc_iso,
)
from ai_anime.shared.utils.path_resolver import compute_prop_reference_path


class NovelPropFactory:
    def create(self, command: CreatePropCommand) -> NovelProp:
        return NovelProp(
            name=command.name,
            aliases=list(command.aliases),
            prop_type=command.prop_type,
            visual_prompt=command.visual_prompt,
            description=command.description,
            owner=command.owner,
            notes=command.notes,
        )


class LocalPropCatalogAssets:
    def reference_path(self, project_dir: Path, prop_name: str) -> str:
        return compute_prop_reference_path(project_dir, prop_name)

    def updated_at(self, project_dir: Path, prop: Any) -> str:
        return newest_updated_at(
            getattr(prop, "updated_at", ""),
            tree_updated_at(project_dir / "assets" / "props" / prop.name),
        )

    def rename_directory(
        self,
        project_dir: Path,
        old_name: str,
        new_name: str,
    ) -> None:
        move_asset_dir(
            project_dir / "assets" / "props",
            old_name,
            new_name,
        )


class NovelEpisodeLocalPropSource:
    def normalize_menu(self, prop_menu: list[Any]) -> list[Any]:
        return build_prop_menu(prop_menu=prop_menu or [])

    def episode_menu(self, episode: Any) -> list[dict[str, Any]]:
        if episode is None:
            return []
        return [
            dict(item) if isinstance(item, dict) else item.model_dump()
            for item in (getattr(episode, "prop_menu", []) or [])
        ]

    def marker_prop_ids(self, beats: list[dict[str, Any]]) -> list[str]:
        marked_prop_ids: list[str] = []
        for beat in beats or []:
            for prop_id in collect_prop_marker_ids_from_beat(beat):
                if prop_id and prop_id not in marked_prop_ids:
                    marked_prop_ids.append(prop_id)
        return marked_prop_ids

    async def list_props(
        self,
        repository: PropCatalogRepository,
        global_prop_names: set[str],
    ) -> list[dict[str, Any]]:
        list_episodes = getattr(repository, "list_episodes", None)
        if not callable(list_episodes):
            return []
        try:
            episodes = await list_episodes()
        except Exception:
            return []

        payloads: list[dict[str, Any]] = []
        seen_local: set[tuple[int, str]] = set()
        for episode in episodes or []:
            episode_number = int(getattr(episode, "number", 0) or 0)
            episode_updated_at = utc_iso(getattr(episode, "updated_at", ""))
            menu = self.normalize_menu(
                getattr(episode, "prop_menu", []) or []
            )
            for menu_item in menu:
                prop_id = str(menu_item.prop_id or "").strip()
                if not prop_id or prop_id in global_prop_names:
                    continue
                key = (episode_number, prop_id)
                if key in seen_local:
                    continue
                seen_local.add(key)
                payloads.append(
                    {
                        "name": prop_id,
                        "aliases": [],
                        "prop_type": menu_item.prop_type,
                        "visual_prompt": menu_item.visual_prompt,
                        "description": menu_item.description,
                        "owner": menu_item.owner_identity_id,
                        "notes": "",
                        "updated_at": episode_updated_at,
                        "scope": "local",
                        "source_episode": episode_number,
                        "reference_path": "",
                        "reference_url": "",
                    }
                )
        return payloads


class LocalPropPromotionRepository:
    def __init__(self, store: Any) -> None:
        self._store = store
        self._repository = getattr(store, "sqlite_store", None) or store

    def available(self) -> bool:
        return callable(getattr(self._repository, "list_props", None)) and callable(
            getattr(self._repository, "add_prop", None)
        )

    async def list_props(self) -> list[Any]:
        return list(await self._repository.list_props() or [])

    async def add_prop(self, prop: Any) -> Any:
        result = await self._repository.add_prop(prop)
        cache = getattr(self._store, "_props", None)
        if isinstance(cache, dict):
            cache[prop.name] = prop
        return result


class LocalCachedPropRepository:
    def __init__(self, store: Any) -> None:
        self._store = store

    def available(self) -> bool:
        return callable(getattr(self._store, "get_cached_prop", None))

    def get_cached_prop(self, prop_id: str) -> Any | None:
        return self._store.get_cached_prop(prop_id)
