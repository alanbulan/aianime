from __future__ import annotations

from typing import Any

from ai_anime.modules.production.application.sketch_regen_queue import (
    ReplaceSketchRegenQueueCommand,
    SketchRegenQueueUseCases,
)


class _Repository:
    def __init__(self, config: dict[str, Any]) -> None:
        self.config = dict(config)
        self.load_calls: list[tuple[str, str]] = []
        self.save_calls: list[tuple[str, str, dict[str, Any]]] = []

    def load(self, username: str, project: str) -> dict[str, Any]:
        self.load_calls.append((username, project))
        return self.config

    def save(
        self,
        username: str,
        project: str,
        updates: dict[str, Any],
    ) -> None:
        self.save_calls.append((username, project, updates))
        self.config.update(updates)


def test_get_projects_legacy_react_queue_without_persisting_migration() -> None:
    item = {"id": "legacy", "beatNumbers": [2, 3]}
    repository = _Repository(
        {"sketch_regen_queue": {"ep001": [item]}},
    )

    result = SketchRegenQueueUseCases(repository).get("alice", "demo", 1)

    assert result.as_dict() == {"items": [item]}
    assert repository.load_calls == [("alice", "demo")]
    assert repository.save_calls == []


def test_replace_preserves_other_episodes_and_cleans_migrated_legacy_key() -> None:
    existing = {"id": "existing", "beatNumbers": [1]}
    legacy = {"id": "legacy", "beatNumbers": [2]}
    replacement = {"id": "replacement", "beatNumbers": [3]}
    repository = _Repository(
        {
            "react_sketch_regen_queue": {"ep001": [existing]},
            "sketch_regen_queue": {
                "ep002": [legacy],
                "nicegui": [{"beat_indices": [4]}],
            },
        }
    )

    result = SketchRegenQueueUseCases(repository).replace(
        "alice",
        "demo",
        ReplaceSketchRegenQueueCommand(
            episode_num=3,
            items=[replacement],
        ),
    )

    assert result.items == [replacement]
    assert repository.config["react_sketch_regen_queue"] == {
        "ep001": [existing],
        "ep002": [legacy],
        "ep003": [replacement],
    }
    assert repository.config["sketch_regen_queue"] == {
        "nicegui": [{"beat_indices": [4]}],
    }
    assert len(repository.save_calls) == 1
    assert repository.load_calls == [("alice", "demo"), ("alice", "demo")]


def test_replace_accepts_an_explicit_empty_queue() -> None:
    repository = _Repository({})

    result = SketchRegenQueueUseCases(repository).replace(
        "alice",
        "demo",
        ReplaceSketchRegenQueueCommand(episode_num=1, items=[]),
    )

    assert result.items == []
    assert repository.config["react_sketch_regen_queue"] == {"ep001": []}
