"""Sketch regeneration queue domain rules."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

REACT_SKETCH_REGEN_QUEUE_KEY = "react_sketch_regen_queue"
LEGACY_SKETCH_REGEN_QUEUE_KEY = "sketch_regen_queue"


@dataclass(frozen=True)
class SketchRegenQueueState:
    queues: dict[str, Any]
    cleaned_legacy_queues: dict[str, Any]
    legacy_changed: bool


def sketch_regen_episode_key(episode_num: int) -> str:
    return f"ep{int(episode_num):03d}"


def is_react_sketch_regen_queue_items(items: object) -> bool:
    return (
        isinstance(items, list)
        and bool(items)
        and all(isinstance(item, dict) and "beatNumbers" in item for item in items)
    )


def resolve_sketch_regen_queue_state(
    config: dict[str, Any],
) -> SketchRegenQueueState:
    raw_queues = config.get(REACT_SKETCH_REGEN_QUEUE_KEY)
    queues = dict(raw_queues) if isinstance(raw_queues, dict) else {}

    legacy_queues = config.get(LEGACY_SKETCH_REGEN_QUEUE_KEY)
    cleaned_legacy = dict(legacy_queues) if isinstance(legacy_queues, dict) else {}
    legacy_changed = False
    if isinstance(legacy_queues, dict):
        for key, items in legacy_queues.items():
            if (
                isinstance(key, str)
                and key.startswith("ep")
                and is_react_sketch_regen_queue_items(items)
            ):
                queues.setdefault(key, list(items))
                cleaned_legacy.pop(key, None)
                legacy_changed = True

    return SketchRegenQueueState(
        queues=queues,
        cleaned_legacy_queues=cleaned_legacy,
        legacy_changed=legacy_changed,
    )
