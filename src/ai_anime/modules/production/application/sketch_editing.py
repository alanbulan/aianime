"""Project-facing sketch pose editing and crop use cases."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ai_anime.modules.production.application.ports import (
    ProductionSketchEditingWorkspace,
)
from ai_anime.modules.production.application.sketch_image import (
    CropSketchCommand,
    SketchCropRejected,
    SketchImageUseCases,
)
from ai_anime.modules.production.application.sketch_pose import (
    SketchPoseCandidatesMissing,
    SketchPoseEditorUseCases,
)
from ai_anime.modules.project_workspace.public import ProjectContext


@dataclass(frozen=True)
class CanonicalSketch:
    path: Path
    url: str


@dataclass(frozen=True)
class SketchBeatContext:
    beat: dict[str, Any]
    sketch_colors: dict[str, str]


@dataclass(frozen=True)
class SketchEditorQuery:
    episode_num: int
    beat_num: int


@dataclass(frozen=True)
class SketchCropSourceQuery:
    episode_num: int
    beat_num: int


@dataclass(frozen=True)
class SaveSketchEditorCommand:
    episode_num: int
    beat_num: int
    editor_state: dict[str, Any]


@dataclass(frozen=True)
class CropCurrentSketchCommand:
    episode_num: int
    beat_num: int
    x: Any
    y: Any
    width: Any
    height: Any


@dataclass(frozen=True)
class SketchEditorView:
    beat_num: int
    sketch_url: str
    editor: dict[str, Any]

    def as_dict(self) -> dict[str, Any]:
        return {
            "beat_num": self.beat_num,
            "sketch_url": self.sketch_url,
            **self.editor,
        }


@dataclass(frozen=True)
class SketchCropSourceView:
    beat_num: int
    sketch_url: str
    width: int
    height: int

    def as_dict(self) -> dict[str, Any]:
        return {
            "beat_num": self.beat_num,
            "sketch_url": self.sketch_url,
            "width": self.width,
            "height": self.height,
        }


@dataclass(frozen=True)
class EditedSketch:
    beat_num: int
    sketch_url: str
    details: dict[str, int]

    def as_dict(self) -> dict[str, Any]:
        return {
            "beat_num": self.beat_num,
            "sketch_url": self.sketch_url,
            **self.details,
        }


class CurrentSketchMissing(Exception):
    def __init__(self, beat_num: int) -> None:
        super().__init__(f"Beat {beat_num} 缺少当前草图")


class SketchBeatMissing(Exception):
    def __init__(self, beat_num: int) -> None:
        super().__init__(f"Beat {beat_num} 不存在")


class SketchEditorSaveRejected(Exception):
    pass


class SketchEditingUseCases:
    def __init__(
        self,
        workspace: ProductionSketchEditingWorkspace,
        pose_editor: SketchPoseEditorUseCases,
        sketch_image: SketchImageUseCases,
    ) -> None:
        self._workspace = workspace
        self._pose_editor = pose_editor
        self._sketch_image = sketch_image

    async def load_editor(
        self,
        context: ProjectContext,
        query: SketchEditorQuery,
    ) -> SketchEditorView:
        target = self._target(context, query.episode_num, query.beat_num)
        beat_context = await self._workspace.beat_context(
            context,
            query.episode_num,
            query.beat_num,
        )
        if beat_context is None:
            raise SketchBeatMissing(query.beat_num)
        editor = self._pose_editor.load_editor(
            sketch_path=target.path,
            beat=beat_context.beat,
            sketch_colors=beat_context.sketch_colors,
        )
        return SketchEditorView(
            beat_num=query.beat_num,
            sketch_url=target.url,
            editor=editor,
        )

    def load_crop_source(
        self,
        context: ProjectContext,
        query: SketchCropSourceQuery,
    ) -> SketchCropSourceView:
        target = self._target(context, query.episode_num, query.beat_num)
        width, height = self._sketch_image.image_size(target.path)
        return SketchCropSourceView(
            beat_num=query.beat_num,
            sketch_url=target.url,
            width=width,
            height=height,
        )

    def save_editor(
        self,
        context: ProjectContext,
        command: SaveSketchEditorCommand,
    ) -> EditedSketch:
        target = self._target(context, command.episode_num, command.beat_num)
        try:
            self._pose_editor.save_editor(
                sketch_path=target.path,
                editor_state=command.editor_state,
            )
        except Exception as exc:
            raise SketchEditorSaveRejected(f"保存草图编辑失败: {exc}") from exc
        refreshed_target = self._target(
            context,
            command.episode_num,
            command.beat_num,
        )
        return EditedSketch(
            beat_num=command.beat_num,
            sketch_url=refreshed_target.url,
            details={},
        )

    def crop(
        self,
        context: ProjectContext,
        command: CropCurrentSketchCommand,
    ) -> EditedSketch:
        target = self._target(context, command.episode_num, command.beat_num)
        details = self._sketch_image.crop(
            sketch_path=target.path,
            command=CropSketchCommand(
                x=command.x,
                y=command.y,
                width=command.width,
                height=command.height,
            ),
        )
        refreshed_target = self._target(
            context,
            command.episode_num,
            command.beat_num,
        )
        return EditedSketch(
            beat_num=command.beat_num,
            sketch_url=refreshed_target.url,
            details=details,
        )

    def _target(
        self,
        context: ProjectContext,
        episode_num: int,
        beat_num: int,
    ) -> CanonicalSketch:
        target = self._workspace.canonical_sketch(
            context,
            episode_num,
            beat_num,
        )
        if target is None:
            raise CurrentSketchMissing(beat_num)
        return target


__all__ = [
    "CanonicalSketch",
    "CropCurrentSketchCommand",
    "CurrentSketchMissing",
    "EditedSketch",
    "SaveSketchEditorCommand",
    "SketchBeatContext",
    "SketchBeatMissing",
    "SketchCropSourceQuery",
    "SketchCropSourceView",
    "SketchCropRejected",
    "SketchEditingUseCases",
    "SketchEditorQuery",
    "SketchEditorSaveRejected",
    "SketchEditorView",
    "SketchPoseCandidatesMissing",
]
