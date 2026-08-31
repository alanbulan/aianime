"""AI sketch marker detection application use case."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ai_anime.modules.production.application.ports import (
    ProductionEpisodeSource,
    ProductionRuntimePropMenuSource,
    ProductionSketchMarkerDetectionFiles,
    ProductionSketchMarkerDetectionStore,
    ProductionSketchMarkerDetector,
)
from ai_anime.modules.production.domain.sketch_color import (
    global_prop_marker_colors,
)
from ai_anime.modules.production.domain.sketch_marker_detection import (
    SketchDetectionFrame,
    classify_sketch_marker_detections,
    map_grid_panel_detections,
    sketch_detection_grid_shape,
)

SKETCH_DETECTION_BATCH_SIZE = 25
SKETCH_DETECTION_REVIEW_MESSAGE = (
    "AI 已完成出场身份/道具识别，请核对每个 beat；"
    "漏识别可在“更多”的出场身份/出场道具中补选。"
)


class SketchMarkerDetectionRejected(ValueError):
    pass


class SketchMarkerDetectionFailed(RuntimeError):
    pass


@dataclass(frozen=True)
class DetectSketchMarkersCommand:
    episode_num: int
    project_dir: Path
    requester_user_id: str
    project_id: str = ""


@dataclass(frozen=True)
class SketchMarkerDetectionResult:
    identity_detections: dict[int, list[str]]
    prop_detections: dict[int, list[str]]
    total_beats: int
    total_identities: int
    total_props: int

    def as_dict(self) -> dict[str, Any]:
        identity_detections = {
            str(beat_number): marker_ids
            for beat_number, marker_ids in self.identity_detections.items()
        }
        return {
            "detections": identity_detections,
            "identity_detections": identity_detections,
            "prop_detections": {
                str(beat_number): marker_ids
                for beat_number, marker_ids in self.prop_detections.items()
            },
            "total_beats": self.total_beats,
            "total_identities": self.total_identities,
            "total_props": self.total_props,
            "review_message": SKETCH_DETECTION_REVIEW_MESSAGE,
        }


class SketchMarkerDetectionUseCases:
    def __init__(
        self,
        episodes: ProductionEpisodeSource,
        prop_menus: ProductionRuntimePropMenuSource,
        files: ProductionSketchMarkerDetectionFiles,
        detector: ProductionSketchMarkerDetector,
    ) -> None:
        self._episodes = episodes
        self._prop_menus = prop_menus
        self._files = files
        self._detector = detector

    async def detect(
        self,
        store: ProductionSketchMarkerDetectionStore,
        command: DetectSketchMarkersCommand,
    ) -> SketchMarkerDetectionResult:
        beats = await store.get_beats_as_dicts(command.episode_num)
        if not beats:
            raise SketchMarkerDetectionRejected(
                f"No beats found for episode {command.episode_num}"
            )

        identity_colors, script = await self._identity_colors(
            store,
            command.episode_num,
        )
        if not identity_colors:
            raise SketchMarkerDetectionRejected(
                "No sketch colors assigned. Call assign-colors first"
            )

        episode = self._episodes.episode_or_none(
            store,
            command.episode_num,
        )
        prop_menu = await self._prop_menus.for_episode(
            store,
            episode,
            beats,
        )
        if not prop_menu:
            script = script or await self._script_or_none(store, command.episode_num)
            prop_menu = list((script or {}).get("prop_menu") or [])
        prop_colors = global_prop_marker_colors(
            beats,
            prop_menu=prop_menu,
            sketch_colors=identity_colors,
        )
        color_marker_map = {color: marker for marker, color in identity_colors.items()}
        color_marker_map.update(
            {color: marker for marker, color in prop_colors.items()}
        )

        known_beat_numbers = {
            int(beat.get("beat_number", 0) or 0)
            for beat in beats
            if int(beat.get("beat_number", 0) or 0) > 0
        }
        frames = sorted(
            self._files.find_frames(
                command.project_dir,
                command.episode_num,
                known_beat_numbers,
            ),
            key=lambda frame: (frame.beat_number, frame.path.name),
        )
        if not frames:
            raise SketchMarkerDetectionRejected("No sketches found")
        grid_dir = self._files.prepare_grid_dir(
            command.project_dir,
            command.episode_num,
        )

        try:
            raw_detections = await self._detect_batches(
                frames,
                grid_dir,
                color_marker_map,
            )
            classified = classify_sketch_marker_detections(
                frames=frames,
                detections=raw_detections,
                beats=beats,
                characters=store.get_all_characters(),
                allowed_prop_ids=set(prop_colors),
            )
            await store.set_beat_detected_identities(
                command.episode_num,
                classified.identities,
            )
            await store.set_beat_detected_props(
                command.episode_num,
                classified.props,
            )
        except Exception as exc:
            raise SketchMarkerDetectionFailed(str(exc)) from exc

        return SketchMarkerDetectionResult(
            identity_detections=classified.identities,
            prop_detections=classified.props,
            total_beats=len(beats),
            total_identities=classified.total_identities,
            total_props=classified.total_props,
        )

    async def _identity_colors(
        self,
        store: ProductionSketchMarkerDetectionStore,
        episode_num: int,
    ) -> tuple[dict[str, str], dict[str, Any] | None]:
        colors = dict(store.get_sketch_colors(episode_num) or {})
        script = None
        if not colors:
            script = await self._script_or_none(store, episode_num)
            colors = dict((script or {}).get("sketch_colors") or {})
        return colors, script

    @staticmethod
    async def _script_or_none(
        store: ProductionSketchMarkerDetectionStore,
        episode_num: int,
    ) -> dict[str, Any] | None:
        try:
            return await store.get_script_as_dict(episode_num)
        except Exception:
            return None

    async def _detect_batches(
        self,
        frames: list[SketchDetectionFrame],
        grid_dir: Path,
        color_marker_map: dict[str, str],
    ) -> dict[int, list[str]]:
        detections: dict[int, list[str]] = {}
        for batch_start in range(0, len(frames), SKETCH_DETECTION_BATCH_SIZE):
            batch = frames[batch_start : batch_start + SKETCH_DETECTION_BATCH_SIZE]
            rows, cols = sketch_detection_grid_shape(len(batch))
            part_number = batch_start // SKETCH_DETECTION_BATCH_SIZE + 1
            grid_path = grid_dir / (
                f"_ai_detect_grid_{rows}x{cols}_part{part_number}.png"
            )
            self._files.combine_grid(
                [frame.path for frame in batch],
                grid_path,
                rows=rows,
                cols=cols,
            )
            panel_detections = await self._detector.detect(
                grid_path=grid_path,
                color_marker_map=color_marker_map,
                total_panels=len(batch),
            )
            detections.update(map_grid_panel_detections(batch, panel_detections))
        return detections
