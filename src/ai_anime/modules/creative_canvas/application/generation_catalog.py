"""Generation catalog queries for Creative Canvas."""

from __future__ import annotations

from copy import deepcopy
from typing import Any, Protocol


class GenerationCatalogSource(Protocol):
    def image_camera_options(self) -> dict[str, Any]: ...

    def image_style_templates(self) -> list[dict[str, Any]]: ...

    def video_camera_templates(self) -> list[dict[str, Any]]: ...


class GenerationCatalogQueries:
    def __init__(self, source: GenerationCatalogSource) -> None:
        self._source = source

    def image_camera_options(self) -> dict[str, Any]:
        return deepcopy(self._source.image_camera_options())

    def image_style_templates(self) -> list[dict[str, Any]]:
        return deepcopy(self._source.image_style_templates())

    def video_camera_templates(self) -> list[dict[str, Any]]:
        return deepcopy(self._source.video_camera_templates())
