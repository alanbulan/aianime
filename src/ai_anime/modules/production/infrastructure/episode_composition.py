"""Episode composition assets and request provenance."""

from __future__ import annotations

import hashlib
import json
import tempfile
from pathlib import Path
from typing import Any, Iterable

from ai_anime.modules.model_usage.public import write_model_audio_music
from ai_anime.shared.utils.state_index_files import (
    resolve_state_index_path,
    write_json_atomic,
)


def episode_bgm_path(project_dir: str | Path, episode_num: int) -> Path:
    return Path(project_dir) / "audio" / "episodes" / f"ep{episode_num:03d}_bgm.mp3"


def _episode_content(beats: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "beat_number": int(beat.get("beat_number") or index + 1),
            "narration_segment": str(beat.get("narration_segment") or "").strip(),
            "visual_description": str(beat.get("visual_description") or "").strip(),
        }
        for index, beat in enumerate(beats)
    ]


def _episode_content_digest(beats: Iterable[dict[str, Any]]) -> str:
    payload = json.dumps(
        _episode_content(beats),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _build_episode_bgm_prompt(
    episode_num: int,
    beats: Iterable[dict[str, Any]],
) -> str:
    cues: list[str] = []
    for beat in _episode_content(beats):
        visual = beat["visual_description"]
        narration = beat["narration_segment"]
        cue = "；".join(value for value in (visual, narration) if value)
        if cue:
            cues.append(f"Beat {beat['beat_number']}: {cue[:280]}")
        if sum(len(item) for item in cues) >= 3200:
            break
    story_cues = "\n".join(cues) or "保持连贯、克制的电影叙事氛围"
    return (
        f"Create one continuous instrumental cinematic underscore for episode {episode_num}. "
        "No vocals, lyrics, spoken words, dialogue, or abrupt ending. Keep the arrangement "
        "subtle and dialogue-friendly, with smooth emotional transitions that follow these "
        f"story beats:\n{story_cues}"
    )


async def generate_episode_bgm(
    *,
    project_dir: str | Path,
    episode_num: int,
    beats: Iterable[dict[str, Any]],
    duration_seconds: float,
) -> Path:
    """Generate or reuse one episode-level instrumental BGM asset."""

    beat_list = list(beats)
    requested_duration = max(3.0, min(float(duration_seconds), 600.0))
    output_path = episode_bgm_path(project_dir, episode_num)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    metadata_path = resolve_state_index_path(
        output_path.parent,
        f"ep{episode_num:03d}_bgm.json",
    )
    signature = {
        "version": 1,
        "episode": episode_num,
        "content_sha256": _episode_content_digest(beat_list),
        "duration_seconds": round(requested_duration, 3),
    }
    try:
        cached_signature = json.loads(metadata_path.read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError):
        cached_signature = None
    if (
        cached_signature == signature
        and output_path.is_file()
        and output_path.stat().st_size > 0
    ):
        return output_path

    prompt = _build_episode_bgm_prompt(episode_num, beat_list)
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            prefix=f".ep{episode_num:03d}_bgm-",
            suffix=".mp3",
            dir=output_path.parent,
            delete=False,
        ) as handle:
            temporary_path = Path(handle.name)
        temporary_path.unlink(missing_ok=True)
        await write_model_audio_music(
            output_path=temporary_path,
            prompt=prompt,
            duration_seconds=requested_duration,
            response_format="mp3",
            parameters={
                "force_instrumental": True,
                "respect_sections_durations": True,
                "output_format": "mp3_44100_128",
            },
            timeout_seconds=900.0,
        )
        if not temporary_path.is_file() or temporary_path.stat().st_size <= 0:
            raise RuntimeError("背景音乐生成完成但未写入有效音频文件")
        temporary_path.replace(output_path)
        write_json_atomic(metadata_path, signature)
        return output_path
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)


def _source_signature(project_dir: Path, source_paths: Iterable[str | Path]) -> list[dict[str, Any]]:
    signatures: list[dict[str, Any]] = []
    for source in source_paths:
        path = Path(source)
        stat = path.stat()
        try:
            stored_path = path.resolve().relative_to(project_dir.resolve()).as_posix()
        except ValueError:
            stored_path = path.resolve().as_posix()
        signatures.append(
            {
                "path": stored_path,
                "mtime_ns": int(stat.st_mtime_ns),
                "size": int(stat.st_size),
            }
        )
    return sorted(signatures, key=lambda item: item["path"])


def _composition_signature(
    *,
    project_dir: Path,
    episode_num: int,
    beats: Iterable[dict[str, Any]],
    source_paths: Iterable[str | Path],
    resolution: str,
    add_subtitles: bool,
    add_bgm: bool,
) -> dict[str, Any]:
    return {
        "version": 1,
        "episode": episode_num,
        "resolution": str(resolution).strip().lower().replace("×", "x"),
        "add_subtitles": bool(add_subtitles),
        "add_bgm": bool(add_bgm),
        "content_sha256": _episode_content_digest(beats),
        "sources": _source_signature(project_dir, source_paths),
    }


def _composition_manifest_path(project_dir: Path, episode_num: int) -> Path:
    return resolve_state_index_path(
        project_dir / "videos" / "episodes",
        f"ep{episode_num:03d}_composition.json",
    )


def episode_composition_is_current(
    *,
    project_dir: str | Path,
    episode_num: int,
    beats: Iterable[dict[str, Any]],
    source_paths: Iterable[str | Path],
    resolution: str,
    add_subtitles: bool,
    add_bgm: bool,
) -> bool:
    project_path = Path(project_dir)
    final_path = project_path / "videos" / "episodes" / f"ep{episode_num:03d}_final.mp4"
    source_list = [Path(path) for path in source_paths]
    if not final_path.is_file() or not source_list or not all(path.is_file() for path in source_list):
        return False
    try:
        stored = json.loads(
            _composition_manifest_path(project_path, episode_num).read_text(encoding="utf-8")
        )
        expected = _composition_signature(
            project_dir=project_path,
            episode_num=episode_num,
            beats=beats,
            source_paths=source_list,
            resolution=resolution,
            add_subtitles=add_subtitles,
            add_bgm=add_bgm,
        )
    except (OSError, ValueError, TypeError):
        return False
    return stored == expected


def write_episode_composition_manifest(
    *,
    project_dir: str | Path,
    episode_num: int,
    beats: Iterable[dict[str, Any]],
    source_paths: Iterable[str | Path],
    resolution: str,
    add_subtitles: bool,
    add_bgm: bool,
) -> None:
    project_path = Path(project_dir)
    payload = _composition_signature(
        project_dir=project_path,
        episode_num=episode_num,
        beats=beats,
        source_paths=source_paths,
        resolution=resolution,
        add_subtitles=add_subtitles,
        add_bgm=add_bgm,
    )
    write_json_atomic(_composition_manifest_path(project_path, episode_num), payload)


__all__ = [
    "episode_bgm_path",
    "episode_composition_is_current",
    "generate_episode_bgm",
    "write_episode_composition_manifest",
]
