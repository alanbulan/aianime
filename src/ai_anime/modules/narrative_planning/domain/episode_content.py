from __future__ import annotations

from dataclasses import dataclass


class RawEpisodeContentMissing(ValueError):
    def __init__(self, episode_num: int) -> None:
        super().__init__(f"第 {episode_num} 集尚未有原文，请先填写 raw-content")


@dataclass(frozen=True)
class NormalizedEpisodeRewrite:
    content: str
    line_count: int
    used_fallback: bool


def normalize_episode_rewrite(
    raw_content: str,
    rewritten_content: str,
) -> NormalizedEpisodeRewrite:
    source = (raw_content or "").strip()
    normalized = (rewritten_content or "").strip()
    if normalized == source:
        normalized = ""

    return NormalizedEpisodeRewrite(
        content=normalized,
        line_count=sum(1 for line in normalized.splitlines() if line.strip()),
        used_fallback=not bool(normalized),
    )
