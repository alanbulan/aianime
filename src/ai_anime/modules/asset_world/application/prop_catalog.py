"""Prop catalog application use cases."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import replace
from pathlib import Path
from typing import Any

from ai_anime.modules.asset_world.application.dto import (
    CreatePropCommand,
    UpdatePropCommand,
)
from ai_anime.modules.asset_world.application.errors import (
    InvalidPropInput,
    PropAlreadyExists,
    PropCatalogRejected,
    PropNotFound,
)
from ai_anime.modules.asset_world.application.ports import (
    EpisodeLocalPropSource,
    PropCatalogAssets,
    PropCatalogRepository,
    PropFactory,
    PropPromotionRepository,
)
from ai_anime.modules.asset_world.domain.prop_catalog import (
    PropCatalogScope,
    includes_global_props,
    includes_local_props,
    normalize_prop_lookup,
    prop_lookup_keys,
)

AssetUrl = Callable[[str | Path], str]


class PropCatalogUseCases:
    def __init__(
        self,
        factory: PropFactory,
        assets: PropCatalogAssets,
        local_props: EpisodeLocalPropSource,
    ) -> None:
        self._factory = factory
        self._assets = assets
        self._local_props = local_props

    async def list_props(
        self,
        *,
        repository: PropCatalogRepository,
        project_dir: Path,
        asset_url: AssetUrl,
        scope: PropCatalogScope = "global",
    ) -> list[dict[str, Any]]:
        props = await repository.list_props()
        global_names = {prop.name for prop in props}
        data: list[dict[str, Any]] = []
        if includes_global_props(scope):
            data.extend(
                self._project_prop(
                    prop,
                    project_dir=project_dir,
                    asset_url=asset_url,
                )
                for prop in props
            )
        if includes_local_props(scope):
            data.extend(
                await self._local_props.list_props(repository, global_names)
            )
        return data

    async def promote_episode_props(
        self,
        *,
        repository: PropPromotionRepository,
        prop_menu: list[Any],
    ) -> list[str]:
        if not repository.available():
            return []

        existing_keys: set[str] = set()
        for prop in await repository.list_props() or []:
            existing_keys.update(
                prop_lookup_keys(
                    getattr(prop, "name", ""),
                    getattr(prop, "aliases", []) or [],
                )
            )

        promoted: list[str] = []
        for item in self._local_props.normalize_menu(prop_menu or []):
            prop_id = str(getattr(item, "prop_id", "") or "").strip()
            lookup = normalize_prop_lookup(prop_id)
            if not lookup or lookup in existing_keys:
                continue

            description = str(getattr(item, "description", "") or "").strip()
            visual_prompt = str(
                getattr(item, "visual_prompt", "") or description or prop_id
            ).strip()
            prop = self._factory.create(
                CreatePropCommand(
                    name=prop_id,
                    prop_type=(
                        str(getattr(item, "prop_type", "") or "").strip()
                        or "object"
                    ),
                    visual_prompt=visual_prompt,
                    description=description,
                    owner=str(
                        getattr(item, "owner_identity_id", "") or ""
                    ).strip(),
                    notes="auto_from_episode_planning",
                )
            )
            await repository.add_prop(prop)
            promoted.append(prop.name)
            existing_keys.add(lookup)
        return promoted

    async def create_prop(
        self,
        *,
        repository: PropCatalogRepository,
        project_dir: Path,
        asset_url: AssetUrl,
        command: CreatePropCommand,
    ) -> dict[str, Any]:
        name = command.name.strip()
        if not name:
            raise InvalidPropInput("Prop name is required")
        if await repository.get_prop(name) is not None:
            raise PropAlreadyExists(f"Prop '{name}' already exists")

        prop = self._factory.create(replace(command, name=name))
        await repository.add_prop(prop)
        return self._project_prop(
            prop,
            project_dir=project_dir,
            asset_url=asset_url,
        )

    async def update_prop(
        self,
        *,
        repository: PropCatalogRepository,
        project_dir: Path,
        asset_url: AssetUrl,
        prop_name: str,
        command: UpdatePropCommand,
    ) -> dict[str, Any]:
        prop = await repository.get_prop(prop_name)
        if prop is None:
            raise PropNotFound(f"Prop '{prop_name}' not found")

        updates = dict(command.fields)
        requested_name = str(updates.pop("name", "") or "").strip()
        if requested_name and requested_name != prop.name:
            if await repository.get_prop(requested_name) is not None:
                raise PropAlreadyExists(
                    f"Prop '{requested_name}' already exists"
                )
            try:
                self._assets.rename_directory(
                    project_dir,
                    prop.name,
                    requested_name,
                )
            except ValueError as exc:
                raise PropCatalogRejected(str(exc)) from exc
            renamed = await repository.rename_prop(prop.name, requested_name)
            if not renamed:
                raise PropCatalogRejected(f"Prop '{prop.name}' rename failed")
            prop = await repository.get_prop(requested_name) or prop

        if updates:
            await repository.update_prop(prop.name, **updates)
            prop = await repository.get_prop(prop.name) or prop

        return self._project_prop(
            prop,
            project_dir=project_dir,
            asset_url=asset_url,
        )

    async def delete_prop(
        self,
        *,
        repository: PropCatalogRepository,
        prop_name: str,
    ) -> dict[str, bool]:
        prop = await repository.get_prop(prop_name)
        if prop is None:
            raise PropNotFound(f"Prop '{prop_name}' not found")
        deleted = await repository.delete_prop(prop.name)
        return {"deleted": bool(deleted)}

    def _project_prop(
        self,
        prop: Any,
        *,
        project_dir: Path,
        asset_url: AssetUrl,
    ) -> dict[str, Any]:
        reference_path = self._assets.reference_path(project_dir, prop.name)
        return {
            "name": prop.name,
            "aliases": prop.aliases,
            "prop_type": prop.prop_type,
            "visual_prompt": prop.visual_prompt,
            "description": prop.description,
            "owner": prop.owner,
            "notes": prop.notes,
            "updated_at": self._assets.updated_at(project_dir, prop),
            "scope": "global",
            "reference_path": reference_path,
            "reference_url": asset_url(reference_path) if reference_path else "",
        }
