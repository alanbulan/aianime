from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from ai_anime.modules.narrative_planning.application.task_dto import (
    BeatVideoPromptTask,
    EpisodeRewriteTask,
    EpisodeAssetPlanningTask,
    EpisodeIdentityPlanningTask,
    EpisodePlanningTask,
    ScriptGenerationTask,
    VideoPromptOptimizationTask,
    TaskQueueReceipt,
)
from ai_anime.modules.project_workspace.public import ProjectContext


class NarrativeScriptStore(Protocol):
    async def get_script_as_dict(self, episode_num: int) -> dict[str, Any] | None: ...

    def get_all_characters(self) -> list[Any]: ...

    async def update_beat_asset(
        self,
        episode_number: int,
        beat_number: int,
        **updates: Any,
    ) -> bool: ...


class ScriptDocumentStore(Protocol):
    async def get_script_as_dict(self, episode_num: int) -> dict[str, Any] | None: ...

    async def update_beat_asset(
        self,
        episode_number: int,
        beat_number: int,
        **updates: Any,
    ) -> bool: ...

    async def load_graph_state(self) -> Any: ...

    async def persist_beats_from_script(
        self,
        episode_num: int,
        beats: list[dict[str, Any]],
    ) -> None: ...


class FirstFramePromptGenerator(Protocol):
    async def __call__(
        self,
        *,
        store: NarrativeScriptStore,
        output_dir: str | Path,
        project_name: str,
        episode: int,
        beat: dict[str, Any],
        all_beats: list[dict[str, Any]],
        previous_beat: dict[str, Any] | None,
        next_beat: dict[str, Any] | None,
        language: str,
    ) -> str: ...


class KeyframePromptGenerator(Protocol):
    async def __call__(
        self,
        *,
        output_dir: str | Path,
        episode: int,
        beat: dict[str, Any],
        next_beat: dict[str, Any],
        language: str,
    ) -> str: ...


class NarrativeContentStore(Protocol):
    async def load_episode_content(self, episode_num: int) -> str: ...

    async def save_episode_content(self, episode_num: int, content: str) -> None: ...

    async def load_adapted_content(self, episode_num: int) -> str: ...

    async def save_adapted_content(self, episode_num: int, content: str) -> None: ...

    async def load_graph_state(self) -> Any: ...

    def get_episode(self, episode_num: int) -> Any | None: ...

    def get_all_characters(self) -> list[Any]: ...

    async def update_episode(self, episode_number: int, **updates: Any) -> None: ...


class ContentRewriteGenerator(Protocol):
    async def __call__(
        self,
        raw_content: str,
        *,
        episode_title: str,
        protagonist_name: str,
        target_beats: int,
        beat_chars_range: tuple[int, int],
        narration_style: str,
    ) -> str: ...


class ScriptGenerationStore(Protocol):
    def get_episode(self, episode_num: int) -> Any | None: ...


class NarrativeTaskScheduler(Protocol):
    async def enqueue_episode_planning(
        self,
        task_context: ProjectContext,
        task: EpisodePlanningTask,
    ) -> TaskQueueReceipt: ...

    async def enqueue_script_generation(
        self,
        task_context: ProjectContext,
        task: ScriptGenerationTask,
    ) -> TaskQueueReceipt: ...

    async def enqueue_beat_video_prompt(
        self,
        task_context: ProjectContext,
        task: BeatVideoPromptTask,
    ) -> TaskQueueReceipt: ...

    async def enqueue_video_prompt(
        self,
        task_context: ProjectContext,
        task: VideoPromptOptimizationTask,
    ) -> TaskQueueReceipt: ...

    async def enqueue_episode_rewrite(
        self,
        task_context: ProjectContext,
        task: EpisodeRewriteTask,
    ) -> TaskQueueReceipt: ...

    async def enqueue_episode_asset_planning(
        self,
        task_context: ProjectContext,
        task: EpisodeAssetPlanningTask,
    ) -> TaskQueueReceipt: ...

    async def enqueue_episode_identity_planning(
        self,
        task_context: ProjectContext,
        task: EpisodeIdentityPlanningTask,
    ) -> TaskQueueReceipt: ...


class VideoPromptStore(Protocol):
    async def get_script_as_dict(self, episode_num: int) -> dict[str, Any] | None: ...

    async def update_beat_asset(
        self,
        episode_number: int,
        beat_number: int,
        **updates: Any,
    ) -> bool: ...


class VideoPromptGateway(Protocol):
    def mode(self, config_json: Any) -> str: ...

    async def generate(
        self,
        *,
        store: VideoPromptStore,
        episode: int,
        beat: dict[str, Any],
        project_dir: str | Path,
        next_beat: dict[str, Any] | None,
        manual_prompt_reference: str | None,
        prompt_guidance: str | None,
        prop_menu: list[Any],
    ) -> str: ...

    def result_fields(self, config_json: str) -> tuple[str, str]: ...


class EpisodeRepository(Protocol):
    def get_all_episodes(self) -> list[Any]: ...

    def get_episode(self, episode_num: int) -> Any | None: ...

    async def update_episode(
        self,
        episode_num: int,
        **updates: Any,
    ) -> None: ...


@dataclass(frozen=True)
class ProjectMediaResource:
    relative_path: str
    local_path: Path


class EpisodeBeatStore(Protocol):
    async def get_beats_as_dicts(
        self,
        episode_number: int,
    ) -> list[dict[str, Any]]: ...


class EpisodeBeatMediaCatalog(Protocol):
    def locate(
        self,
        episode_number: int,
        beat_number: int,
    ) -> Mapping[str, ProjectMediaResource]: ...


class ProjectMediaUrlBuilder(Protocol):
    def build(self, resource: ProjectMediaResource) -> str: ...


class AudioDurationProbe(Protocol):
    async def read(self, audio_path: Path) -> float: ...


class ManualBeatStore(Protocol):
    async def get_beats_as_dicts(
        self,
        episode_number: int,
    ) -> list[dict[str, Any]]: ...

    async def update_beat_asset(
        self,
        episode_number: int,
        beat_number: int,
        **updates: Any,
    ) -> bool: ...

    async def add_visual_beats(self, beats: Sequence[Any]) -> None: ...

    async def delete_manual_beat(
        self,
        episode_number: int,
        beat_number: int,
    ) -> bool: ...


class ManualBeatAssetWorkspace(Protocol):
    def existing_beat_numbers(self, episode_number: int) -> set[int]: ...

    def delete_beat_artifacts(
        self,
        episode_number: int,
        beat_number: int,
    ) -> None: ...
