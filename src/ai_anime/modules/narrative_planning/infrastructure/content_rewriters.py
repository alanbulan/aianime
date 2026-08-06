from __future__ import annotations


async def rewrite_episode_content(
    raw_content: str,
    *,
    episode_title: str,
    protagonist_name: str,
    target_beats: int,
    beat_chars_range: tuple[int, int],
    narration_style: str,
) -> str:
    from ai_anime.modules.agents.public import rewrite_episode_content as rewrite

    return await rewrite(
        raw_content,
        episode_title=episode_title,
        protagonist_name=protagonist_name,
        target_beats=target_beats,
        beat_chars_range=beat_chars_range,
        narration_style=narration_style,
    )
