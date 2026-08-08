"""SQLite-backed scoped chat history."""

from __future__ import annotations

import json
import os
import shutil
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ai_anime.modules.ai_assistant.domain import (
    ChatScope,
    strip_stored_assistant_replay,
)
from ai_anime.modules.ai_assistant.infrastructure.local_state import local_state_root
from ai_anime.shared.infrastructure.sqlite_pragmas import configure_sqlite_connection


class SQLiteChatHistory:
    def db_for(self, username: str, scope: ChatScope) -> Path:
        if scope.kind == "home":
            return local_state_root() / username / "_home" / "chat.db"
        if scope.kind == "project":
            return local_state_root() / username / str(scope.id) / "chat.db"
        return (
            local_state_root() / username / f"_{scope.kind}" / str(scope.id) / "chat.db"
        )

    def connect(self, username: str, scope: ChatScope) -> sqlite3.Connection:
        if scope.kind == "project":
            return self._connect_database(
                self.project_db_for(username, str(scope.id or ""))
            )
        return self._connect_database(self.db_for(username, scope))

    def project_db_for(
        self,
        username: str,
        project: str,
        *,
        project_dir: str | Path | None = None,
        project_state_dir: str | Path | None = None,
    ) -> Path:
        db_path = (
            Path(project_state_dir) / "chat.db"
            if project_state_dir is not None
            else self.db_for(username, ChatScope(kind="project", id=project))
        )
        self._migrate_legacy_project_database(
            username,
            project,
            db_path,
            project_dir=project_dir,
        )
        return db_path

    @staticmethod
    def _legacy_project_database(
        username: str,
        project: str,
        project_dir: str | Path | None,
    ) -> Path:
        if project_dir is not None:
            resolved_project_dir = Path(project_dir)
        else:
            configured_output = os.environ.get("AI_ANIME_OUTPUT_DIR", "").strip()
            output_root = (
                Path(configured_output).expanduser()
                if configured_output
                else Path(__file__).resolve().parents[5] / "output"
            )
            resolved_project_dir = output_root / username / project
        return resolved_project_dir / ".chat" / "chat.db"

    def _migrate_legacy_project_database(
        self,
        username: str,
        project: str,
        db_path: Path,
        *,
        project_dir: str | Path | None,
    ) -> None:
        legacy_db_path = self._legacy_project_database(
            username,
            project,
            project_dir,
        )
        if db_path.exists() or not legacy_db_path.exists():
            return

        db_path.parent.mkdir(parents=True, exist_ok=True)
        for suffix in ("", "-wal", "-shm"):
            source = Path(f"{legacy_db_path}{suffix}")
            if not source.exists():
                continue
            target = Path(f"{db_path}{suffix}")
            if not target.exists():
                shutil.move(str(source), str(target))

        legacy_dir = legacy_db_path.parent
        try:
            if legacy_dir.exists() and not any(legacy_dir.iterdir()):
                legacy_dir.rmdir()
        except OSError:
            pass

    @staticmethod
    def _connect_database(db_path: Path) -> sqlite3.Connection:
        db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        configure_sqlite_connection(conn)
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS chat_messages (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              role TEXT NOT NULL,
              content TEXT NOT NULL,
              media_json TEXT NOT NULL DEFAULT '[]',
              turn_id TEXT,
              metadata_json TEXT NOT NULL DEFAULT '{}',
              created_at TEXT NOT NULL
            )
            """
        )
        columns = {
            str(row["name"])
            for row in conn.execute("PRAGMA table_info(chat_messages)").fetchall()
        }
        if "turn_id" not in columns:
            conn.execute("ALTER TABLE chat_messages ADD COLUMN turn_id TEXT")
        if "metadata_json" not in columns:
            conn.execute(
                "ALTER TABLE chat_messages "
                "ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}'"
            )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS chat_ui_events (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              turn_id TEXT NOT NULL,
              event_type TEXT NOT NULL,
              payload_json TEXT NOT NULL,
              created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_chat_ui_events_turn_id
              ON chat_ui_events(turn_id, id)
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS chat_settings (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )
            """
        )
        conn.commit()
        return conn

    @staticmethod
    def _insert_message(
        conn: sqlite3.Connection,
        role: str,
        content: str,
        media: list[dict[str, Any]] | None = None,
        *,
        turn_id: str | None = None,
        metadata: dict[str, Any] | None = None,
        created_at: str | None = None,
    ) -> dict[str, Any]:
        media = media or []
        metadata = metadata or {}
        created_at = created_at or datetime.now(timezone.utc).isoformat()
        cursor = conn.execute(
            """
            INSERT INTO chat_messages(role, content, media_json, turn_id, metadata_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                role,
                content,
                json.dumps(media, ensure_ascii=False),
                turn_id,
                json.dumps(metadata, ensure_ascii=False),
                created_at,
            ),
        )
        return {
            "id": int(cursor.lastrowid),
            "role": role,
            "content": content,
            "media": media,
            **({"turn_id": turn_id} if turn_id else {}),
            **({"metadata": metadata} if metadata else {}),
            "created_at": created_at,
        }

    def append_message(
        self,
        username: str,
        scope: ChatScope,
        role: str,
        content: str,
        media: list[dict[str, Any]] | None = None,
        *,
        turn_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        conn = self.connect(username, scope)
        try:
            message = self._insert_message(
                conn,
                role,
                content,
                media,
                turn_id=turn_id,
                metadata=metadata,
            )
            conn.commit()
            return {**message, "attachments": message["media"]}
        finally:
            conn.close()

    def append_project_message(
        self,
        username: str,
        project: str,
        role: str,
        content: str,
        media: list[dict[str, Any]] | None = None,
        *,
        project_dir: str | Path | None = None,
        project_state_dir: str | Path | None = None,
    ) -> dict[str, Any]:
        conn = self._connect_database(
            self.project_db_for(
                username,
                project,
                project_dir=project_dir,
                project_state_dir=project_state_dir,
            )
        )
        try:
            message = self._insert_message(conn, role, content, media)
            conn.commit()
            return message
        finally:
            conn.close()

    def append_project_trace_messages(
        self,
        username: str,
        project: str,
        contents: list[str],
        *,
        project_dir: str | Path | None = None,
        project_state_dir: str | Path | None = None,
    ) -> list[dict[str, Any]]:
        conn = self._connect_database(
            self.project_db_for(
                username,
                project,
                project_dir=project_dir,
                project_state_dir=project_state_dir,
            )
        )
        try:
            messages = [
                self._insert_message(conn, "trace", normalized)
                for content in contents
                if (normalized := str(content or "").strip())
            ]
            conn.commit()
            return messages
        finally:
            conn.close()

    def append_ui_event(
        self,
        username: str,
        scope: ChatScope,
        turn_id: str,
        event: dict[str, Any],
    ) -> dict[str, Any]:
        turn_id = str(turn_id or "").strip()
        if not turn_id:
            raise ValueError("turn_id is required")
        event_type = str(
            event.get("type") or event.get("event_type") or "ui_event"
        ).strip()
        created_at = datetime.now(timezone.utc).isoformat()
        conn = self.connect(username, scope)
        try:
            cursor = conn.execute(
                """
                INSERT INTO chat_ui_events(turn_id, event_type, payload_json, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (
                    turn_id,
                    event_type,
                    json.dumps(event, ensure_ascii=False),
                    created_at,
                ),
            )
            conn.commit()
            return {
                "id": int(cursor.lastrowid),
                "turn_id": turn_id,
                "type": event_type,
                "payload": event,
                "created_at": created_at,
            }
        finally:
            conn.close()

    def _load_ui_events(
        self,
        conn: sqlite3.Connection,
    ) -> dict[str, list[dict[str, Any]]]:
        rows = conn.execute(
            """
            SELECT id, turn_id, event_type, payload_json, created_at
              FROM chat_ui_events
             ORDER BY id ASC
            """
        ).fetchall()
        events_by_turn: dict[str, list[dict[str, Any]]] = {}
        for row in rows:
            turn_id = str(row["turn_id"] or "").strip()
            if not turn_id:
                continue
            try:
                payload = json.loads(row["payload_json"] or "{}")
            except json.JSONDecodeError:
                payload = {}
            if not isinstance(payload, dict):
                payload = {"value": payload}
            payload = {
                "id": int(row["id"]),
                "type": str(row["event_type"] or payload.get("type") or "ui_event"),
                "turn_id": turn_id,
                "created_at": str(row["created_at"]),
                **payload,
            }
            events_by_turn.setdefault(turn_id, []).append(payload)
        return events_by_turn

    @staticmethod
    def _attach_ui_events_to_messages(
        messages: list[dict[str, Any]],
        events_by_turn: dict[str, list[dict[str, Any]]],
    ) -> None:
        if not messages or not events_by_turn:
            return
        for turn_id, events in events_by_turn.items():
            if not events:
                continue
            target_index: int | None = None
            for index, message in enumerate(messages):
                if (
                    message.get("role") == "assistant"
                    and message.get("turn_id") == turn_id
                ):
                    target_index = index
                    break
            if target_index is None:
                user_index = next(
                    (
                        index
                        for index, message in enumerate(messages)
                        if message.get("role") == "user"
                        and message.get("turn_id") == turn_id
                    ),
                    None,
                )
                if user_index is not None:
                    for index in range(user_index + 1, len(messages)):
                        if messages[index].get("role") == "assistant":
                            target_index = index
                            break
            if target_index is None:
                continue
            existing = messages[target_index].get("ui_events")
            if not isinstance(existing, list):
                existing = []
            messages[target_index]["ui_events"] = [*existing, *events]

    def list_messages(
        self,
        username: str,
        scope: ChatScope,
        *,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        conn = self.connect(username, scope)
        try:
            rows = conn.execute(
                """
                SELECT id, role, content, media_json, turn_id, metadata_json, created_at
                  FROM chat_messages
                 WHERE role <> 'trace'
                 ORDER BY id DESC
                 LIMIT ?
                """,
                (limit,),
            ).fetchall()
            events_by_turn = self._load_ui_events(conn)
        finally:
            conn.close()
        messages: list[dict[str, Any]] = []
        previous_assistants: list[str] = []
        for row in reversed(rows):
            try:
                media = json.loads(row["media_json"] or "[]")
            except json.JSONDecodeError:
                media = []
            role = str(row["role"])
            content = str(row["content"])
            if role == "assistant":
                raw_content = content
                content = strip_stored_assistant_replay(
                    content,
                    previous_assistants,
                )
                previous_assistants.append(raw_content)
            try:
                metadata = json.loads(row["metadata_json"] or "{}")
            except json.JSONDecodeError:
                metadata = {}
            if not isinstance(metadata, dict):
                metadata = {}
            messages.append(
                {
                    "id": int(row["id"]),
                    "role": role,
                    "content": content,
                    "media": media if isinstance(media, list) else [],
                    "attachments": media if isinstance(media, list) else [],
                    **({"turn_id": str(row["turn_id"])} if row["turn_id"] else {}),
                    **metadata,
                    "created_at": str(row["created_at"]),
                }
            )
        self._attach_ui_events_to_messages(messages, events_by_turn)
        return messages

    def list_project_messages(
        self,
        username: str,
        project: str,
        *,
        project_dir: str | Path | None = None,
        project_state_dir: str | Path | None = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        conn = self._connect_database(
            self.project_db_for(
                username,
                project,
                project_dir=project_dir,
                project_state_dir=project_state_dir,
            )
        )
        try:
            rows = conn.execute(
                """
                SELECT id, role, content, media_json, created_at
                  FROM (
                        SELECT id, role, content, media_json, created_at
                          FROM chat_messages
                         WHERE role <> 'trace'
                         ORDER BY id DESC
                         LIMIT ?
                       )
                 ORDER BY id ASC
                """,
                (max(1, int(limit)),),
            ).fetchall()
        finally:
            conn.close()
        return [
            {
                "id": int(row["id"]),
                "role": str(row["role"]),
                "content": str(row["content"]),
                "media": json.loads(row["media_json"] or "[]"),
                "created_at": str(row["created_at"]),
            }
            for row in rows
        ]

    def list_project_trace_contents(
        self,
        username: str,
        project: str,
        *,
        project_dir: str | Path | None = None,
        project_state_dir: str | Path | None = None,
    ) -> list[str]:
        conn = self._connect_database(
            self.project_db_for(
                username,
                project,
                project_dir=project_dir,
                project_state_dir=project_state_dir,
            )
        )
        try:
            rows = conn.execute(
                """
                SELECT content
                  FROM chat_messages
                 WHERE role = 'trace'
                 ORDER BY id ASC
                """
            ).fetchall()
        finally:
            conn.close()
        return [str(row["content"] or "") for row in rows]

    def replace_project_trace_messages(
        self,
        username: str,
        project: str,
        messages: list[dict[str, Any]],
        *,
        project_dir: str | Path | None = None,
        project_state_dir: str | Path | None = None,
    ) -> None:
        conn = self._connect_database(
            self.project_db_for(
                username,
                project,
                project_dir=project_dir,
                project_state_dir=project_state_dir,
            )
        )
        try:
            conn.execute("DELETE FROM chat_messages WHERE role = 'trace'")
            for message in messages:
                self._insert_message(
                    conn,
                    str(message.get("role") or "assistant"),
                    str(message.get("content") or ""),
                    message.get("media") or [],
                    created_at=str(
                        message.get("created_at")
                        or datetime.now(timezone.utc).isoformat()
                    ),
                )
            conn.commit()
        finally:
            conn.close()
