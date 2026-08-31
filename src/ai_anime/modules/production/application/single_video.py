"""Single-Beat video generation scheduling use cases."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from ai_anime.modules.production.application.ports import (
    ProductionSingleVideoPreparer,
    ProductionSingleVideoScheduler,
)
from ai_anime.modules.project_workspace.public import ProjectContext

SINGLE_VIDEO_TASK_TYPE = "single_video"

_VIDEO_CONFIG_FIELDS = (
    "mode",
    "duration",
    "resolution",
    "ratio",
    "generate_audio",
    "return_last_frame",
    "human_review",
    "scene_optimize",
    "final_prompt",
    "prompt_guidance",
    "text_overlay",
)


@dataclass(frozen=True)
class GenerateSingleVideoCommand:
    episode_num: int
    beat_num: int
    video_model: str
    resolution: str
    model_selector: str | None = None
    use_director_render: bool = False
    video_config_json: str | None = None
    mode: str | None = None
    duration: int | None = None
    ratio: str | None = None
    generate_audio: bool | None = None
    return_last_frame: bool | None = None
    human_review: bool | None = None
    scene_optimize: str | None = None
    final_prompt: str | None = None
    audio_setting: str | None = None
    prompt_guidance: str | None = None
    text_overlay: dict[str, Any] | None = None
    provided_fields: frozenset[str] = field(default_factory=frozenset)

    def was_provided(self, field_name: str) -> bool:
        return field_name in self.provided_fields

    def video_config_overrides(self) -> dict[str, Any]:
        return {
            field_name: getattr(self, field_name)
            for field_name in _VIDEO_CONFIG_FIELDS
            if self.was_provided(field_name)
            and getattr(self, field_name) is not None
        }


@dataclass(frozen=True)
class SingleVideoTask:
    episode_num: int
    beat_num: int
    config: dict[str, Any]
    output_dir: str | Path

    def backend_payload(self) -> dict[str, Any]:
        return {
            "config": self.config,
            "output_dir": str(self.output_dir),
        }


@dataclass(frozen=True)
class SingleVideoTaskReceipt:
    task_id: str
    task_key: str
    backend: str
    queue: str | None


@dataclass(frozen=True)
class ScheduledSingleVideo:
    task_id: str
    task_key: str
    backend: str
    queue: str | None
    episode_num: int
    beat_num: int

    @classmethod
    def from_receipt(
        cls,
        receipt: SingleVideoTaskReceipt,
        *,
        episode_num: int,
        beat_num: int,
    ) -> ScheduledSingleVideo:
        return cls(
            task_id=receipt.task_id,
            task_key=receipt.task_key,
            backend=receipt.backend,
            queue=receipt.queue,
            episode_num=episode_num,
            beat_num=beat_num,
        )

    def as_dict(self) -> dict[str, Any]:
        return {
            "task_type": SINGLE_VIDEO_TASK_TYPE,
            "task_id": self.task_id,
            "task_key": self.task_key,
            "backend": self.backend,
            "queue": self.queue,
            "message": (
                f"第 {self.episode_num} 集 Beat {self.beat_num} 视频生成已入队"
            ),
        }


class SingleVideoRejected(Exception):
    pass


class SingleVideoUseCases:
    def __init__(
        self,
        preparer: ProductionSingleVideoPreparer,
        scheduler: ProductionSingleVideoScheduler,
    ) -> None:
        self._preparer = preparer
        self._scheduler = scheduler

    async def generate(
        self,
        context: ProjectContext,
        command: GenerateSingleVideoCommand,
    ) -> ScheduledSingleVideo:
        task = await self._preparer.prepare(context, command)
        receipt = await self._scheduler.enqueue(context, task)
        return ScheduledSingleVideo.from_receipt(
            receipt,
            episode_num=command.episode_num,
            beat_num=command.beat_num,
        )
