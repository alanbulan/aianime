"""Adapters for AI sketch marker detection."""

from __future__ import annotations

import re
from pathlib import Path

from ai_anime.agents import global_video_optimizer
from ai_anime.generators.grid_splitter import combine_to_grid
from ai_anime.modules.production.domain.sketch_marker_detection import (
    SketchDetectionFrame,
)


class LocalSketchMarkerDetectionFiles:
    _beat_pattern = re.compile(r"beat_(\d+)\.(png|jpg)$", re.IGNORECASE)

    def find_frames(
        self,
        project_dir: Path,
        episode_num: int,
        known_beat_numbers: set[int],
    ) -> list[SketchDetectionFrame]:
        sketches_dir = project_dir / "sketches" / f"ep{episode_num:03d}"
        frames: list[SketchDetectionFrame] = []
        if not sketches_dir.exists():
            return frames
        for candidate in sketches_dir.iterdir():
            if not candidate.is_file():
                continue
            match = self._beat_pattern.fullmatch(candidate.name)
            if not match:
                continue
            beat_number = int(match.group(1))
            if known_beat_numbers and beat_number not in known_beat_numbers:
                continue
            frames.append(SketchDetectionFrame(beat_number, candidate))
        return sorted(frames, key=lambda frame: (frame.beat_number, frame.path.name))

    def prepare_grid_dir(
        self,
        project_dir: Path,
        episode_num: int,
    ) -> Path:
        grid_dir = project_dir / "grids" / f"ep{episode_num:03d}" / "sketch"
        grid_dir.mkdir(parents=True, exist_ok=True)
        return grid_dir

    def combine_grid(
        self,
        image_paths: list[Path],
        output_path: Path,
        *,
        rows: int,
        cols: int,
    ) -> None:
        combine_to_grid(
            [str(path) for path in image_paths],
            output_path,
            rows=rows,
            cols=cols,
        )


class GlobalVideoOptimizerSketchMarkerDetector:
    async def detect(
        self,
        *,
        grid_path: Path,
        color_marker_map: dict[str, str],
        total_panels: int,
    ) -> dict[int, list[str]]:
        return await global_video_optimizer.detect_identities_by_ai(
            sketch_image_paths=[str(grid_path)],
            color_identity_map=color_marker_map,
            total_beats=total_panels,
        )
