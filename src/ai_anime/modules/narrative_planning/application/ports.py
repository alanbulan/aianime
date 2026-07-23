from __future__ import annotations

from pathlib import Path
from typing import Any, Protocol


class NarrativeScriptStore(Protocol):
    async def get_script_as_dict(self, episode_num: int) -> dict[str, Any] | None: ...

    def get_all_characters(self) -> list[Any]: ...

    async def update_beat_asset(
        self,
        episode_number: int,
        beat_number: int,
        **updates: Any,
    ) -> bool: ...


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
