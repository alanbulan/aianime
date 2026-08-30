"""Account-scoped voice-reference storage for Creative Canvas."""

from __future__ import annotations

import json
import re
import uuid
from dataclasses import dataclass
from pathlib import Path

from ai_anime.shared.runtime_paths import OUTPUT_DIR
from ai_anime.modules.production.public import file_sha256
from ai_anime.shared.utils.media_io import get_audio_duration
from ai_anime.shared.utils.time_format import utc_now_iso
from ai_anime.shared.utils.voice_samples import READABLE_VOICE_EXTENSIONS

USER_VOICE_EXTENSIONS = frozenset(READABLE_VOICE_EXTENSIONS)
USER_VOICE_SCOPE = "user_custom"


@dataclass(frozen=True)
class CreativeCanvasVoiceResolution:
    audio_path: Path
    sha256: str
    source: str


def user_audio_voices_dir(username: str) -> Path:
    return Path(OUTPUT_DIR) / username / "_account" / "freezone" / "audio" / "voices"


def user_audio_voices_index_path(username: str) -> Path:
    return user_audio_voices_dir(username) / "voices.json"


def _safe_voice_name(value: str) -> str:
    return re.sub(r"[\x00-\x1f]", "", str(value or "").strip())[:80] or "未命名音色"


def _safe_extension(filename: str | None) -> str:
    suffix = Path(str(filename or "")).suffix.lower()
    if suffix not in USER_VOICE_EXTENSIONS:
        raise ValueError(
            "unsupported voice audio format; use mp3/wav/m4a/aac/ogg/webm"
        )
    return suffix


def _load_user_voice_records(username: str) -> list[dict]:
    path = user_audio_voices_index_path(username)
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return []
    records = data.get("voices", []) if isinstance(data, dict) else data
    if not isinstance(records, list):
        return []
    return [item for item in records if isinstance(item, dict)]


def _write_user_voice_records(username: str, records: list[dict]) -> None:
    path = user_audio_voices_index_path(username)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({"voices": records}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _user_voice_abs_path(username: str, record: dict) -> Path:
    return Path(OUTPUT_DIR) / username / str(record.get("path") or "")


def public_user_voice_payload(username: str, record: dict) -> dict:
    voice_id = str(record.get("voice_id") or "")
    label = str(
        record.get("name") or record.get("label") or voice_id or "未命名音色"
    )
    path = str(record.get("path") or "")
    absolute_path = _user_voice_abs_path(username, record)
    exists = bool(path and absolute_path.exists())
    return {
        "scope": USER_VOICE_SCOPE,
        "voice_id": voice_id,
        "label": label,
        "name": label,
        "path": path,
        "url": "",
        "exists": exists,
        "sha256": str(record.get("sha256") or ""),
        "duration_ms": int(record.get("duration_ms") or 0),
        "mime_type": str(record.get("mime_type") or ""),
        "created_at": str(record.get("created_at") or ""),
        "updated_at": str(record.get("updated_at") or ""),
        "source_filename": str(record.get("source_filename") or ""),
    }


def list_user_audio_voices(username: str) -> list[dict]:
    return [
        public_user_voice_payload(username, record)
        for record in _load_user_voice_records(username)
    ]


def create_user_audio_voice(
    *,
    username: str,
    name: str,
    filename: str | None,
    content: bytes,
    mime_type: str = "",
) -> dict:
    if not content:
        raise ValueError("voice audio file is empty")
    extension = _safe_extension(filename)
    voice_id = f"fv_{uuid.uuid4().hex[:16]}"
    relative_path = f"_account/freezone/audio/voices/{voice_id}/reference{extension}"
    absolute_path = Path(OUTPUT_DIR) / username / relative_path
    absolute_path.parent.mkdir(parents=True, exist_ok=True)
    absolute_path.write_bytes(content)

    try:
        sha256 = file_sha256(absolute_path)
        duration_ms = audio_duration_ms(absolute_path)
    except Exception:
        absolute_path.unlink(missing_ok=True)
        try:
            absolute_path.parent.rmdir()
        except OSError:
            pass
        raise

    now = utc_now_iso()
    record = {
        "voice_id": voice_id,
        "name": _safe_voice_name(name),
        "path": relative_path,
        "sha256": sha256,
        "duration_ms": duration_ms,
        "mime_type": mime_type or "application/octet-stream",
        "source_filename": Path(str(filename or "reference")).name,
        "created_at": now,
        "updated_at": now,
    }
    records = _load_user_voice_records(username)
    records.append(record)
    _write_user_voice_records(username, records)
    return public_user_voice_payload(username, record)


def resolve_user_audio_voice(
    username: str,
    voice_id: str,
) -> CreativeCanvasVoiceResolution:
    target = str(voice_id or "").strip()
    if not target:
        raise RuntimeError("user_custom voice_id is required")
    for record in _load_user_voice_records(username):
        if str(record.get("voice_id") or "") != target:
            continue
        path = _user_voice_abs_path(username, record)
        if not path.exists():
            raise RuntimeError(f"用户音色文件不存在: {target}")
        sha256 = str(record.get("sha256") or "") or file_sha256(path)
        return CreativeCanvasVoiceResolution(path, sha256, USER_VOICE_SCOPE)
    raise RuntimeError(f"用户音色不存在: {target}")


def delete_user_audio_voice(username: str, voice_id: str) -> None:
    target = str(voice_id or "").strip()
    if not target:
        raise RuntimeError("user_custom voice_id is required")

    records = _load_user_voice_records(username)
    record = next(
        (
            item
            for item in records
            if str(item.get("voice_id") or "") == target
        ),
        None,
    )
    if record is None:
        raise RuntimeError(f"用户音色不存在: {target}")

    voices_dir = user_audio_voices_dir(username).resolve()
    voice_dir = (voices_dir / target).resolve()
    audio_path = _user_voice_abs_path(username, record).resolve()
    if voice_dir.parent != voices_dir or audio_path.parent != voice_dir:
        raise RuntimeError(f"用户音色存储路径无效: {target}")
    if audio_path.exists():
        audio_path.unlink()
    try:
        voice_dir.rmdir()
    except OSError:
        pass

    _write_user_voice_records(
        username,
        [
            item
            for item in records
            if str(item.get("voice_id") or "") != target
        ],
    )


def audio_duration_ms(audio_path: Path) -> int:
    return int(get_audio_duration(str(audio_path)) * 1000)
