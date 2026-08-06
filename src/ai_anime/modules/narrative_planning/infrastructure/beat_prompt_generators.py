from __future__ import annotations

from pathlib import Path
from typing import Any

from ai_anime.modules.narrative_planning.application.ports import (
    NarrativeScriptStore,
)


def _first_existing_path(*paths: Path) -> str:
    for path in paths:
        if path.exists():
            return str(path)
    return ""


async def generate_single_beat_video_prompt(
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
) -> str:
    from ai_anime.modules.agents.public import (
        _build_color_appearance_map,
        get_global_video_optimizer,
    )
    from ai_anime.utils.path_resolver import PathResolver

    beat_num = int(beat.get("beat_number") or 0)
    paths = PathResolver(str(output_dir), episode)
    sketch_image_path = _first_existing_path(
        paths.sketch(beat_num),
        paths.frame(beat_num),
    )
    if not sketch_image_path:
        raise ValueError(f"Beat {beat_num} 缺少草图或首帧，请先生成草图或预览")

    characters = [
        character.model_dump()
        if hasattr(character, "model_dump")
        else dict(character)
        for character in (store.get_all_characters() or [])
    ]
    character_color_map = _build_color_appearance_map(
        all_beats,
        characters,
        str(output_dir),
        project_name,
        episode=episode,
        cognee_store=store,
    )
    result = await get_global_video_optimizer().optimize_single_beat(
        beat=beat,
        sketch_image_path=sketch_image_path,
        character_color_map=character_color_map,
        language=language,
        prev_beat=previous_beat,
        next_beat=next_beat,
        prev_prompt=None,
        total_beats=len(all_beats),
    )
    return str(result.get("prompt") or "").strip()


async def generate_single_beat_keyframe_prompt(
    *,
    output_dir: str | Path,
    episode: int,
    beat: dict[str, Any],
    next_beat: dict[str, Any],
    language: str,
) -> str:
    from ai_anime.modules.agents.public import get_keyframe_prompt_builder
    from ai_anime.modules.narrative_planning.application.script_models import (
        format_beat_narration,
    )
    from ai_anime.utils.path_resolver import PathResolver

    beat_num = int(beat.get("beat_number") or 0)
    next_beat_num = int(next_beat.get("beat_number") or beat_num + 1)
    paths = PathResolver(str(output_dir), episode)
    first_frame_path = _first_existing_path(
        paths.frame(beat_num),
        paths.sketch(beat_num),
    )
    last_frame_path = _first_existing_path(
        paths.frame(next_beat_num),
        paths.sketch(next_beat_num),
    )
    if not first_frame_path:
        raise ValueError(f"Beat {beat_num} 缺少首帧或草图，请先生成预览或草图")
    if not last_frame_path:
        raise ValueError(
            f"Beat {next_beat_num} 缺少首帧或草图，请先生成预览或草图"
        )

    audio_type = str(beat.get("audio_type") or "narration")
    narration = str(beat.get("narration_segment") or "")
    narration_text = format_beat_narration(
        audio_type,
        str(beat.get("speaker") or ""),
        narration,
    )
    return await get_keyframe_prompt_builder().build(
        first_frame_path=first_frame_path,
        last_frame_path=last_frame_path,
        narration=narration_text,
        next_narration=str(next_beat.get("narration_segment") or ""),
        language=language,
        visual_description=str(beat.get("visual_description") or ""),
        next_visual_description=str(next_beat.get("visual_description") or ""),
        audio_type=audio_type,
        dialogue_line=narration if audio_type == "dialogue" else "",
        allow_fallback=False,
    )
