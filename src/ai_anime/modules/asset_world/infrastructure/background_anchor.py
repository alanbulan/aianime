"""Local Beat background-anchor persistence adapter."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from ai_anime.utils.background_anchor import (
    background_anchor_path,
    copy_to_beat_selected_background,
    crop_to_beat_selected_background,
    infer_selected_background_source,
)
from ai_anime.utils.path_resolver import canonical_beat_selected_background_path


class LocalBeatBackgroundAnchorFiles:
    def anchor_path(
        self,
        project_dir: Path,
        scene_name: str,
        *,
        episode_num: int,
        beat_num: int,
        anchor_id: str,
    ) -> Path | None:
        path = background_anchor_path(
            project_dir,
            scene_name,
            episode=int(episode_num),
            beat_num=int(beat_num),
            anchor_id=anchor_id,
        )
        return Path(path) if path else None

    def selected_background_path(
        self,
        project_dir: Path,
        episode_num: int,
        beat_num: int,
    ) -> Path:
        return canonical_beat_selected_background_path(
            project_dir,
            int(episode_num),
            int(beat_num),
        )

    def exists(self, path: Path) -> bool:
        return path.exists()

    def project_relative_path(self, project_dir: Path, path: Path) -> str:
        try:
            return path.relative_to(project_dir).as_posix()
        except ValueError:
            return path.as_posix()

    def infer_selected_source(
        self,
        project_dir: Path,
        scene_name: str,
        *,
        episode_num: int,
        beat_num: int,
    ) -> str:
        return infer_selected_background_source(
            project_dir,
            scene_name,
            episode=int(episode_num),
            beat_num=int(beat_num),
        )

    def copy_to_selected(
        self,
        project_dir: Path,
        episode_num: int,
        beat_num: int,
        source_path: Path,
    ) -> Path:
        return copy_to_beat_selected_background(
            project_dir,
            int(episode_num),
            int(beat_num),
            source_path,
        )

    def crop_to_selected(
        self,
        project_dir: Path,
        episode_num: int,
        beat_num: int,
        source_path: Path,
        *,
        x: int,
        y: int,
        width: int,
        height: int,
    ) -> Path:
        return crop_to_beat_selected_background(
            project_dir,
            int(episode_num),
            int(beat_num),
            source_path,
            x=int(x),
            y=int(y),
            width=int(width),
            height=int(height),
        )

    def save_uploaded_image(
        self,
        project_dir: Path,
        episode_num: int,
        beat_num: int,
        image: Any,
    ) -> Path:
        selected_path = self.selected_background_path(
            project_dir,
            episode_num,
            beat_num,
        )
        selected_path.parent.mkdir(parents=True, exist_ok=True)
        output = image.convert("RGB") if image.mode != "RGB" else image
        output.save(selected_path, format="PNG")
        return selected_path
