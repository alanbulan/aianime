"""Storage helpers for character-level reference audio.

Writes voice sample files under ``assets/characters/{char}/voices/`` and returns
the metadata required by ``NovelCharacter.reference_audio_*`` /
``voice_samples_by_age_group``.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

from ai_anime.modules.asset_world.domain.character_voice import (
    ALL_SLOTS,
    DEFAULT_SLOT,
)
from ai_anime.shared.utils.media_io import get_audio_duration
from ai_anime.shared.utils.time_format import utc_now_iso
from ai_anime.shared.utils.voice_samples import (
    REFERENCE_VOICE_MAX_SECONDS,
    SUPPORTED_VOICE_SAMPLE_MESSAGE,
    VOICE_SAMPLE_EXTENSIONS,
    archive_voice_siblings,
    is_supported_voice_sample,
    replace_voice_sample_content,
    voice_sample_extension,
)

RECORDED_AUDIO_EXTENSION_BY_MIME = {
    "audio/webm": ".webm",
    "audio/webm;codecs=opus": ".webm",
    "audio/ogg": ".ogg",
    "audio/ogg;codecs=opus": ".ogg",
    "audio/mp4": ".m4a",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
}


def decode_recorded_audio_data_url(data_url: str) -> tuple[bytes, str]:
    """Decode a browser MediaRecorder data URL into (content, extension).

    Outputs are always re-encoded into a model-gateway-compatible format. Browser
    MediaRecorder defaults to webm/opus, while some speech models require MP3, so
    anything not already in :data:`VOICE_SAMPLE_EXTENSIONS` is transcoded to
    mp3 via ffmpeg.
    """
    prefix, separator, payload = str(data_url or "").partition(",")
    if not separator or not prefix.startswith("data:") or ";base64" not in prefix:
        raise ValueError("录音数据格式不正确")
    mime_type = prefix[5:].split(";", 1)[0].lower()
    extension = RECORDED_AUDIO_EXTENSION_BY_MIME.get(mime_type, ".webm")
    try:
        content = base64.b64decode(payload, validate=True)
    except binascii.Error as exc:
        raise ValueError("录音数据不是有效的 base64") from exc
    if not content:
        raise ValueError("录音数据为空")
    if extension not in VOICE_SAMPLE_EXTENSIONS:
        content = _transcode_to_mp3(content)
        extension = ".mp3"
    return content, extension


def _transcode_to_mp3(content: bytes) -> bytes:
    """Pipe *content* through ffmpeg and return mp3 bytes."""
    if not shutil.which("ffmpeg"):
        raise ValueError("系统未安装 ffmpeg，无法转码录音为 mp3")
    try:
        result = subprocess.run(
            [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "error",
                "-i",
                "pipe:0",
                "-vn",
                "-acodec",
                "libmp3lame",
                "-b:a",
                "128k",
                "-f",
                "mp3",
                "pipe:1",
            ],
            input=content,
            capture_output=True,
            check=True,
            timeout=60,
        )
    except subprocess.TimeoutExpired as exc:
        raise ValueError("ffmpeg 转码超时（60 秒）") from exc
    except subprocess.CalledProcessError as exc:
        stderr = (exc.stderr or b"").decode("utf-8", "ignore").strip()
        raise ValueError(f"ffmpeg 转码失败：{stderr or exc}") from exc
    if not result.stdout:
        raise ValueError("ffmpeg 转码后输出为空")
    return result.stdout


def probe_voice_sample_duration_seconds(path: str | Path) -> float:
    """Return audio duration in seconds using ffprobe."""
    try:
        return get_audio_duration(str(path))
    except ValueError as exc:
        raise ValueError(f"无法读取音频时长：{exc}") from exc


def trim_voice_sample_content(
    content: bytes,
    *,
    filename: str,
    start_seconds: float = 0.0,
    duration_seconds: float = 4.0,
) -> tuple[bytes, str]:
    """Trim uploaded/recorded voice content to a video-reference MP3 clip."""

    if not content:
        raise ValueError("音频内容为空")
    if not is_supported_voice_sample(filename):
        raise ValueError(SUPPORTED_VOICE_SAMPLE_MESSAGE)
    if not shutil.which("ffmpeg"):
        raise ValueError("系统未安装 ffmpeg，无法裁剪声线")
    try:
        start = max(0.0, float(start_seconds))
        duration = float(duration_seconds)
    except (TypeError, ValueError) as exc:
        raise ValueError("裁剪时间参数无效") from exc
    if duration <= 0:
        raise ValueError("裁剪时长必须大于 0 秒")
    if duration > REFERENCE_VOICE_MAX_SECONDS:
        raise ValueError(
            "视频参考声线单段最长 "
            f"{REFERENCE_VOICE_MAX_SECONDS:g} 秒"
        )

    suffix = voice_sample_extension(filename)
    with tempfile.TemporaryDirectory() as tmp:
        input_path = Path(tmp) / f"input{suffix}"
        output_path = Path(tmp) / "voice_trimmed.mp3"
        input_path.write_bytes(content)
        try:
            subprocess.run(
                [
                    "ffmpeg",
                    "-y",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-ss",
                    f"{start:.3f}",
                    "-t",
                    f"{duration:.3f}",
                    "-i",
                    str(input_path),
                    "-vn",
                    "-ac",
                    "1",
                    "-ar",
                    "16000",
                    "-acodec",
                    "libmp3lame",
                    "-b:a",
                    "64k",
                    str(output_path),
                ],
                capture_output=True,
                check=True,
                timeout=60,
            )
        except subprocess.TimeoutExpired as exc:
            raise ValueError("ffmpeg 裁剪超时（60 秒）") from exc
        except subprocess.CalledProcessError as exc:
            stderr = (exc.stderr or b"").decode("utf-8", "ignore").strip()
            raise ValueError(f"ffmpeg 裁剪失败：{stderr or exc}") from exc
        output = output_path.read_bytes() if output_path.exists() else b""
        if not output:
            raise ValueError("ffmpeg 裁剪后输出为空")
        return output, "voice_trimmed.mp3"


def _safe_asset_name(value: str) -> str:
    return re.sub(r'[/\\:*?"<>|]', "_", str(value or "").strip())


def read_character_voice_source(source_path: str | Path) -> tuple[bytes, str]:
    """Read a reusable voice asset and normalize browser-only WebM to MP3."""
    source = Path(source_path)
    if not source.exists() or not source.is_file():
        raise ValueError("声线文件不存在")
    content = source.read_bytes()
    if not content:
        raise ValueError("声线文件为空")
    if source.suffix.lower() in VOICE_SAMPLE_EXTENSIONS:
        return content, source.name
    if source.suffix.lower() == ".webm":
        return _transcode_to_mp3(content), f"{source.stem}.mp3"
    raise ValueError(SUPPORTED_VOICE_SAMPLE_MESSAGE)


def character_voice_path(
    *,
    project_dir: str | Path,
    character_name: str,
    slot: str,
    filename: str,
) -> Path:
    """Return the on-disk path for a character voice slot.

    ``slot="default"`` → ``voice_default{ext}``; age-group slot → ``voice_{slot}{ext}``.
    """
    if slot not in ALL_SLOTS:
        raise ValueError(f"Unsupported voice slot: {slot}")
    safe_char = _safe_asset_name(character_name)
    if not safe_char:
        raise ValueError("character_name cannot be empty")
    ext = voice_sample_extension(filename)
    voices_dir = Path(project_dir) / "assets" / "characters" / safe_char / "voices"
    stem = "voice_default" if slot == DEFAULT_SLOT else f"voice_{slot}"
    return voices_dir / f"{stem}{ext}"


def voice_content_sha256(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def project_relative_path(project_dir: str | Path, path: str | Path) -> str:
    return Path(path).resolve().relative_to(Path(project_dir).resolve()).as_posix()


def persist_character_voice_file(
    *,
    project_dir: str | Path,
    character_name: str,
    slot: str,
    filename: str,
    content: bytes,
) -> tuple[str, str, str]:
    """Write *content* to the slot and return (rel_path, sha256, updated_at).

    Existing files in any of the supported extensions for the same slot are
    archived (renamed with a timestamp suffix) so the resolver only ever sees
    the freshly written file.
    """
    if not is_supported_voice_sample(filename):
        raise ValueError(SUPPORTED_VOICE_SAMPLE_MESSAGE)
    if not content:
        raise ValueError("音频文件为空")

    target = character_voice_path(
        project_dir=project_dir,
        character_name=character_name,
        slot=slot,
        filename=filename,
    )
    target.parent.mkdir(parents=True, exist_ok=True)
    replace_voice_sample_content(target, content)

    rel_path = project_relative_path(project_dir, target)
    return rel_path, voice_content_sha256(content), utc_now_iso()


def trim_existing_character_voice_file(
    *,
    project_dir: str | Path,
    character_name: str,
    slot: str,
    source_path: str | Path,
    start_seconds: float = 0.0,
    duration_seconds: float = 4.0,
) -> tuple[str, str, str]:
    """Trim an already configured voice file and write it back to the same slot."""

    source = Path(source_path)
    if not source.is_absolute():
        source = Path(project_dir) / source
    if not source.exists():
        raise ValueError(f"声线文件不存在：{source_path}")

    content, filename = trim_voice_sample_content(
        source.read_bytes(),
        filename=source.name,
        start_seconds=start_seconds,
        duration_seconds=duration_seconds,
    )
    return persist_character_voice_file(
        project_dir=project_dir,
        character_name=character_name,
        slot=slot,
        filename=filename,
        content=content,
    )


def clear_character_voice_file(
    *,
    project_dir: str | Path,
    character_name: str,
    slot: str,
) -> bool:
    """Archive any existing voice file for the slot. Returns True if anything was removed."""
    safe_char = _safe_asset_name(character_name)
    if not safe_char:
        return False
    voices_dir = Path(project_dir) / "assets" / "characters" / safe_char / "voices"
    if not voices_dir.exists():
        return False
    stem = "voice_default" if slot == DEFAULT_SLOT else f"voice_{slot}"
    return bool(archive_voice_siblings(voices_dir / f"{stem}.wav"))


def identity_voice_path(
    *,
    project_dir: str | Path,
    character_name: str,
    identity_id: str,
    filename: str,
) -> Path:
    safe_char = _safe_asset_name(character_name)
    safe_identity = _safe_asset_name(identity_id)
    if not safe_char or not safe_identity:
        raise ValueError("character_name 和 identity_id 不能为空")
    ext = voice_sample_extension(filename)
    return (
        Path(project_dir)
        / "assets"
        / "characters"
        / safe_char
        / "identities"
        / safe_identity
        / f"voice_reference{ext}"
    )


def persist_identity_voice_file(
    *,
    project_dir: str | Path,
    character_name: str,
    identity_id: str,
    filename: str,
    content: bytes,
) -> tuple[str, str, str]:
    if not is_supported_voice_sample(filename):
        raise ValueError(SUPPORTED_VOICE_SAMPLE_MESSAGE)
    if not content:
        raise ValueError("音频文件为空")
    target = identity_voice_path(
        project_dir=project_dir,
        character_name=character_name,
        identity_id=identity_id,
        filename=filename,
    )
    target.parent.mkdir(parents=True, exist_ok=True)
    replace_voice_sample_content(target, content)
    return (
        project_relative_path(project_dir, target),
        voice_content_sha256(content),
        utc_now_iso(),
    )


def clear_identity_voice_file(
    *,
    project_dir: str | Path,
    character_name: str,
    identity_id: str,
) -> bool:
    safe_char = _safe_asset_name(character_name)
    safe_identity = _safe_asset_name(identity_id)
    if not safe_char or not safe_identity:
        return False
    voice_dir = (
        Path(project_dir)
        / "assets"
        / "characters"
        / safe_char
        / "identities"
        / safe_identity
    )
    if not voice_dir.exists():
        return False
    return bool(archive_voice_siblings(voice_dir / "voice_reference.wav"))


class LocalCharacterVoiceFiles:
    @staticmethod
    def decode_recording(data_url: str) -> tuple[bytes, str]:
        return decode_recorded_audio_data_url(data_url)

    @staticmethod
    def read_source(source_path: str | Path) -> tuple[bytes, str]:
        return read_character_voice_source(source_path)

    @staticmethod
    def persist(
        *,
        project_dir: str | Path,
        character_name: str,
        slot: str,
        filename: str,
        content: bytes,
    ) -> tuple[str, str, str]:
        return persist_character_voice_file(
            project_dir=project_dir,
            character_name=character_name,
            slot=slot,
            filename=filename,
            content=content,
        )

    @staticmethod
    def trim(
        *,
        project_dir: str | Path,
        character_name: str,
        slot: str,
        source_path: str | Path,
        start_seconds: float,
        duration_seconds: float,
    ) -> tuple[str, str, str]:
        return trim_existing_character_voice_file(
            project_dir=project_dir,
            character_name=character_name,
            slot=slot,
            source_path=source_path,
            start_seconds=start_seconds,
            duration_seconds=duration_seconds,
        )

    @staticmethod
    def clear(
        *,
        project_dir: str | Path,
        character_name: str,
        slot: str,
    ) -> bool:
        return clear_character_voice_file(
            project_dir=project_dir,
            character_name=character_name,
            slot=slot,
        )

    @staticmethod
    def persist_identity(
        *,
        project_dir: str | Path,
        character_name: str,
        identity_id: str,
        filename: str,
        content: bytes,
    ) -> tuple[str, str, str]:
        return persist_identity_voice_file(
            project_dir=project_dir,
            character_name=character_name,
            identity_id=identity_id,
            filename=filename,
            content=content,
        )

    @staticmethod
    def clear_identity(
        *,
        project_dir: str | Path,
        character_name: str,
        identity_id: str,
    ) -> bool:
        return clear_identity_voice_file(
            project_dir=project_dir,
            character_name=character_name,
            identity_id=identity_id,
        )
