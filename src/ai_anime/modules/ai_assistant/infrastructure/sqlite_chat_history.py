"""SQLite-backed scoped chat history."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ai_anime.migrations.ai_assistant import (
    MIGRATION_VERSION,
    run_chat_history_migrations,
)
from ai_anime.migrations.sqlite import ensure_sqlite_schema
from ai_anime.modules.ai_assistant.domain import (
    ChatScope,
    strip_stored_assistant_replay,
)
from ai_anime.modules.ai_assistant.infrastructure.local_state import local_state_root
from ai_anime.shared.infrastructure.sqlite_pragmas import configure_sqlite_connection

_MODEL_ROUTE_SETTING_PREFIX = "session-model-route:"


class SQLiteChatHistory:
    def db_for(self, username: str, scope: ChatScope) -> Path:
        if scope.kind == "home":
            return local_state_root() / username / "_home" / "chat.db"
        if scope.kind == "project":
            return local_state_root() / username / str(scope.id) / "chat.db"
        return (
            local_state_root()
            / username
            / f"_{scope.kind}"
            / str(scope.id)
            / "chat.db"
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
        conversation_id: str = "main",
    ) -> Path:
        return (
            Path(project_state_dir) / "chat.db"
            if project_state_dir is not None
            else local_state_root() / username / project / "chat.db"
        )

    def _db_path_for_scope(
        self,
        username: str,
        scope: ChatScope,
        *,
        project_dir: str | Path | None = None,
        project_state_dir: str | Path | None = None,
    ) -> Path:
        if scope.kind == "project":
            return self.project_db_for(
                username,
                str(scope.id or ""),
                project_dir=project_dir,
                project_state_dir=project_state_dir,
            )
        return self.db_for(username, ChatScope(kind=scope.kind, id=scope.id))

    @staticmethod
    def _connect_database(db_path: Path) -> sqlite3.Connection:
        db_path.parent.mkdir(parents=True, exist_ok=True)
        ensure_sqlite_schema(
            db_path,
            component="ai_assistant",
            version=MIGRATION_VERSION,
            initialize=run_chat_history_migrations,
        )
        conn = sqlite3.connect(db_path, timeout=10)
        conn.row_factory = sqlite3.Row
        configure_sqlite_connection(conn, set_journal_mode=False)
        return conn

    @staticmethod
    def _touch_conversation(
        conn: sqlite3.Connection,
        conversation_id: str,
        *,
        updated_at: str | None = None,
    ) -> None:
        normalized = str(conversation_id or "main").strip() or "main"
        timestamp = updated_at or datetime.now(timezone.utc).isoformat()
        if updated_at is None:
            conn.execute(
                """
                INSERT OR IGNORE INTO chat_conversations(id, created_at, updated_at)
                VALUES (?, ?, ?)
                """,
                (normalized, timestamp, timestamp),
            )
            return
        conn.execute(
            """
            INSERT INTO chat_conversations(id, created_at, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at
            """,
            (normalized, timestamp, timestamp),
        )

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
        conversation_id: str = "main",
    ) -> dict[str, Any]:
        media = media or []
        metadata = metadata or {}
        created_at = created_at or datetime.now(timezone.utc).isoformat()
        cursor = conn.execute(
            """
            INSERT INTO chat_messages(
              role, content, media_json, turn_id, metadata_json,
              conversation_id, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                role,
                content,
                json.dumps(media, ensure_ascii=False),
                turn_id,
                json.dumps(metadata, ensure_ascii=False),
                conversation_id,
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
                conversation_id=scope.conversation_id,
            )
            self._touch_conversation(
                conn,
                scope.conversation_id,
                updated_at=str(message["created_at"]),
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
        turn_id: str | None = None,
        project_dir: str | Path | None = None,
        project_state_dir: str | Path | None = None,
        conversation_id: str = "main",
    ) -> dict[str, Any]:
        conn = self._connect_database(
            self.project_db_for(
                username,
                project,
                project_dir=project_dir,
                project_state_dir=project_state_dir,
                conversation_id=conversation_id,
            )
        )
        try:
            message = self._insert_message(
                conn,
                role,
                content,
                media,
                turn_id=turn_id,
                conversation_id=conversation_id,
            )
            self._touch_conversation(
                conn,
                conversation_id,
                updated_at=str(message["created_at"]),
            )
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
        conversation_id: str = "main",
    ) -> list[dict[str, Any]]:
        conn = self._connect_database(
            self.project_db_for(
                username,
                project,
                project_dir=project_dir,
                project_state_dir=project_state_dir,
                conversation_id=conversation_id,
            )
        )
        try:
            messages = [
                self._insert_message(
                    conn,
                    "trace",
                    normalized,
                    conversation_id=conversation_id,
                )
                for content in contents
                if (normalized := str(content or "").strip())
            ]
            if messages:
                self._touch_conversation(
                    conn,
                    conversation_id,
                    updated_at=str(messages[-1]["created_at"]),
                )
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
        *,
        project_dir: str | Path | None = None,
        project_state_dir: str | Path | None = None,
    ) -> dict[str, Any]:
        turn_id = str(turn_id or "").strip()
        if not turn_id:
            raise ValueError("turn_id is required")
        event_type = str(
            event.get("type") or event.get("event_type") or "ui_event"
        ).strip()
        created_at = datetime.now(timezone.utc).isoformat()
        conn = self._connect_database(
            self._db_path_for_scope(
                username,
                scope,
                project_dir=project_dir,
                project_state_dir=project_state_dir,
            )
        )
        try:
            cursor = conn.execute(
                """
                INSERT INTO chat_ui_events(
                  turn_id, event_type, payload_json, conversation_id, created_at
                )
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    turn_id,
                    event_type,
                    json.dumps(event, ensure_ascii=False),
                    scope.conversation_id,
                    created_at,
                ),
            )
            self._touch_conversation(
                conn,
                scope.conversation_id,
                updated_at=created_at,
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
        conversation_id: str = "main",
        turn_ids: set[str] | None = None,
    ) -> dict[str, list[dict[str, Any]]]:
        if turn_ids is not None and not turn_ids:
            return {}
        if turn_ids is None:
            rows = conn.execute(
                """
                SELECT id, turn_id, event_type, payload_json, created_at
                  FROM chat_ui_events
                 WHERE conversation_id = ?
                 ORDER BY id ASC
                """,
                (conversation_id,),
            ).fetchall()
        else:
            placeholders = ", ".join("?" for _ in turn_ids)
            rows = conn.execute(
                f"""
                SELECT id, turn_id, event_type, payload_json, created_at
                  FROM chat_ui_events
                 WHERE conversation_id = ?
                   AND turn_id IN ({placeholders})
                 ORDER BY id ASC
                """,
                (conversation_id, *sorted(turn_ids)),
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
            user_index: int | None = None
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
                    # An in-flight turn may be followed by unrelated task
                    # notifications that intentionally have no turn_id.  Keep
                    # its tool events on the matching user message until the
                    # real assistant reply for this turn is persisted.
                    target_index = user_index
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
                SELECT id, role, content, media_json, turn_id, metadata_json,
                       context_state, created_at
                  FROM chat_messages
                 WHERE role <> 'trace'
                   AND conversation_id = ?
                   AND (
                     context_state = 'pinned'
                     OR id IN (
                       SELECT id
                         FROM chat_messages
                        WHERE role <> 'trace' AND conversation_id = ?
                        ORDER BY id DESC
                        LIMIT ?
                     )
                   )
                 ORDER BY id ASC
                """,
                (scope.conversation_id, scope.conversation_id, limit),
            ).fetchall()
            turn_ids = {
                str(row["turn_id"])
                for row in rows
                if row["turn_id"]
            }
            events_by_turn = self._load_ui_events(
                conn,
                scope.conversation_id,
                turn_ids,
            )
        finally:
            conn.close()
        messages: list[dict[str, Any]] = []
        previous_assistants: list[str] = []
        for row in rows:
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
                    "context_state": str(row["context_state"] or "normal"),
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
        conversation_id: str = "main",
    ) -> list[dict[str, Any]]:
        conn = self._connect_database(
            self.project_db_for(
                username,
                project,
                project_dir=project_dir,
                project_state_dir=project_state_dir,
                conversation_id=conversation_id,
            )
        )
        try:
            rows = conn.execute(
                """
                SELECT id, role, content, media_json, turn_id,
                       context_state, created_at
                  FROM chat_messages
                 WHERE role <> 'trace'
                   AND conversation_id = ?
                   AND (
                     context_state = 'pinned'
                     OR id IN (
                       SELECT id
                         FROM chat_messages
                        WHERE role <> 'trace' AND conversation_id = ?
                        ORDER BY id DESC
                        LIMIT ?
                     )
                   )
                 ORDER BY id ASC
                """,
                (
                    conversation_id,
                    conversation_id,
                    max(1, int(limit)),
                ),
            ).fetchall()
            turn_ids = {
                str(row["turn_id"])
                for row in rows
                if row["turn_id"]
            }
            events_by_turn = self._load_ui_events(
                conn,
                conversation_id,
                turn_ids,
            )
        finally:
            conn.close()
        messages = [
            {
                "id": int(row["id"]),
                "role": str(row["role"]),
                "content": str(row["content"]),
                "media": json.loads(row["media_json"] or "[]"),
                "context_state": str(row["context_state"] or "normal"),
                **({"turn_id": str(row["turn_id"])} if row["turn_id"] else {}),
                "created_at": str(row["created_at"]),
            }
            for row in rows
        ]
        self._attach_ui_events_to_messages(messages, events_by_turn)
        return messages

    def set_message_context_state(
        self,
        username: str,
        scope: ChatScope,
        message_id: str,
        state: str,
        *,
        project_dir: str | Path | None = None,
        project_state_dir: str | Path | None = None,
    ) -> dict[str, Any] | None:
        normalized_state = str(state or "").strip().lower()
        if normalized_state not in {"normal", "pinned", "excluded"}:
            raise ValueError("invalid message context state")
        normalized_id = str(message_id or "").strip()
        if not normalized_id:
            raise ValueError("message id is required")

        conn = self._connect_database(
            self._db_path_for_scope(
                username,
                scope,
                project_dir=project_dir,
                project_state_dir=project_state_dir,
            )
        )
        try:
            conn.execute("BEGIN IMMEDIATE")
            if normalized_id.isdigit():
                row = conn.execute(
                    """
                    SELECT id, context_state
                      FROM chat_messages
                     WHERE id = ? AND conversation_id = ?
                    """,
                    (int(normalized_id), scope.conversation_id),
                ).fetchone()
            else:
                role = None
                turn_id = ""
                for prefix, candidate_role in (
                    ("user-", "user"),
                    ("assistant-", "assistant"),
                ):
                    if normalized_id.startswith(prefix):
                        role = candidate_role
                        turn_id = normalized_id[len(prefix) :].strip()
                        break
                row = (
                    conn.execute(
                        """
                        SELECT id, context_state
                          FROM chat_messages
                         WHERE conversation_id = ?
                           AND role = ?
                           AND turn_id = ?
                         ORDER BY id DESC
                         LIMIT 1
                        """,
                        (scope.conversation_id, role, turn_id),
                    ).fetchone()
                    if role and turn_id
                    else None
                )
            if row is None:
                conn.rollback()
                return None

            previous_state = str(row["context_state"] or "normal")
            message_db_id = int(row["id"])
            self._touch_conversation(conn, scope.conversation_id)
            if previous_state != normalized_state:
                conn.execute(
                    "UPDATE chat_messages SET context_state = ? WHERE id = ?",
                    (normalized_state, message_db_id),
                )
                rebuild_required = (
                    previous_state == "excluded"
                    or normalized_state == "excluded"
                )
                conn.execute(
                    """
                    UPDATE chat_conversations
                       SET context_revision = context_revision + 1,
                           context_rebuild_required = CASE
                             WHEN ? THEN 1
                             ELSE context_rebuild_required
                           END
                     WHERE id = ?
                    """,
                    (1 if rebuild_required else 0, scope.conversation_id),
                )
            context_row = conn.execute(
                """
                SELECT context_revision, context_rebuild_required
                  FROM chat_conversations
                 WHERE id = ?
                """,
                (scope.conversation_id,),
            ).fetchone()
            conn.commit()
            return {
                "id": message_db_id,
                "context_state": normalized_state,
                "context_revision": int(context_row["context_revision"] or 0),
                "context_rebuild_required": bool(
                    context_row["context_rebuild_required"]
                ),
            }
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def load_context_policy(
        self,
        username: str,
        scope: ChatScope,
        *,
        project_dir: str | Path | None = None,
        project_state_dir: str | Path | None = None,
    ) -> dict[str, Any]:
        conn = self._connect_database(
            self._db_path_for_scope(
                username,
                scope,
                project_dir=project_dir,
                project_state_dir=project_state_dir,
            )
        )
        try:
            context_row = conn.execute(
                """
                SELECT context_revision, context_rebuild_required
                  FROM chat_conversations
                 WHERE id = ?
                """,
                (scope.conversation_id,),
            ).fetchone()
            rows = conn.execute(
                """
                SELECT id, role, content, turn_id, context_state, created_at
                  FROM chat_messages
                 WHERE conversation_id = ?
                   AND role IN ('user', 'assistant')
                   AND context_state <> 'excluded'
                 ORDER BY id ASC
                """,
                (scope.conversation_id,),
            ).fetchall()
        finally:
            conn.close()
        return {
            "revision": int(context_row["context_revision"] or 0)
            if context_row is not None
            else 0,
            "rebuild_required": bool(context_row["context_rebuild_required"])
            if context_row is not None
            else False,
            "messages": [
                {
                    "id": int(row["id"]),
                    "role": str(row["role"]),
                    "content": str(row["content"]),
                    "turn_id": str(row["turn_id"] or ""),
                    "context_state": str(row["context_state"] or "normal"),
                    "created_at": str(row["created_at"]),
                }
                for row in rows
            ],
        }

    def mark_context_rebuilt(
        self,
        username: str,
        scope: ChatScope,
        revision: int,
        *,
        project_dir: str | Path | None = None,
        project_state_dir: str | Path | None = None,
    ) -> bool:
        conn = self._connect_database(
            self._db_path_for_scope(
                username,
                scope,
                project_dir=project_dir,
                project_state_dir=project_state_dir,
            )
        )
        try:
            cursor = conn.execute(
                """
                UPDATE chat_conversations
                   SET context_rebuild_required = 0
                 WHERE id = ? AND context_revision = ?
                """,
                (scope.conversation_id, int(revision)),
            )
            conn.commit()
            return cursor.rowcount > 0
        finally:
            conn.close()

    def list_project_trace_contents(
        self,
        username: str,
        project: str,
        *,
        project_dir: str | Path | None = None,
        project_state_dir: str | Path | None = None,
        conversation_id: str = "main",
    ) -> list[str]:
        conn = self._connect_database(
            self.project_db_for(
                username,
                project,
                project_dir=project_dir,
                project_state_dir=project_state_dir,
                conversation_id=conversation_id,
            )
        )
        try:
            rows = conn.execute(
                """
                SELECT content
                  FROM chat_messages
                 WHERE role = 'trace' AND conversation_id = ?
                 ORDER BY id ASC
                """,
                (conversation_id,),
            ).fetchall()
        finally:
            conn.close()
        return [str(row["content"] or "") for row in rows]

    def list_conversations(
        self,
        username: str,
        scope: ChatScope,
        *,
        project_dir: str | Path | None = None,
        project_state_dir: str | Path | None = None,
    ) -> list[dict[str, Any]]:
        conn = self._connect_database(
            self._db_path_for_scope(
                username,
                scope,
                project_dir=project_dir,
                project_state_dir=project_state_dir,
            )
        )
        try:
            rows = conn.execute(
                """
                SELECT c.id, c.title, c.created_at, c.updated_at,
                       COUNT(m.id) AS message_count,
                       (
                         SELECT content
                           FROM chat_messages first_message
                          WHERE first_message.conversation_id = c.id
                            AND first_message.role = 'user'
                            AND TRIM(first_message.content) <> ''
                          ORDER BY first_message.id ASC
                          LIMIT 1
                       ) AS first_user_content
                  FROM chat_conversations c
                  LEFT JOIN chat_messages m
                    ON m.conversation_id = c.id AND m.role <> 'trace'
                 GROUP BY c.id, c.title, c.created_at, c.updated_at
                 ORDER BY c.updated_at DESC, c.id DESC
                """
            ).fetchall()
        finally:
            conn.close()
        conversations: list[dict[str, Any]] = []
        for row in rows:
            stored_title = str(row["title"] or "").strip()
            raw_title = str(row["first_user_content"] or "").strip()
            first_line = raw_title.splitlines()[0].strip() if raw_title else ""
            conversations.append(
                {
                    "id": str(row["id"]),
                    "title": stored_title or first_line[:48] or "新会话",
                    "updatedAt": str(row["updated_at"] or row["created_at"]),
                    "messageCount": int(row["message_count"] or 0),
                }
            )
        return conversations

    def get_conversation_title(
        self,
        username: str,
        scope: ChatScope,
        *,
        project_dir: str | Path | None = None,
        project_state_dir: str | Path | None = None,
    ) -> str:
        conn = self._connect_database(
            self._db_path_for_scope(
                username,
                scope,
                project_dir=project_dir,
                project_state_dir=project_state_dir,
            )
        )
        try:
            row = conn.execute(
                "SELECT title FROM chat_conversations WHERE id = ?",
                (scope.conversation_id,),
            ).fetchone()
            return str(row["title"] or "").strip() if row is not None else ""
        finally:
            conn.close()

    def set_conversation_title(
        self,
        username: str,
        scope: ChatScope,
        title: str,
        *,
        project_dir: str | Path | None = None,
        project_state_dir: str | Path | None = None,
    ) -> bool:
        normalized = str(title or "").strip()
        if not normalized:
            return False
        conn = self._connect_database(
            self._db_path_for_scope(
                username,
                scope,
                project_dir=project_dir,
                project_state_dir=project_state_dir,
            )
        )
        try:
            self._touch_conversation(conn, scope.conversation_id)
            cursor = conn.execute(
                """
                UPDATE chat_conversations
                   SET title = ?
                 WHERE id = ? AND TRIM(title) = ''
                """,
                (normalized, scope.conversation_id),
            )
            conn.commit()
            return cursor.rowcount > 0
        finally:
            conn.close()

    @staticmethod
    def _model_route_setting_key(conversation_id: str) -> str:
        normalized = str(conversation_id or "main").strip() or "main"
        return f"{_MODEL_ROUTE_SETTING_PREFIX}{normalized}"

    def load_model_route(
        self,
        username: str,
        scope: ChatScope,
        *,
        project_dir: str | Path | None = None,
        project_state_dir: str | Path | None = None,
    ) -> tuple[str | None, str | None] | None:
        conn = self._connect_database(
            self._db_path_for_scope(
                username,
                scope,
                project_dir=project_dir,
                project_state_dir=project_state_dir,
            )
        )
        try:
            row = conn.execute(
                "SELECT value FROM chat_settings WHERE key = ?",
                (self._model_route_setting_key(scope.conversation_id),),
            ).fetchone()
            if row is None:
                return None
            try:
                payload = json.loads(str(row["value"] or ""))
            except (TypeError, ValueError):
                return None
            if not isinstance(payload, dict):
                return None
            selector = payload.get("selector")
            reasoning_effort = payload.get("reasoning_effort")
            if selector is not None and not isinstance(selector, str):
                return None
            if reasoning_effort is not None and not isinstance(
                reasoning_effort,
                str,
            ):
                return None
            return (
                str(selector or "").strip() or None,
                str(reasoning_effort or "").strip() or None,
            )
        finally:
            conn.close()

    def save_model_route(
        self,
        username: str,
        scope: ChatScope,
        selector: str | None,
        reasoning_effort: str | None,
        *,
        project_dir: str | Path | None = None,
        project_state_dir: str | Path | None = None,
    ) -> None:
        value = json.dumps(
            {
                "selector": str(selector or "").strip() or None,
                "reasoning_effort": str(reasoning_effort or "").strip() or None,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        )
        conn = self._connect_database(
            self._db_path_for_scope(
                username,
                scope,
                project_dir=project_dir,
                project_state_dir=project_state_dir,
            )
        )
        try:
            conn.execute(
                """
                INSERT INTO chat_settings(key, value, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET
                  value = excluded.value,
                  updated_at = excluded.updated_at
                """,
                (
                    self._model_route_setting_key(scope.conversation_id),
                    value,
                    datetime.now(timezone.utc).isoformat(),
                ),
            )
            conn.commit()
        finally:
            conn.close()

    def clear_model_route(
        self,
        username: str,
        scope: ChatScope,
        *,
        project_dir: str | Path | None = None,
        project_state_dir: str | Path | None = None,
    ) -> None:
        conn = self._connect_database(
            self._db_path_for_scope(
                username,
                scope,
                project_dir=project_dir,
                project_state_dir=project_state_dir,
            )
        )
        try:
            conn.execute(
                "DELETE FROM chat_settings WHERE key = ?",
                (self._model_route_setting_key(scope.conversation_id),),
            )
            conn.commit()
        finally:
            conn.close()

    def delete_conversation(
        self,
        username: str,
        scope: ChatScope,
        *,
        project_dir: str | Path | None = None,
        project_state_dir: str | Path | None = None,
    ) -> bool:
        conn = self._connect_database(
            self._db_path_for_scope(
                username,
                scope,
                project_dir=project_dir,
                project_state_dir=project_state_dir,
            )
        )
        try:
            conn.execute("BEGIN IMMEDIATE")
            conn.execute(
                "DELETE FROM chat_settings WHERE key = ?",
                (self._model_route_setting_key(scope.conversation_id),),
            )
            conn.execute(
                "DELETE FROM chat_ui_events WHERE conversation_id = ?",
                (scope.conversation_id,),
            )
            conn.execute(
                "DELETE FROM chat_messages WHERE conversation_id = ?",
                (scope.conversation_id,),
            )
            cursor = conn.execute(
                "DELETE FROM chat_conversations WHERE id = ?",
                (scope.conversation_id,),
            )
            conn.commit()
            return cursor.rowcount > 0
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def replace_project_trace_messages(
        self,
        username: str,
        project: str,
        messages: list[dict[str, Any]],
        *,
        project_dir: str | Path | None = None,
        project_state_dir: str | Path | None = None,
        conversation_id: str = "main",
    ) -> None:
        conn = self._connect_database(
            self.project_db_for(
                username,
                project,
                project_dir=project_dir,
                project_state_dir=project_state_dir,
                conversation_id=conversation_id,
            )
        )
        try:
            self._touch_conversation(conn, conversation_id)
            conn.execute(
                "DELETE FROM chat_messages "
                "WHERE role = 'trace' AND conversation_id = ?",
                (conversation_id,),
            )
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
                    conversation_id=conversation_id,
                )
            conn.commit()
        finally:
            conn.close()
