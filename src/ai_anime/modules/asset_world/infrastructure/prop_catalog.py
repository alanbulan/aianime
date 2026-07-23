"""Local adapters for the prop catalog."""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any

from ai_anime.models import NovelProp, build_prop_menu
from ai_anime.modules.asset_world.application.dto import CreatePropCommand
from ai_anime.modules.asset_world.application.ports import PropCatalogRepository
from ai_anime.modules.asset_world.infrastructure.asset_metadata import (
    newest_updated_at,
    tree_updated_at,
    utc_iso,
)
from ai_anime.utils.path_resolver import compute_prop_reference_path


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
        old_dir = project_dir / "assets" / "props" / old_name
        new_dir = project_dir / "assets" / "props" / new_name
        if not old_dir.exists():
            return
        if new_dir.exists():
            raise ValueError(f"Target asset directory already exists: {new_dir}")
        new_dir.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(old_dir), str(new_dir))


class NovelEpisodeLocalPropSource:
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
            menu = build_prop_menu(
                prop_menu=getattr(episode, "prop_menu", []) or []
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
