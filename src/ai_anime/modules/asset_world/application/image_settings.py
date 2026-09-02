"""Project image source settings and character image usage use cases."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from ai_anime.modules.asset_world.application.errors import (
    ImageModelPrerequisiteMissing,
    InvalidImageSelection,
    UnsupportedImageSourceKind,
)
from ai_anime.modules.asset_world.application.dto import CharacterGenerationOptions
from ai_anime.modules.asset_world.application.ports import (
    ImageUsageReader,
    ProjectImageGenerationSettings,
    ProjectImageSelectionStore,
)
from ai_anime.modules.asset_world.domain.image_settings import (
    ASSET_IMAGE_SELECTION_CONFIG_KEYS,
    CHARACTER_IMAGE_SELECTION_CONFIG_KEY,
    CHARACTER_IMAGE_USAGE_TASK_TYPES,
    AssetImageKind,
    character_generation_ethnicity,
    character_generation_style,
    normalize_asset_image_kind,
    stored_project_style,
)
from ai_anime.modules.model_usage.public import (
    resolve_model_for_role,
    resolve_model_route,
)


def resolve_image_model(
    requested_model: str | None,
    *,
    fallback_role: str = "IMAGE_GENERATION",
) -> str:
    """Only an explicit request pins a model; omitted models use global routing."""
    requested = str(requested_model or "").strip()
    if requested:
        return requested
    try:
        return resolve_model_for_role(fallback_role)
    except PermissionError as exc:
        raise ImageModelPrerequisiteMissing(fallback_role) from exc


class ImageSettingsUseCases:
    def __init__(
        self,
        store: ProjectImageSelectionStore,
        generation_settings: ProjectImageGenerationSettings,
        usage: ImageUsageReader,
    ) -> None:
        self._store = store
        self._generation_settings = generation_settings
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
        return {
            "character_image_selection": self._store.get(
                username,
                project,
                CHARACTER_IMAGE_SELECTION_CONFIG_KEY,
            ).strip(),
        }

    def update_character_selection(
        self,
        username: str,
        project: str,
        selection: str,
    ) -> dict[str, Any]:
        normalized = str(selection or "").strip()
        if not normalized:
            raise InvalidImageSelection("character image model is required")
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
            # Scene and prop generation use the project's character image model
            # until the user explicitly overrides that asset kind.  Keeping this
            # fallback in the application layer gives every selector and task
            # submission the same effective default instead of leaving some
            # screens with an empty model.
            selection = (
                saved
                or self.get_character_selection(username, project)[
                    "character_image_selection"
                ]
            )
        return {
            "asset_kind": asset_kind,
            "image_source_selection": selection,
        }

    def update_asset_selection(
        self,
        username: str,
        project: str,
        asset_kind: AssetImageKind,
        selection: str,
    ) -> dict[str, Any]:
        normalized = str(selection or "").strip()
        if not normalized:
            raise InvalidImageSelection("asset image model is required")
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
        *,
        fallback_role: str = "IMAGE_GENERATION",
    ) -> str:
        return resolve_image_model(requested_model, fallback_role=fallback_role)

    def character_generation_options(
        self,
        username: str,
        project: str,
        *,
        requested_style: str | None,
        requested_model: str | None,
        requested_ethnicity: str | None = None,
        fallback_role: str = "IMAGE_GENERATION",
    ) -> CharacterGenerationOptions:
        config = self._generation_settings.effective(username, project)
        selection = self.resolve_character_model(
            username,
            project,
            requested_model,
            fallback_role=fallback_role,
        )
        model_route = resolve_model_route(selection)
        if not model_route.model:
            raise InvalidImageSelection("character image model is required")
        return CharacterGenerationOptions(
            style=character_generation_style(config, requested_style),
            ethnicity=character_generation_ethnicity(
                config,
                requested_ethnicity,
            ),
            model=model_route.model,
            model_selector=model_route.selector,
        )

    def project_style(self, username: str, project: str) -> str:
        return stored_project_style(self._generation_settings.stored(username, project))

    def get_character_usage(self, project_dir: str | Path) -> dict[str, Any]:
        return self._usage.summary(
            project_dir,
            task_types=CHARACTER_IMAGE_USAGE_TASK_TYPES,
        )
