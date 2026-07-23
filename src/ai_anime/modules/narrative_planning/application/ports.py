from __future__ import annotations

from pathlib import Path
from typing import Any, Protocol

from ai_anime.modules.narrative_planning.application.task_dto import (
    BeatVideoPromptTask,
    ScriptGenerationTask,
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


class SketchWorkspace(Protocol):
    def clear_episode_sketches(
        self,
        output_dir: str | Path,
        episode_num: int,
    ) -> None: ...


class NarrativeTaskScheduler(Protocol):
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
