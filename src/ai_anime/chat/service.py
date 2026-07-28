"""AI chat service with project-scoped history and user-level agent sessions."""

from __future__ import annotations

import json
import os
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ai_anime.modules.ai_assistant.public import (
    get_agent_backend,
    get_agent_thread_runtime,
    get_hermes_runtime,
    get_project_assistant_replies,
)

agent_backend = get_agent_backend()
agent_thread_runtime = get_agent_thread_runtime()
hermes_runtime = get_hermes_runtime()
project_assistant_replies = get_project_assistant_replies()

_REINGEST_CANCELLED_BLOCK_RE = re.compile(
    r"\[AI_ANIME_REINGEST_CANCELLED\](.*?)\[/AI_ANIME_REINGEST_CANCELLED\]",
    re.DOTALL,
)


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _state_root() -> Path:
    configured = os.environ.get("AI_ANIME_STATE_DIR", "").strip()
    if configured:
        return Path(configured).expanduser()
    return _repo_root() / "state"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _project_state_dir(username: str, project: str) -> Path:
    base_dir = _state_root() / username / project
    base_dir.mkdir(parents=True, exist_ok=True)
    return base_dir


def _chat_input_history_path(username: str, project: str) -> Path:
    return _project_state_dir(username, project) / "chat_input_history.json"


def load_chat_input_history(username: str, project: str) -> list[str]:
    if not username or not project:
        return []
    path = _chat_input_history_path(username, project)
    if not path.exists():
        return []
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    if not isinstance(payload, list):
        return []
    history: list[str] = []
    for item in payload:
        text = str(item or "").strip()
        if text:
            history.append(text)
    return history


def save_chat_input_history(
    username: str, project: str, history: list[str], *, limit: int = 200
) -> None:
    if not username or not project:
        return
    cleaned: list[str] = []
    for item in history:
        text = str(item or "").strip()
        if text:
            cleaned.append(text)
    if limit > 0:
        cleaned = cleaned[-limit:]
    path = _chat_input_history_path(username, project)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(".tmp")
    tmp_path.write_text(
        json.dumps(cleaned, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    tmp_path.replace(path)


def _get_setting(conn: sqlite3.Connection, key: str) -> str | None:
    row = conn.execute(
        "SELECT value FROM chat_settings WHERE key = ?", (key,)
    ).fetchone()
    return str(row["value"]) if row else None


def _set_setting(conn: sqlite3.Connection, key: str, value: str) -> None:
    conn.execute(
        """
        INSERT INTO chat_settings(key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
        """,
        (key, value, _now_iso()),
    )
    conn.commit()


async def interrupt_chat_turn(
    username: str, project: str, thread_id: str, turn_id: str
) -> bool:
    return await agent_thread_runtime.interrupt(
        agent_backend.name(),
        thread_id,
        turn_id,
    )


async def prewarm_chat_backend(username: str, *, project: str | None = None) -> None:
    """Best-effort pre-warm of the per-user agent worker.

    Called when the user opens a chat / switches project so the first real
    message doesn't pay the full cold-start (spawn → initialize → session/new
    with startup probes). No-op unless the hermes backend is active; never
    raises — pre-warming is purely an optimization.
    """
    try:
        if agent_backend.name() != "hermes":
            return
        await hermes_runtime.prewarm(
            username,
            scope_kind="project" if project else "home",
            project_id=project or None,
        )
    except Exception:
        return


async def generate_assistant_reply(
    username: str, project: str, prompt: str
) -> dict[str, Any]:
    async def _ignore(_event: dict[str, Any]) -> None:
        return None

    return await project_assistant_replies.stream(
        username,
        project,
        prompt,
        _ignore,
    )
