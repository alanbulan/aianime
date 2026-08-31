"""Video voice-audio provenance records."""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from ai_anime.shared.infrastructure.sqlite_pragmas import configure_sqlite_connection
from ai_anime.migrations.production import (
    MIGRATION_VERSION,
    run_production_migrations,
)
from ai_anime.migrations.sqlite import ensure_sqlite_schema


@dataclass(frozen=True)
class VideoVoiceAudioRecord:
    episode_number: int
    beat_number: int
    speaker: str
    audio_path: str
    voice_sha256: str
    mode: str
    provider: str
    model: str
    generated_at: str
    status: str
    text_sha256: str = ""
    error: str = ""


@dataclass(frozen=True)
class VideoVoiceAudioState:
    state: str
    record: VideoVoiceAudioRecord | None = None


@contextmanager
def _connect(db_path: str | Path):
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    ensure_sqlite_schema(
        path,
        component="production",
        version=MIGRATION_VERSION,
        initialize=run_production_migrations,
    )
    conn = sqlite3.connect(path, timeout=10, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    configure_sqlite_connection(conn, set_journal_mode=False)
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def video_voice_scope(episode: int, speaker: str) -> str:
    return f"ep{int(episode):03d}:{str(speaker or '').strip()}"


def video_narration_scope(episode: int) -> str:
    return f"ep{int(episode):03d}:narrator"


def _row_to_record(row: sqlite3.Row | None) -> VideoVoiceAudioRecord | None:
    if row is None:
        return None
    return VideoVoiceAudioRecord(
        episode_number=int(row["episode_number"]),
        beat_number=int(row["beat_number"]),
        speaker=str(row["speaker"] or ""),
        audio_path=str(row["audio_path"] or ""),
        voice_sha256=str(row["voice_sha256"] or ""),
        text_sha256=str(row["text_sha256"] or ""),
        mode=str(row["mode"] or ""),
        provider=str(row["provider"] or ""),
        model=str(row["model"] or ""),
        generated_at=str(row["generated_at"] or ""),
        status=str(row["status"] or ""),
        error=str(row["error"] or ""),
    )


def upsert_video_voice_audio_record(
    *,
    db_path: str | Path,
    episode_number: int,
    beat_number: int,
    speaker: str,
    audio_path: str | Path,
    voice_sha256: str,
    text_sha256: str = "",
    mode: str,
    provider: str,
    model: str,
    status: str,
    error: str = "",
) -> None:
    generated_at = datetime.now(timezone.utc).isoformat()
    with _connect(db_path) as conn:
        conn.execute(
            """
            INSERT INTO video_voice_audio_records (
                episode_number, beat_number, speaker, audio_path, voice_sha256,
                text_sha256, mode, provider, model, generated_at, status, error
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(episode_number, beat_number, speaker) DO UPDATE SET
                audio_path = excluded.audio_path,
                voice_sha256 = excluded.voice_sha256,
                text_sha256 = excluded.text_sha256,
                mode = excluded.mode,
                provider = excluded.provider,
                model = excluded.model,
                generated_at = excluded.generated_at,
                status = excluded.status,
                error = excluded.error
            """,
            (
                int(episode_number),
                int(beat_number),
                str(speaker or "").strip(),
                str(audio_path),
                str(voice_sha256 or "").strip(),
                str(text_sha256 or "").strip(),
                str(mode or "").strip(),
                str(provider or "").strip(),
                str(model or "").strip(),
                generated_at,
                str(status or "").strip(),
                str(error or ""),
            ),
        )


def get_video_voice_audio_record(
    *,
    db_path: str | Path,
    episode_number: int,
    beat_number: int,
    speaker: str,
) -> VideoVoiceAudioRecord | None:
    with _connect(db_path) as conn:
        row = conn.execute(
            """
            SELECT *
            FROM video_voice_audio_records
            WHERE episode_number = ? AND beat_number = ? AND speaker = ?
            """,
            (int(episode_number), int(beat_number), str(speaker or "").strip()),
        ).fetchone()
    return _row_to_record(row)


def classify_video_voice_audio(
    *,
    db_path: str | Path,
    episode_number: int,
    beat_number: int,
    speaker: str,
    audio_path: str | Path,
    current_voice_sha256: str,
    current_text_sha256: str | None = None,
) -> VideoVoiceAudioState:
    path = Path(audio_path)
    if not path.exists() or path.stat().st_size <= 0:
        return VideoVoiceAudioState(state="missing", record=None)
    record = get_video_voice_audio_record(
        db_path=db_path,
        episode_number=episode_number,
        beat_number=beat_number,
        speaker=speaker,
    )
    if record is None:
        return VideoVoiceAudioState(state="unknown", record=None)
    if record.voice_sha256 != str(current_voice_sha256 or "").strip():
        return VideoVoiceAudioState(state="stale", record=record)
    if current_text_sha256 is not None and record.text_sha256 != str(
        current_text_sha256 or ""
    ).strip():
        return VideoVoiceAudioState(state="stale", record=record)
    return VideoVoiceAudioState(state="current", record=record)
