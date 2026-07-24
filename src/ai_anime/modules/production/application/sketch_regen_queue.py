"""Sketch regeneration queue application use cases."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from ai_anime.modules.production.application.ports import (
    ProductionSettingsRepository,
)
from ai_anime.modules.production.domain.sketch_regen_queue import (
    LEGACY_SKETCH_REGEN_QUEUE_KEY,
    REACT_SKETCH_REGEN_QUEUE_KEY,
    resolve_sketch_regen_queue_state,
    sketch_regen_episode_key,
)


@dataclass(frozen=True)
class ReplaceSketchRegenQueueCommand:
    episode_num: int
    items: list[dict[str, Any]]


@dataclass(frozen=True)
class SketchRegenQueueResult:
    items: list[dict[str, Any]]

    def as_dict(self) -> dict[str, Any]:
        return {"items": self.items}


class SketchRegenQueueUseCases:
    def __init__(self, repository: ProductionSettingsRepository) -> None:
        self._repository = repository

    def get(
        self,
        username: str,
        project: str,
        episode_num: int,
    ) -> SketchRegenQueueResult:
        config = self._repository.load(username, project)
        state = resolve_sketch_regen_queue_state(config)
        items = state.queues.get(sketch_regen_episode_key(episode_num))
        return SketchRegenQueueResult(
            items=list(items) if isinstance(items, list) else [],
        )

    def replace(
        self,
        username: str,
        project: str,
        command: ReplaceSketchRegenQueueCommand,
    ) -> SketchRegenQueueResult:
        config = self._repository.load(username, project)
        state = resolve_sketch_regen_queue_state(config)
        queues = dict(state.queues)
        queues[sketch_regen_episode_key(command.episode_num)] = [
            dict(item) for item in command.items
        ]
        updates: dict[str, Any] = {
            REACT_SKETCH_REGEN_QUEUE_KEY: queues,
        }
        if state.legacy_changed:
            updates[LEGACY_SKETCH_REGEN_QUEUE_KEY] = state.cleaned_legacy_queues
        self._repository.save(username, project, updates)
        return self.get(username, project, command.episode_num)
