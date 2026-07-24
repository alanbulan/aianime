"""Ports required by Production use cases."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Protocol

from ai_anime.modules.production.domain.sketch_marker_detection import (
    SketchDetectionFrame,
)


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


class ProductionSettingsRepository(Protocol):
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


class ProductionSketchMarkerDetectionStore(Protocol):
    async def get_beats_as_dicts(
        self,
        episode_num: int,
    ) -> list[dict[str, Any]]: ...

    def get_sketch_colors(self, episode_num: int) -> dict[str, str]: ...

    async def get_script_as_dict(self, episode_num: int) -> dict[str, Any]: ...

    def get_all_characters(self) -> list[Any]: ...

    async def set_beat_detected_identities(
        self,
        episode_num: int,
        detections: dict[int, list[str]],
    ) -> int: ...

    async def set_beat_detected_props(
        self,
        episode_num: int,
        detections: dict[int, list[str]],
    ) -> int: ...


class ProductionSketchMarkerDetectionFiles(Protocol):
    def find_frames(
        self,
        project_dir: Path,
        episode_num: int,
        known_beat_numbers: set[int],
    ) -> list[SketchDetectionFrame]: ...

    def prepare_grid_dir(
        self,
        project_dir: Path,
        episode_num: int,
    ) -> Path: ...

    def combine_grid(
        self,
        image_paths: list[Path],
        output_path: Path,
        *,
        rows: int,
        cols: int,
    ) -> None: ...


class ProductionSketchMarkerDetector(Protocol):
    async def detect(
        self,
        *,
        grid_path: Path,
        color_marker_map: dict[str, str],
        total_panels: int,
    ) -> dict[Any, list[str]]: ...


class ProductionFeatureUsageMeter(Protocol):
    async def reserve_feature_start_credits(
        self,
        **kwargs: Any,
    ) -> dict[str, Any]: ...

    async def confirm_feature_credit_reservation(
        self,
        reservation_id: str,
        *,
        metadata: dict[str, Any] | None = None,
    ) -> None: ...

    async def refund_feature_credit_reservation(
        self,
        reservation_id: str,
        *,
        metadata: dict[str, Any] | None = None,
    ) -> None: ...

    def set_llm_usage_context(
        self,
        user_id: str,
        project_id: str = "",
        resource_kind: str = "",
        billing_metadata: dict[str, Any] | None = None,
    ) -> None: ...

    def clear_llm_usage_context(self) -> None: ...


class ProductionImageUsageReader(Protocol):
    def summary(
        self,
        project_output_dir: Path,
        *,
        task_types: tuple[str, ...] | None = None,
        episode: int | None = None,
    ) -> dict[str, int]: ...

    def count_scope_attempts(
        self,
        project_output_dir: Path,
        *,
        task_type: str,
        scope: str,
        episode: int | None = None,
    ) -> int: ...


class ProductionOperatorPasswordVerifier(Protocol):
    def verify(self, candidate: str) -> bool: ...
