"""Ports required by Production use cases."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Protocol


class SketchPoseFiles(Protocol):
    def image_size(self, image_path: Path) -> tuple[int, int]: ...

    def save_editor_state(
        self,
        image_path: Path,
        editor_state: dict[str, Any],
    ) -> None: ...


class SketchPoseIdentitySource(Protocol):
    def detected_identity_ids(self, beat: dict[str, Any]) -> list[str]: ...


class SketchImageFiles(Protocol):
    def image_size(self, image_path: Path) -> tuple[int, int]: ...

    def crop(
        self,
        image_path: Path,
        bounds: tuple[int, int, int, int],
    ) -> None: ...


class ProductionImageSettingsRepository(Protocol):
    def load(self, username: str, project: str) -> dict[str, Any]: ...

    def save(
        self,
        username: str,
        project: str,
        updates: dict[str, Any],
    ) -> None: ...


class ProductionImageSelectionCatalog(Protocol):
    def options(self) -> dict[str, str]: ...

    def normalize_render(self, value: str | None) -> str: ...

    def normalize_sketch(self, value: str | None) -> str: ...


class ProductionGenerationStore(Protocol):
    def get_all_characters(self) -> list[Any]: ...

    def get_sketch_colors(self, episode_num: int) -> dict[str, str]: ...

    async def set_sketch_colors(
        self,
        episode_num: int,
        colors: dict[str, str],
    ) -> None: ...


class ProductionSketchColorStore(Protocol):
    def get_sketch_colors(self, episode_num: int) -> dict[str, str]: ...

    async def set_sketch_colors(
        self,
        episode_num: int,
        colors: dict[str, str],
    ) -> None: ...

    async def update_episode(self, episode_num: int, **updates: Any) -> None: ...


class ProductionSketchColorAssigner(Protocol):
    def assign(
        self,
        characters: list[dict[str, Any]],
        beats: list[dict[str, Any]],
        *,
        existing_colors: dict[str, str] | None = None,
    ) -> dict[str, str]: ...


class ProductionCharacterProjector(Protocol):
    def project_characters(
        self,
        characters: list[Any],
        project: str,
    ) -> list[dict[str, Any]]: ...

    def build_character_map(
        self,
        *,
        beats: list[dict[str, Any]],
        characters: list[dict[str, Any]],
        project: str,
        sketch_colors: dict[str, str] | None,
        use_detected_identities: bool,
    ) -> dict[str, dict[str, Any]]: ...


class ProductionEpisodeSource(Protocol):
    def episode_or_none(self, store: Any, episode_num: int) -> Any | None: ...


class ProductionRuntimePropMenuSource(Protocol):
    async def for_episode(
        self,
        store: Any,
        episode: Any,
        beats: list[dict[str, Any]],
    ) -> list[dict[str, Any]]: ...


class ProductionSketchWorkspace(Protocol):
    def clear_episode_sketches(
        self,
        output_dir: str | Path,
        episode_num: int,
    ) -> None: ...
