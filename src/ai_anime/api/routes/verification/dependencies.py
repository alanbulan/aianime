"""Shared request resolution for verification endpoints."""

from __future__ import annotations

from pathlib import Path

from ai_anime.api.deps import resolve_project_scope


def safe_output_name(name: str) -> str:
    trimmed = str(name or "").strip()
    if not trimmed:
        return "labels.jsonl"
    candidate = Path(trimmed).name
    if candidate != trimmed:
        raise ValueError("labels_name must be a file name under verify_reports/epXXX")
    if not candidate.endswith(".jsonl"):
        candidate += ".jsonl"
    return candidate


async def resolve_verification_project(
    project: str,
    user: dict,
    *,
    required_role: str = "viewer",
):
    return await resolve_project_scope(project, user, required_role=required_role)


async def load_beat_data(store, episode_num: int, beat_num: int) -> dict:
    beats = await store.get_beats_as_dicts(episode_num)
    for beat in beats:
        if int(beat.get("beat_number") or 0) == beat_num:
            return beat
    raise IndexError(f"Beat {beat_num} not found in episode {episode_num}")
