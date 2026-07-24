from __future__ import annotations

from ai_anime.modules.production.domain.sketch_regen_queue import (
    is_react_sketch_regen_queue_items,
    resolve_sketch_regen_queue_state,
    sketch_regen_episode_key,
)


def test_episode_key_is_zero_padded() -> None:
    assert sketch_regen_episode_key(2) == "ep002"


def test_react_queue_items_require_non_empty_camel_case_beat_numbers() -> None:
    assert is_react_sketch_regen_queue_items([{"beatNumbers": [1]}]) is True
    assert is_react_sketch_regen_queue_items([]) is False
    assert is_react_sketch_regen_queue_items([{"beat_indices": [1]}]) is False


def test_queue_state_migrates_only_react_items_without_overwriting_current() -> None:
    current_item = {"id": "current", "beatNumbers": [1]}
    legacy_item = {"id": "legacy", "beatNumbers": [2]}
    nicegui_item = {"id": "nicegui", "beat_indices": [3]}

    state = resolve_sketch_regen_queue_state(
        {
            "react_sketch_regen_queue": {"ep001": [current_item]},
            "sketch_regen_queue": {
                "ep001": [legacy_item],
                "ep002": [legacy_item],
                "ep003": [],
                "ep004": [nicegui_item],
                "other": [legacy_item],
            },
        }
    )

    assert state.queues == {
        "ep001": [current_item],
        "ep002": [legacy_item],
    }
    assert state.cleaned_legacy_queues == {
        "ep003": [],
        "ep004": [nicegui_item],
        "other": [legacy_item],
    }
    assert state.legacy_changed is True


def test_invalid_queue_containers_resolve_to_empty_state() -> None:
    state = resolve_sketch_regen_queue_state(
        {
            "react_sketch_regen_queue": [],
            "sketch_regen_queue": "invalid",
        }
    )

    assert state.queues == {}
    assert state.cleaned_legacy_queues == {}
    assert state.legacy_changed is False
