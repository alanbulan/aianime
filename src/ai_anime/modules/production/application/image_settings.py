"""Production image settings application use cases."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from ai_anime.modules.model_usage.public import resolve_model_for_role
from ai_anime.modules.production.application.ports import (
    ProductionImageModelPolicy,
    ProductionSettingsRepository,
)


@dataclass(frozen=True)
class UpdateRenderImageSettingsCommand:
    render_image_selection: str | None = None
    sketch_aspect_padding: bool | None = None


@dataclass(frozen=True)
class UpdateSketchImageSettingsCommand:
    sketch_image_selection: str | None = None


class ProductionImageSettingsRejected(Exception):
    pass


class ProductionImageSettingsUseCases:
    def __init__(
        self,
        repository: ProductionSettingsRepository,
        models: ProductionImageModelPolicy,
    ) -> None:
        self._repository = repository
        self._models = models

    def render_settings(self, username: str, project: str) -> dict[str, Any]:
        config = self._repository.load(username, project)
        return {
            "render_image_selection": self._models.normalize(
                config.get("render_image_selection")
            ),
            "sketch_aspect_padding": self.resolve_sketch_aspect_padding(
                config,
                None,
            ),
        }

    def update_render_settings(
        self,
        username: str,
        project: str,
        command: UpdateRenderImageSettingsCommand,
    ) -> dict[str, Any]:
        updates: dict[str, Any] = {}
        if command.render_image_selection is not None:
            selection = self._models.normalize(command.render_image_selection)
            if not selection:
                raise ProductionImageSettingsRejected(
                    "render_image_selection must be a non-empty platform SKU"
                )
            updates["render_image_selection"] = selection
        if command.sketch_aspect_padding is not None:
            updates["sketch_aspect_padding"] = bool(
                command.sketch_aspect_padding
            )
        if updates:
            self._repository.save(username, project, updates)
        return self.render_settings(username, project)

    def sketch_settings(self, username: str, project: str) -> dict[str, Any]:
        config = self._repository.load(username, project)
        return {
            "sketch_image_selection": self._models.normalize(
                config.get("sketch_image_selection")
            ),
        }

    def update_sketch_settings(
        self,
        username: str,
        project: str,
        command: UpdateSketchImageSettingsCommand,
    ) -> dict[str, Any]:
        updates: dict[str, Any] = {}
        if command.sketch_image_selection is not None:
            selection = self._models.normalize(command.sketch_image_selection)
            if not selection:
                raise ProductionImageSettingsRejected(
                    "sketch_image_selection must be a non-empty platform SKU"
                )
            updates["sketch_image_selection"] = selection
        if updates:
            self._repository.save(username, project, updates)
        return self.sketch_settings(username, project)

    def resolve_render_selection(
        self,
        project_config: dict[str, Any],
        requested_selection: str | None = None,
    ) -> str:
        return self._resolve_runtime_selection(
            requested_selection,
            project_config.get("render_image_selection"),
        )

    def resolve_sketch_selection(
        self,
        project_config: dict[str, Any],
        requested_selection: str | None = None,
    ) -> str:
        return self._resolve_runtime_selection(
            requested_selection,
            project_config.get("sketch_image_selection"),
        )

    def resolve_project_sketch_selection(
        self,
        username: str,
        project: str,
        requested_selection: str | None = None,
    ) -> str:
        return self.resolve_sketch_selection(
            self._repository.load(username, project),
            requested_selection,
        )

    def _resolve_runtime_selection(
        self,
        requested_selection: str | None,
        configured_selection: Any,
    ) -> str:
        requested = self._models.normalize(requested_selection)
        if requested:
            return requested
        configured = self._models.normalize(configured_selection)
        if configured:
            return configured
        try:
            return self._models.normalize(resolve_model_for_role("IMAGE_EDIT"))
        except PermissionError:
            return ""

    @staticmethod
    def resolve_sketch_aspect_padding(
        project_config: dict[str, Any],
        requested_value: bool | None,
    ) -> bool:
        if requested_value is not None:
            return bool(requested_value)
        return bool(project_config.get("sketch_aspect_padding", True))
