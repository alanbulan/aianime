"""Project image source settings and character image usage use cases."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from ai_anime.modules.asset_world.application.errors import (
    InvalidImageSelection,
    UnsupportedImageSourceKind,
)
from ai_anime.modules.asset_world.application.ports import (
    ImageSelectionCatalog,
    ImageUsageReader,
    ProjectImageSelectionStore,
)
from ai_anime.modules.asset_world.domain.image_settings import (
    ASSET_IMAGE_SELECTION_CONFIG_KEYS,
    CHARACTER_IMAGE_SELECTION_CONFIG_KEY,
    CHARACTER_IMAGE_USAGE_TASK_TYPES,
    AssetImageKind,
    normalize_asset_image_kind,
)


class ImageSettingsUseCases:
    def __init__(
        self,
        catalog: ImageSelectionCatalog,
        store: ProjectImageSelectionStore,
        usage: ImageUsageReader,
    ) -> None:
        self._catalog = catalog
        self._store = store
        self._usage = usage

    @staticmethod
    def normalize_asset_kind(asset_kind: str) -> AssetImageKind:
        normalized = normalize_asset_image_kind(asset_kind)
        if normalized is None:
            raise UnsupportedImageSourceKind(
                f"Unsupported image source kind: {asset_kind}"
            )
        return normalized

    def get_character_selection(self, username: str, project: str) -> dict[str, Any]:
        options = dict(self._catalog.character_options())
        saved = self._store.get(
            username,
            project,
            CHARACTER_IMAGE_SELECTION_CONFIG_KEY,
        ).strip()
        selection = self._effective_character_selection(saved, options)
        return {
            "character_image_selection": selection,
            "options": options,
        }

    def update_character_selection(
        self,
        username: str,
        project: str,
        selection: str,
    ) -> dict[str, Any]:
        normalized = str(selection or "").strip()
        if normalized not in self._catalog.character_options():
            raise InvalidImageSelection(
                f"Invalid character_image_selection: {normalized}"
            )
        self._store.set(
            username,
            project,
            CHARACTER_IMAGE_SELECTION_CONFIG_KEY,
            normalized,
        )
        return self.get_character_selection(username, project)

    def get_asset_selection(
        self,
        username: str,
        project: str,
        asset_kind: AssetImageKind,
    ) -> dict[str, Any]:
        options = dict(self._catalog.asset_options())
        if asset_kind == "character":
            selection = self.get_character_selection(username, project)[
                "character_image_selection"
            ]
        else:
            saved = self._store.get(
                username,
                project,
                ASSET_IMAGE_SELECTION_CONFIG_KEYS[asset_kind],
            ).strip()
            selection = self._catalog.normalize_asset_selection(saved)
        return {
            "asset_kind": asset_kind,
            "image_source_selection": selection,
            "options": options,
        }

    def update_asset_selection(
        self,
        username: str,
        project: str,
        asset_kind: AssetImageKind,
        selection: str,
    ) -> dict[str, Any]:
        normalized = str(selection or "").strip()
        if normalized not in self._catalog.asset_options():
            raise InvalidImageSelection(f"Invalid image_source_selection: {normalized}")
        self._store.set(
            username,
            project,
            ASSET_IMAGE_SELECTION_CONFIG_KEYS[asset_kind],
            normalized,
        )
        return self.get_asset_selection(username, project, asset_kind)

    def resolve_character_model(
        self,
        username: str,
        project: str,
        requested_model: str | None,
    ) -> str:
        requested = str(requested_model or "").strip()
        if requested:
            return requested
        return str(
            self.get_character_selection(username, project)["character_image_selection"]
        )

    def get_character_usage(self, project_dir: str | Path) -> dict[str, Any]:
        return self._usage.summary(
            project_dir,
            task_types=CHARACTER_IMAGE_USAGE_TASK_TYPES,
        )

    def _effective_character_selection(
        self,
        saved: str,
        options: dict[str, str],
    ) -> str:
        if saved in options:
            return saved
        normalized = self._catalog.normalize_character_selection(saved)
        if normalized in options:
            return normalized
        return self._catalog.default_character_selection()
