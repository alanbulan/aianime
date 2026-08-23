"""Seedance 2.0 identity voice audio provenance records."""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from ai_anime.shared.infrastructure.sqlite_pragmas import configure_sqlite_connection
from ai_anime.migrations.production import run_production_migrations


@dataclass(frozen=True)
class Seedance2VoiceAudioRecord:
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
class Seedance2VoiceAudioState:
    state: str
    record: Seedance2VoiceAudioRecord | None = None


@contextmanager
def _connect(db_path: str | Path):
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=5, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    configure_sqlite_connection(conn)
    run_production_migrations(conn)
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def seedance2_voice_scope(episode: int, speaker: str) -> str:
    return f"ep{int(episode):03d}:{str(speaker or '').strip()}"


def seedance2_narration_scope(episode: int) -> str:
    return f"ep{int(episode):03d}:narrator"


def _row_to_record(row: sqlite3.Row | None) -> Seedance2VoiceAudioRecord | None:
    if row is None:
        return None
    return Seedance2VoiceAudioRecord(
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


def upsert_seedance2_voice_audio_record(
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
            INSERT INTO seedance2_voice_audio_records (
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


def get_seedance2_voice_audio_record(
    *,
    db_path: str | Path,
    episode_number: int,
    beat_number: int,
    speaker: str,
) -> Seedance2VoiceAudioRecord | None:
    with _connect(db_path) as conn:
        row = conn.execute(
            """
            SELECT *
            FROM seedance2_voice_audio_records
            WHERE episode_number = ? AND beat_number = ? AND speaker = ?
            """,
            (int(episode_number), int(beat_number), str(speaker or "").strip()),
        ).fetchone()
    return _row_to_record(row)


def classify_seedance2_voice_audio(
    *,
    db_path: str | Path,
    episode_number: int,
    beat_number: int,
    speaker: str,
    audio_path: str | Path,
    current_voice_sha256: str,
    current_text_sha256: str | None = None,
) -> Seedance2VoiceAudioState:
    path = Path(audio_path)
    if not path.exists() or path.stat().st_size <= 0:
        return Seedance2VoiceAudioState(state="missing", record=None)
    record = get_seedance2_voice_audio_record(
        db_path=db_path,
        episode_number=episode_number,
        beat_number=beat_number,
        speaker=speaker,
    )
    if record is None:
        return Seedance2VoiceAudioState(state="unknown", record=None)
    if record.voice_sha256 != str(current_voice_sha256 or "").strip():
        return Seedance2VoiceAudioState(state="stale", record=record)
    if current_text_sha256 is not None and record.text_sha256 != str(
        current_text_sha256 or ""
    ).strip():
        return Seedance2VoiceAudioState(state="stale", record=record)
    return Seedance2VoiceAudioState(state="current", record=record)
