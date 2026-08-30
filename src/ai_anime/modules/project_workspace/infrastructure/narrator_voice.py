"""Project narrator voice persistence."""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any

from ai_anime.modules.project_workspace.application.project_scope import ProjectContext
from ai_anime.modules.project_workspace.infrastructure.project_config import (
    set_narrator_reference_audio,
)
from ai_anime.shared.utils.voice_samples import (
    SUPPORTED_VOICE_SAMPLE_MESSAGE,
    archive_voice_siblings,
    is_supported_voice_sample,
    replace_voice_sample_content,
    voice_sample_extension,
)


def narrator_voice_path(project_dir: str | Path, filename: str) -> Path:
    return (
        Path(project_dir)
        / "assets"
        / "narrator"
        / f"voice{voice_sample_extension(filename)}"
    )


def persist_narrator_voice_content(
    *,
    username: str,
    project: str,
    project_dir: str | Path,
    filename: str,
    content: bytes,
) -> Path:
    """Persist one canonical narrator voice and update its descriptor."""

    if not is_supported_voice_sample(filename):
        raise ValueError(
            f"{SUPPORTED_VOICE_SAMPLE_MESSAGE}（收到：{filename or '未知文件'}）"
        )
    if not content:
        raise ValueError("音频内容为空")

    project_root = Path(project_dir)
    target = narrator_voice_path(project_root, filename)
    replace_voice_sample_content(target, content)
    relative_path = target.relative_to(project_root).as_posix()
    set_narrator_reference_audio(
        username,
        project,
        relative_path=relative_path,
        sha256=hashlib.sha256(content).hexdigest(),
    )
    return target


def clear_narrator_voice_content(
    *,
    username: str,
    project: str,
    project_dir: str | Path,
    stored_path: str | Path,
) -> bool:
    project_root = Path(project_dir).resolve()
    raw_path = Path(stored_path)
    target = raw_path if raw_path.is_absolute() else project_root / raw_path
    target = target.resolve()
    try:
        target.relative_to(project_root)
    except ValueError as exc:
        raise ValueError("解说声线路径不属于当前项目") from exc
    archived = archive_voice_siblings(target) if str(stored_path) else ()
    set_narrator_reference_audio(
        username,
        project,
        relative_path="",
        sha256="",
    )
    return bool(archived)


def persist_narrator_voice_source(
    context: ProjectContext,
    source_path: str | Path,
) -> dict[str, Any]:
    """Copy a generated reusable voice into the durable project narrator slot."""

    source = Path(source_path)
    if not is_supported_voice_sample(source.name):
        raise ValueError(SUPPORTED_VOICE_SAMPLE_MESSAGE)
    content = source.read_bytes()
    if not content:
        raise ValueError("音频内容为空")

    target = persist_narrator_voice_content(
        username=context.owner_username,
        project=context.project_name,
        project_dir=context.output_dir,
        filename=source.name,
        content=content,
    )
    relative_path = target.relative_to(Path(context.output_dir)).as_posix()
    digest = hashlib.sha256(content).hexdigest()
    return {
        "reference_path": relative_path,
        "sha256": digest,
    }


__all__ = [
    "clear_narrator_voice_content",
    "narrator_voice_path",
    "persist_narrator_voice_content",
    "persist_narrator_voice_source",
]
