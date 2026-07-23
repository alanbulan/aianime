from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from ai_anime.modules.narrative_planning.application.ports import (
    ContentRewriteGenerator,
    NarrativeContentStore,
)
from ai_anime.modules.narrative_planning.domain import (
    RawEpisodeContentMissing,
    normalize_episode_rewrite,
)


class EpisodeContentWriteFailed(ValueError):
    pass


@dataclass(frozen=True)
class EpisodeContentDocument:
    episode: int
    content: str

    def as_dict(self) -> dict[str, Any]:
        return {"episode": self.episode, "content": self.content}


@dataclass(frozen=True)
class SavedEpisodeContent:
    episode: int
    length: int

    def as_dict(self) -> dict[str, int]:
        return {"episode": self.episode, "length": self.length}


@dataclass(frozen=True)
class ClearedEpisodeContent:
    episode: int

    def as_dict(self) -> dict[str, int]:
        return {"episode": self.episode}


@dataclass(frozen=True)
class GeneratedEpisodeRewrite:
    episode: int
    line_count: int
    adapted_content: str
    used_fallback: bool

    def as_dict(self) -> dict[str, Any]:
        return {
            "episode": self.episode,
            "line_count": self.line_count,
            "adapted_content": self.adapted_content,
            "used_fallback": self.used_fallback,
        }


@dataclass(frozen=True)
class GenerateEpisodeRewriteCommand:
    episode_num: int
    target_beats: int
    beat_chars_min: int
    beat_chars_max: int
    narration_style: str | None


class EpisodeContentService:
    def __init__(self, *, rewrite_generator: ContentRewriteGenerator) -> None:
        self._rewrite_generator = rewrite_generator

    async def load_raw(
        self,
        store: NarrativeContentStore,
        episode_num: int,
    ) -> EpisodeContentDocument:
        content = await store.load_episode_content(episode_num) or ""
        return EpisodeContentDocument(episode=episode_num, content=content)

    async def save_raw(
        self,
        store: NarrativeContentStore,
        episode_num: int,
        content: str,
    ) -> SavedEpisodeContent:
        await store.save_episode_content(episode_num, content)
        return SavedEpisodeContent(episode=episode_num, length=len(content))

    async def load_adapted(
        self,
        store: NarrativeContentStore,
        episode_num: int,
    ) -> EpisodeContentDocument:
        content = await store.load_adapted_content(episode_num)
        return EpisodeContentDocument(episode=episode_num, content=content)

    async def save_adapted(
        self,
        store: NarrativeContentStore,
        episode_num: int,
        content: str,
    ) -> SavedEpisodeContent:
        try:
            await store.save_adapted_content(episode_num, content)
        except ValueError as exc:
            raise EpisodeContentWriteFailed(str(exc)) from exc
        return SavedEpisodeContent(episode=episode_num, length=len(content))

    async def clear_adapted(
        self,
        store: NarrativeContentStore,
        episode_num: int,
    ) -> ClearedEpisodeContent:
        try:
            await store.save_adapted_content(episode_num, "")
        except ValueError as exc:
            raise EpisodeContentWriteFailed(str(exc)) from exc
        return ClearedEpisodeContent(episode=episode_num)

    async def generate_rewrite(
        self,
        store: NarrativeContentStore,
        command: GenerateEpisodeRewriteCommand,
    ) -> GeneratedEpisodeRewrite:
        raw_content = (
            await store.load_episode_content(command.episode_num) or ""
        ).strip()
        if not raw_content:
            raise RawEpisodeContentMissing(command.episode_num)

        await store.load_graph_state()
        episode = store.get_episode(command.episode_num)
        rewritten = await self._rewrite_generator(
            raw_content,
            episode_title=str(getattr(episode, "title", "") or ""),
            protagonist_name=_resolve_narrator_main_name(store),
            target_beats=command.target_beats,
            beat_chars_range=(command.beat_chars_min, command.beat_chars_max),
            narration_style=command.narration_style or "first_person",
        )
        result = normalize_episode_rewrite(raw_content, rewritten)

        try:
            await store.save_adapted_content(command.episode_num, result.content)
            await store.update_episode(
                command.episode_num,
                beat_source_text=result.content,
            )
        except ValueError as exc:
            raise EpisodeContentWriteFailed(str(exc)) from exc

        return GeneratedEpisodeRewrite(
            episode=command.episode_num,
            line_count=result.line_count,
            adapted_content=result.content,
            used_fallback=result.used_fallback,
        )


def _resolve_narrator_main_name(store: NarrativeContentStore) -> str:
    for character in store.get_all_characters():
        if getattr(character, "is_main", False):
            return str(getattr(character, "name", "") or "")
    return ""
