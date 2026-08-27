"""Project-facing sketch marker color and detection use cases."""

from __future__ import annotations

from dataclasses import dataclass

from ai_anime.modules.production.application.ports import (
    ProductionSketchMarkerWorkspace,
)
from ai_anime.modules.production.application.sketch_color import (
    SketchColorAssignmentResult,
    SketchColorAssignmentUseCases,
    SketchColorMarkersMissing,
    SketchColorPersistenceFailed,
)
from ai_anime.modules.production.application.sketch_marker_detection import (
    DetectSketchMarkersCommand,
    SketchMarkerDetectionFailed,
    SketchMarkerDetectionRejected,
    SketchMarkerDetectionResult,
    SketchMarkerDetectionUseCases,
)
from ai_anime.modules.project_workspace.public import ProjectContext


@dataclass(frozen=True)
class AssignProjectSketchColorsCommand:
    episode_num: int


@dataclass(frozen=True)
class DetectProjectSketchMarkersCommand:
    episode_num: int


class SketchEpisodeBeatsMissing(Exception):
    def __init__(self, episode_num: int) -> None:
        super().__init__(f"No beats found for episode {episode_num}")


class SketchMarkerUseCases:
    def __init__(
        self,
        workspace: ProductionSketchMarkerWorkspace,
        color_assignment: SketchColorAssignmentUseCases,
        marker_detection: SketchMarkerDetectionUseCases,
    ) -> None:
        self._workspace = workspace
        self._color_assignment = color_assignment
        self._marker_detection = marker_detection

    async def assign_colors(
        self,
        context: ProjectContext,
        command: AssignProjectSketchColorsCommand,
    ) -> SketchColorAssignmentResult:
        async with self._workspace.session(context) as store:
            beats = await store.get_beats_as_dicts(command.episode_num)
            if not beats:
                raise SketchEpisodeBeatsMissing(command.episode_num)
            return await self._color_assignment.assign(
                store=store,
                episode_num=command.episode_num,
                beats=beats,
            )

    async def detect(
        self,
        context: ProjectContext,
        command: DetectProjectSketchMarkersCommand,
    ) -> SketchMarkerDetectionResult:
        async with self._workspace.session(context) as store:
            return await self._marker_detection.detect(
                store,
                DetectSketchMarkersCommand(
                    episode_num=command.episode_num,
                    project_dir=context.output_dir,
                    requester_user_id=str(
                        context.requester_user_id or context.requester_username
                    ),
                    project_id=str(context.project_id or ""),
                ),
            )


__all__ = [
    "AssignProjectSketchColorsCommand",
    "DetectProjectSketchMarkersCommand",
    "SketchColorMarkersMissing",
    "SketchColorPersistenceFailed",
    "SketchColorAssignmentResult",
    "SketchEpisodeBeatsMissing",
    "SketchMarkerDetectionFailed",
    "SketchMarkerDetectionRejected",
    "SketchMarkerDetectionResult",
    "SketchMarkerUseCases",
]
