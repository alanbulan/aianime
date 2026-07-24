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
