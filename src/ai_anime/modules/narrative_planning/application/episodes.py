from __future__ import annotations

from typing import Any, Iterable, Mapping

from ai_anime.modules.narrative_planning.application.ports import (
    EpisodeRepository,
)


class EpisodeNotFound(LookupError):
    def __init__(self, episode_num: int) -> None:
        super().__init__(f"Episode {episode_num} not found")


def serialize_episode_items(items: Iterable[Any] | None) -> list[dict[str, Any]]:
    data: list[dict[str, Any]] = []
    for item in items or []:
        if hasattr(item, "model_dump"):
            data.append(item.model_dump())
        elif isinstance(item, dict):
            data.append(dict(item))
    return data


def episode_details_data(episode: Any, episode_num: int) -> dict[str, Any]:
    content_summary = (
        getattr(episode, "content_summary", "")
        or getattr(episode, "summary", "")
        or ""
    )
    return {
        "number": getattr(episode, "number", episode_num),
        "title": getattr(episode, "title", "") or "",
        "summary": content_summary,
        "raw_content": getattr(episode, "raw_content", "") or "",
        "beat_source_text": getattr(episode, "beat_source_text", "") or "",
        "content_summary": content_summary,
        "character_names": list(getattr(episode, "character_names", []) or []),
        "key_events": list(getattr(episode, "key_events", []) or []),
        "cliffhanger": getattr(episode, "cliffhanger", "") or "",
        "identity_ids": list(getattr(episode, "identity_ids", []) or []),
        "identity_default_map": dict(
            getattr(episode, "identity_default_map", {}) or {}
        ),
        "scene_menu": serialize_episode_items(
            getattr(episode, "scene_menu", []) or []
        ),
        "prop_menu": serialize_episode_items(
            getattr(episode, "prop_menu", []) or []
        ),
    }


def episode_summary_data(episode: Any) -> dict[str, Any]:
    return {
        "number": getattr(episode, "number", 0),
        "title": getattr(episode, "title", ""),
        "summary": (
            getattr(episode, "content_summary", "")
            or getattr(episode, "summary", "")
            or ""
        ),
        "identity_ids": list(getattr(episode, "identity_ids", []) or []),
        "key_events": list(getattr(episode, "key_events", []) or []),
        "scene_menu": serialize_episode_items(
            getattr(episode, "scene_menu", []) or []
        ),
        "prop_menu": serialize_episode_items(
            getattr(episode, "prop_menu", []) or []
        ),
    }


class EpisodeCatalog:
    def list(self, repository: EpisodeRepository) -> list[dict[str, Any]]:
        return [
            episode_summary_data(episode)
            for episode in repository.get_all_episodes()
        ]

    def get(
        self,
        repository: EpisodeRepository,
        episode_num: int,
    ) -> dict[str, Any]:
        episode = repository.get_episode(episode_num)
        if episode is None:
            raise EpisodeNotFound(episode_num)
        return episode_details_data(episode, episode_num)

    async def update(
        self,
        repository: EpisodeRepository,
        *,
        episode_num: int,
        updates: Mapping[str, Any],
    ) -> dict[str, Any]:
        if repository.get_episode(episode_num) is None:
            raise EpisodeNotFound(episode_num)
        if not updates:
            return {"message": "No fields to update"}

        await repository.update_episode(episode_num, **dict(updates))
        episode = repository.get_episode(episode_num)
        return episode_details_data(episode, episode_num)
