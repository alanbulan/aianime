"""Shared voice-sample constraints and durable file replacement."""

from __future__ import annotations

import math
import uuid
from datetime import datetime, timezone
from pathlib import Path

from ai_anime.shared.utils.atomic_files import replace_bytes_atomically

VOICE_SAMPLE_EXTENSIONS = (".mp3", ".wav", ".m4a", ".aac", ".ogg")
READABLE_VOICE_EXTENSIONS = (*VOICE_SAMPLE_EXTENSIONS, ".webm")
SUPPORTED_VOICE_SAMPLE_MESSAGE = "仅支持 mp3 / wav / m4a / aac / ogg"
REFERENCE_VOICE_MIN_SECONDS = 1.8
REFERENCE_VOICE_MAX_SECONDS = 15.2


def voice_sample_extension(filename: str) -> str:
    extension = Path(str(filename or "")).suffix.lower()
    return extension if extension in VOICE_SAMPLE_EXTENSIONS else ".wav"


def is_supported_voice_sample(filename: str) -> bool:
    return Path(str(filename or "")).suffix.lower() in VOICE_SAMPLE_EXTENSIONS


def validate_reference_voice_duration_seconds(duration: float) -> float:
    value = float(duration)
    if (
        not math.isfinite(value)
        or value < REFERENCE_VOICE_MIN_SECONDS
        or value > REFERENCE_VOICE_MAX_SECONDS
    ):
        raise ValueError(
            "参考声线时长必须在 "
            f"{REFERENCE_VOICE_MIN_SECONDS:g}-{REFERENCE_VOICE_MAX_SECONDS:g} 秒内"
            f"（当前 {value:.3f} 秒）"
        )
    return value


def archive_voice_siblings(target: Path) -> tuple[Path, ...]:
    """Archive canonical voice siblings without timestamp-name collisions."""

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    nonce = uuid.uuid4().hex[:8]
    archived: list[Path] = []
    for extension in VOICE_SAMPLE_EXTENSIONS:
        sibling = target.with_suffix(extension)
        if not sibling.exists():
            continue
        backup = sibling.with_name(
            f"{sibling.stem}_{stamp}_{nonce}{sibling.suffix}"
        )
        sibling.replace(backup)
        archived.append(backup)
    return tuple(archived)


def replace_voice_sample_content(target: Path, content: bytes) -> None:
    if not content:
        raise ValueError("音频内容为空")
    archive_voice_siblings(target)
    replace_bytes_atomically(
        target,
        content,
        sync_file=True,
        sync_directory=True,
    )


__all__ = [
    "REFERENCE_VOICE_MAX_SECONDS",
    "REFERENCE_VOICE_MIN_SECONDS",
    "READABLE_VOICE_EXTENSIONS",
    "SUPPORTED_VOICE_SAMPLE_MESSAGE",
    "VOICE_SAMPLE_EXTENSIONS",
    "archive_voice_siblings",
    "is_supported_voice_sample",
    "replace_voice_sample_content",
    "validate_reference_voice_duration_seconds",
    "voice_sample_extension",
]
