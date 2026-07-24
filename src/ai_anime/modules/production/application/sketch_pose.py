"""Sketch pose editor application use cases."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from ai_anime.modules.production.application.ports import (
    SketchPoseFiles,
    SketchPoseIdentitySource,
)
from ai_anime.modules.production.domain.sketch_pose import (
    POSE_PRESETS,
    SKELETON_EDGES,
    all_pose_candidates,
    initial_skeletons,
    pose_candidates,
)


class SketchPoseCandidatesMissing(Exception):
    pass


class SketchPoseEditorUseCases:
    def __init__(
        self,
        files: SketchPoseFiles,
        identities: SketchPoseIdentitySource,
    ) -> None:
        self._files = files
        self._identities = identities

    def load_editor(
        self,
        *,
        sketch_path: Path,
        beat: dict[str, Any],
        sketch_colors: dict[str, str],
    ) -> dict[str, Any]:
        candidates = pose_candidates(
            self._identities.detected_identity_ids(beat),
            sketch_colors,
        )
        if not candidates:
            candidates = all_pose_candidates(sketch_colors)
        if not candidates:
            raise SketchPoseCandidatesMissing

        image_size = self._files.image_size(sketch_path)
        width, height = image_size
        return {
            "width": width,
            "height": height,
            "candidates": [
                {
                    "identity_id": candidate.identity_id,
                    "color_hex": candidate.color_hex,
                    "color_name": candidate.color_name,
                }
                for candidate in candidates
            ],
            "skeleton_edges": SKELETON_EDGES,
            "pose_presets": POSE_PRESETS,
            "skeletons": initial_skeletons(candidates, image_size),
        }

    def save_editor(
        self,
        *,
        sketch_path: Path,
        editor_state: dict[str, Any],
    ) -> None:
        self._files.save_editor_state(sketch_path, editor_state)
