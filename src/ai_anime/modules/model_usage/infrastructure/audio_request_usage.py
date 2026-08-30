"""Project-local audio generation attempt records."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

from ai_anime.modules.model_usage.infrastructure.request_usage_db import (
    get_request_usage_db_path,
    request_usage_connection as _connect,
)

get_audio_request_usage_db_path = get_request_usage_db_path


def record_audio_generation_attempt(
    *,
    project_output_dir: str | Path,
    request_id: str,
    provider: str,
    model_name: str,
    task_type: str,
    scope: str,
    episode: int | None = None,
    speaker: str | None = None,
) -> None:
    now = datetime.now().isoformat()
    with _connect(project_output_dir) as conn:
        conn.execute(
            """
            INSERT INTO audio_request_usage (
                request_id, provider, model_name, task_type, scope,
                episode, speaker, status, accepted_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'accepted', ?, ?)
            ON CONFLICT(request_id) DO NOTHING
            """,
            (
                request_id,
                provider,
                model_name,
                task_type,
                scope,
                episode,
                speaker,
                now,
                now,
            ),
        )


def update_audio_generation_attempt(
    *,
    project_output_dir: str | Path,
    request_id: str,
    status: str,
    error_message: str | None = None,
) -> None:
    now = datetime.now().isoformat()
    completed_at = now if status in {"completed", "failed"} else None
    with _connect(project_output_dir) as conn:
        conn.execute(
            """
            UPDATE audio_request_usage
            SET status = ?,
                updated_at = ?,
                completed_at = COALESCE(?, completed_at),
                error_message = COALESCE(?, error_message)
            WHERE request_id = ?
            """,
            (status, now, completed_at, error_message, request_id),
        )


def count_audio_scope_attempts(
    *,
    project_output_dir: str | Path,
    task_type: str,
    scope: str,
    episode: int | None = None,
) -> int:
    where = ["task_type = ?", "scope = ?"]
    params: list[object] = [task_type, scope]
    if episode is not None:
        where.append("episode = ?")
        params.append(int(episode))
    with _connect(project_output_dir) as conn:
        row = conn.execute(
            f"SELECT COUNT(*) FROM audio_request_usage WHERE {' AND '.join(where)}",
            tuple(params),
        ).fetchone()
    return int(row[0] or 0) if row else 0
