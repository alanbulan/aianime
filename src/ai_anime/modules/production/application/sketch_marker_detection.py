"""AI sketch marker detection application use case."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ai_anime.modules.production.application.ports import (
    ProductionEpisodeSource,
    ProductionFeatureUsageMeter,
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

logger = logging.getLogger(__name__)

AI_IDENTITY_DETECTION_FEATURE_KEY = "ai_identity_detection"
MODEL_CALL_CREDIT_POLICY_FEATURE_INCLUDED = "feature_included"
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
        store: ProductionSketchMarkerDetectionStore,
        episodes: ProductionEpisodeSource,
        prop_menus: ProductionRuntimePropMenuSource,
        files: ProductionSketchMarkerDetectionFiles,
        detector: ProductionSketchMarkerDetector,
        usage_meter: ProductionFeatureUsageMeter,
    ) -> None:
        self._store = store
        self._episodes = episodes
        self._prop_menus = prop_menus
        self._files = files
        self._detector = detector
        self._usage_meter = usage_meter

    async def detect(
        self,
        command: DetectSketchMarkersCommand,
    ) -> SketchMarkerDetectionResult:
        beats = await self._store.get_beats_as_dicts(command.episode_num)
        if not beats:
            raise SketchMarkerDetectionRejected(
                f"No beats found for episode {command.episode_num}"
            )

        identity_colors, script = await self._identity_colors(command.episode_num)
        if not identity_colors:
            raise SketchMarkerDetectionRejected(
                "No sketch colors assigned. Call assign-colors first"
            )

        episode = self._episodes.episode_or_none(
            self._store,
            command.episode_num,
        )
        prop_menu = await self._prop_menus.for_episode(
            self._store,
            episode,
            beats,
        )
        if not prop_menu:
            script = script or await self._script_or_none(command.episode_num)
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

        reservation = await self._usage_meter.reserve_feature_start_credits(
            user_id=command.requester_user_id,
            feature_key=AI_IDENTITY_DETECTION_FEATURE_KEY,
            project_id=command.project_id,
            resource_kind="sketch",
            task_type=AI_IDENTITY_DETECTION_FEATURE_KEY,
            metadata=self._event_metadata(command, sketch_count=len(frames)),
            require_price_rule=True,
            require_positive_cost=True,
        )
        reservation_id = str(reservation.get("id") or "")
        billing_metadata = self._billing_metadata(reservation, reservation_id)

        try:
            self._usage_meter.set_llm_usage_context(
                command.requester_user_id,
                project_id=command.project_id,
                resource_kind="sketch",
                billing_metadata=billing_metadata,
            )
            raw_detections = await self._detect_batches(
                frames,
                grid_dir,
                color_marker_map,
            )
            classified = classify_sketch_marker_detections(
                frames=frames,
                detections=raw_detections,
                beats=beats,
                characters=self._store.get_all_characters(),
                allowed_prop_ids=set(prop_colors),
            )
            await self._store.set_beat_detected_identities(
                command.episode_num,
                classified.identities,
            )
            await self._store.set_beat_detected_props(
                command.episode_num,
                classified.props,
            )
            if reservation_id:
                await self._usage_meter.confirm_feature_credit_reservation(
                    reservation_id,
                    metadata=self._event_metadata(
                        command,
                        sketch_count=len(frames),
                        detected_identity_count=classified.total_identities,
                        detected_prop_count=classified.total_props,
                    ),
                )
        except Exception as exc:
            await self._refund_after_failure(reservation_id, command, exc)
            raise SketchMarkerDetectionFailed(str(exc)) from exc
        finally:
            self._usage_meter.clear_llm_usage_context()

        return SketchMarkerDetectionResult(
            identity_detections=classified.identities,
            prop_detections=classified.props,
            total_beats=len(beats),
            total_identities=classified.total_identities,
            total_props=classified.total_props,
        )

    async def _identity_colors(
        self,
        episode_num: int,
    ) -> tuple[dict[str, str], dict[str, Any] | None]:
        colors = dict(self._store.get_sketch_colors(episode_num) or {})
        script = None
        if not colors:
            script = await self._script_or_none(episode_num)
            colors = dict((script or {}).get("sketch_colors") or {})
        return colors, script

    async def _script_or_none(self, episode_num: int) -> dict[str, Any] | None:
        try:
            return await self._store.get_script_as_dict(episode_num)
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

    @staticmethod
    def _billing_metadata(
        reservation: dict[str, Any],
        reservation_id: str,
    ) -> dict[str, Any]:
        metadata: dict[str, Any] = {
            "model_call_credit_policy": MODEL_CALL_CREDIT_POLICY_FEATURE_INCLUDED,
            "feature_key": AI_IDENTITY_DETECTION_FEATURE_KEY,
            "source": "sync_api",
        }
        if reservation_id:
            metadata.update(
                {
                    "feature_credit_reservation_id": reservation_id,
                    "feature_credit_charge_id": reservation_id,
                    "feature_credit_cost": str(reservation.get("cost") or 0),
                }
            )
        return metadata

    @staticmethod
    def _event_metadata(
        command: DetectSketchMarkersCommand,
        **details: Any,
    ) -> dict[str, Any]:
        return {
            "source": "sync_api",
            "endpoint": "detect_sketch_identities",
            "episode": command.episode_num,
            **details,
        }

    async def _refund_after_failure(
        self,
        reservation_id: str,
        command: DetectSketchMarkersCommand,
        error: Exception,
    ) -> None:
        if not reservation_id:
            return
        try:
            await self._usage_meter.refund_feature_credit_reservation(
                reservation_id,
                metadata=self._event_metadata(command, error=str(error)),
            )
        except Exception:
            logger.exception(
                "Failed to refund AI identity detection feature credit reservation"
            )
