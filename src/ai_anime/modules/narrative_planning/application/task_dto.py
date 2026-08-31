from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


_EPISODE_ASSET_PLANNER_TASKS = {
    "scene": ("episode_scene_planner", "场景"),
    "prop": ("episode_prop_planner", "道具"),
}


@dataclass(frozen=True)
class ScriptGenerationTask:
    episode: int
    output_dir: str | Path
    config: dict[str, Any] = field(default_factory=dict)

    def backend_payload(self) -> dict[str, Any]:
        return {
            "episode": self.episode,
            "config": dict(self.config),
            "output_dir": str(self.output_dir),
        }


@dataclass(frozen=True)
class BeatVideoPromptTask:
    episode: int
    beat_num: int
    field: str
    language: str
    output_dir: str | Path

    def backend_payload(self) -> dict[str, Any]:
        return {
            "episode": self.episode,
            "beat_num": self.beat_num,
            "field": self.field,
            "language": self.language,
            "output_dir": str(self.output_dir),
            "display_name": (
                f"生成提示词 · EP{self.episode} / Beat {self.beat_num}"
            ),
        }


@dataclass(frozen=True)
class VideoPromptOptimizationTask:
    episode: int
    beat_num: int
    project_dir: str | Path
    requester_user_id: str
    project_id: str
    manual_prompt_reference: str | None = None
    prompt_guidance: str | None = None

    def backend_payload(self) -> dict[str, Any]:
        return {
            "episode": self.episode,
            "beat_num": self.beat_num,
            "project_dir": str(self.project_dir),
            "requester_user_id": self.requester_user_id,
            "project_id": self.project_id,
            "manual_prompt_reference": self.manual_prompt_reference,
            "prompt_guidance": self.prompt_guidance,
            "display_name": (
                f"优化视频提示词 · EP{self.episode} / Beat {self.beat_num}"
            ),
        }


@dataclass(frozen=True)
class EpisodeRewriteTask:
    episode: int
    target_beats: int
    beat_chars_min: int
    beat_chars_max: int
    narration_style: str | None = None

    def backend_payload(self) -> dict[str, Any]:
        return {
            "episode": self.episode,
            "target_beats": self.target_beats,
            "beat_chars_min": self.beat_chars_min,
            "beat_chars_max": self.beat_chars_max,
            "narration_style": self.narration_style,
            "display_name": f"生成改写稿 · EP{self.episode}",
        }


@dataclass(frozen=True)
class EpisodePlanningTask:
    target_episodes: int
    planning_mode: str
    output_dir: str | Path
    state_dir: str | Path

    def backend_payload(self) -> dict[str, Any]:
        return {
            "config": {
                "target_episodes": self.target_episodes,
                "planning_mode": self.planning_mode,
            },
            "output_dir": str(self.output_dir),
            "state_dir": str(self.state_dir),
        }


@dataclass(frozen=True)
class EpisodeAssetPlanningTask:
    episode: int
    asset_kind: str

    def __post_init__(self) -> None:
        if self.asset_kind not in _EPISODE_ASSET_PLANNER_TASKS:
            raise ValueError(f"Unknown asset planning kind: {self.asset_kind}")

    @property
    def task_type(self) -> str:
        return _EPISODE_ASSET_PLANNER_TASKS[self.asset_kind][0]

    @property
    def label(self) -> str:
        return _EPISODE_ASSET_PLANNER_TASKS[self.asset_kind][1]

    @property
    def scope(self) -> str:
        return f"{self.asset_kind}_run_ep{self.episode:03d}"

    def backend_payload(self) -> dict[str, Any]:
        return {
            "episode": self.episode,
            "asset_kind": self.asset_kind,
        }


@dataclass(frozen=True)
class EpisodeIdentityPlanningTask:
    episode: int

    def backend_payload(self) -> dict[str, int]:
        return {"episode": self.episode}


@dataclass(frozen=True)
class TaskQueueReceipt:
    task_id: str
    task_key: str
    backend: str
    queue: str | None


@dataclass(frozen=True)
class ScheduledNarrativeTask:
    task_type: str
    task_id: str
    task_key: str
    backend: str
    queue: str | None
    message: str
    scope: str | None = None

    @classmethod
    def from_receipt(
        cls,
        receipt: TaskQueueReceipt,
        *,
        task_type: str,
        message: str,
        scope: str | None = None,
    ) -> ScheduledNarrativeTask:
        return cls(
            task_type=task_type,
            task_id=receipt.task_id,
            task_key=receipt.task_key,
            backend=receipt.backend,
            queue=receipt.queue,
            message=message,
            scope=scope,
        )

    def as_dict(self) -> dict[str, Any]:
        result = {
            "task_type": self.task_type,
            "task_id": self.task_id,
            "task_key": self.task_key,
            "backend": self.backend,
            "queue": self.queue,
            "message": self.message,
        }
        if self.scope is not None:
            result["scope"] = self.scope
        return result
