import sqlite3
from pathlib import Path
from unittest.mock import ANY

import pytest

from ai_anime.modules.ai_assistant.infrastructure import SQLiteChatHistory
from ai_anime.modules.ai_assistant.public import ChatScope


def test_chat_database_defaults_to_repository_state(monkeypatch):
    monkeypatch.delenv("AI_ANIME_STATE_DIR", raising=False)
    repository_root = Path(__file__).resolve().parents[3]

    assert (
        SQLiteChatHistory().db_for(
            "alice",
            ChatScope(kind="home"),
        )
        == repository_root / "state" / "alice" / "_home" / "chat.db"
    )


@pytest.mark.parametrize(
    ("scope", "relative_path"),
    [
        (ChatScope(kind="home"), "alice/_home/chat.db"),
        (ChatScope(kind="project", id="show-1"), "alice/show-1/chat.db"),
        (ChatScope(kind="asset", id="hero"), "alice/_asset/hero/chat.db"),
        (ChatScope(kind="task", id="render-1"), "alice/_task/render-1/chat.db"),
    ],
)
def test_chat_database_paths_follow_scope_layout(
    monkeypatch,
    tmp_path,
    scope,
    relative_path,
):
    state_root = tmp_path / "state"
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(state_root))

    assert SQLiteChatHistory().db_for("alice", scope) == state_root / relative_path


def test_project_chat_storage_uses_resolved_project_state_dir(monkeypatch, tmp_path):
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(tmp_path / "state"))
    monkeypatch.setenv("AI_ANIME_OUTPUT_DIR", str(tmp_path / "output"))
    project_dir = tmp_path / "output" / "admin" / "demo"
    project_state_dir = tmp_path / "managed-state" / "projects" / "show-1"
    project_dir.mkdir(parents=True)
    project_state_dir.mkdir(parents=True)

    message = SQLiteChatHistory().append_project_message(
        "admin",
        "show-1",
        "user",
        "hello",
        project_dir=project_dir,
        project_state_dir=project_state_dir,
    )

    assert set(message) == {"id", "role", "content", "media", "created_at"}
    assert (project_state_dir / "chat.db").exists()
    assert not (tmp_path / "state" / "admin" / "show-1").exists()
    assert not (tmp_path / "output" / "admin" / "show-1").exists()


def test_project_chat_storage_creates_missing_resolved_state_dir(
    monkeypatch,
    tmp_path,
):
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(tmp_path / "state"))
    project_state_dir = tmp_path / "managed-state" / "missing-project"

    SQLiteChatHistory().append_project_message(
        "admin",
        "show-1",
        "user",
        "hello",
        project_state_dir=project_state_dir,
    )

    assert (project_state_dir / "chat.db").exists()
    assert not (tmp_path / "state" / "admin" / "show-1").exists()


def test_project_database_path_uses_current_state_layout(
    monkeypatch,
    tmp_path,
):
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(tmp_path / "state"))
    project_dir = tmp_path / "output" / "admin" / "show-1"

    database = SQLiteChatHistory().project_db_for(
        "admin",
        "show-1",
        project_dir=project_dir,
    )

    assert database == tmp_path / "state" / "admin" / "show-1" / "chat.db"
    assert not database.exists()


def test_legacy_chat_database_is_upgraded_without_losing_history(
    monkeypatch,
    tmp_path,
):
    state_root = tmp_path / "state"
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(state_root))
    database = state_root / "alice" / "_home" / "chat.db"
    database.parent.mkdir(parents=True)
    conn = sqlite3.connect(database)
    conn.executescript(
        """
        CREATE TABLE chat_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          media_json TEXT NOT NULL DEFAULT '[]',
          turn_id TEXT,
          metadata_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL
        );
        CREATE TABLE chat_ui_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          turn_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE TABLE chat_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        INSERT INTO chat_messages(
          role, content, media_json, turn_id, metadata_json, created_at
        ) VALUES (
          'user', '保留的旧消息', '[]', 'turn-1', '{}',
          '2026-08-25T01:00:00+00:00'
        );
        INSERT INTO chat_ui_events(
          turn_id, event_type, payload_json, created_at
        ) VALUES (
          'turn-1', 'tool.call', '{"name":"legacy_tool"}',
          '2026-08-25T01:00:01+00:00'
        );
        """
    )
    conn.close()

    history = SQLiteChatHistory()
    scope = ChatScope(kind="home")

    messages = history.list_messages("alice", scope)

    assert [message["content"] for message in messages] == ["保留的旧消息"]
    assert messages[0]["ui_events"][0]["name"] == "legacy_tool"
    assert history.list_conversations("alice", scope) == [
        {
            "id": "main",
            "title": "保留的旧消息",
            "updatedAt": "2026-08-25T01:00:01+00:00",
            "messageCount": 1,
        }
    ]
    conn = sqlite3.connect(database)
    assert "conversation_id" in {
        row[1] for row in conn.execute("PRAGMA table_info(chat_messages)")
    }
    assert "conversation_id" in {
        row[1] for row in conn.execute("PRAGMA table_info(chat_ui_events)")
    }
    assert conn.execute(
        "SELECT version FROM schema_migrations"
    ).fetchone() == ("1_initial_chat_history",)
    conn.close()


def test_project_conversations_share_one_database_and_keep_history_isolated(
    monkeypatch,
    tmp_path,
):
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(tmp_path / "state"))
    history = SQLiteChatHistory()

    history.append_project_message(
        "alice",
        "show-1",
        "user",
        "主会话",
        conversation_id="main",
    )
    history.append_project_message(
        "alice",
        "show-1",
        "user",
        "分支会话",
        conversation_id="chat_2",
    )

    database = history.project_db_for("alice", "show-1")
    assert database.exists()
    assert list(database.parent.glob("*.db")) == [database]
    assert [
        message["content"]
        for message in history.list_project_messages(
            "alice", "show-1", conversation_id="main"
        )
    ] == ["主会话"]
    assert [
        message["content"]
        for message in history.list_project_messages(
            "alice", "show-1", conversation_id="chat_2"
        )
    ] == ["分支会话"]


def test_conversation_title_is_stored_once_and_used_by_listing(monkeypatch, tmp_path):
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(tmp_path / "state"))
    history = SQLiteChatHistory()
    scope = ChatScope(
        kind="project",
        id="show-1",
        conversation_id="chat_2",
    )
    history.append_message("alice", scope, "user", "原始首条消息")

    assert history.get_conversation_title("alice", scope) == ""
    assert history.set_conversation_title("alice", scope, "模型生成标题") is True
    assert history.set_conversation_title("alice", scope, "不应覆盖") is False
    assert history.get_conversation_title("alice", scope) == "模型生成标题"
    assert history.list_conversations(
        "alice",
        ChatScope(kind="project", id="show-1"),
    ) == [
        {
            "id": "chat_2",
            "title": "模型生成标题",
            "updatedAt": ANY,
            "messageCount": 1,
        }
    ]


def test_delete_conversation_removes_only_the_selected_conversation(
    monkeypatch,
    tmp_path,
):
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(tmp_path / "state"))
    history = SQLiteChatHistory()
    project_id = "01JAAAAAAAAAAAAAAAAAAAAAAA"
    project_state_dir = tmp_path / "state" / "alice" / "我的项目"
    base = ChatScope(kind="project", id=project_id)
    branch = ChatScope(
        kind="project",
        id=project_id,
        conversation_id="chat_2",
    )
    history.append_project_message(
        "alice",
        project_id,
        "user",
        "保留",
        project_state_dir=project_state_dir,
    )
    branch_message = history.append_project_message(
        "alice",
        project_id,
        "assistant",
        "删除",
        turn_id="turn-2",
        project_state_dir=project_state_dir,
        conversation_id="chat_2",
    )
    history.append_ui_event(
        "alice",
        branch,
        "turn-2",
        {"type": "task.completed", "message_id": branch_message["id"]},
        project_state_dir=project_state_dir,
    )
    history.save_model_route(
        "alice",
        branch,
        "cloud:text-model",
        "high",
        project_state_dir=project_state_dir,
    )

    assert history.load_model_route(
        "alice",
        branch,
        project_state_dir=project_state_dir,
    ) == ("cloud:text-model", "high")

    assert history.delete_conversation(
        "alice",
        branch,
        project_state_dir=project_state_dir,
    ) is True
    assert history.load_model_route(
        "alice",
        branch,
        project_state_dir=project_state_dir,
    ) is None
    assert history.list_project_messages(
        "alice",
        project_id,
        project_state_dir=project_state_dir,
        conversation_id="chat_2",
    ) == []
    assert [
        item["id"]
        for item in history.list_conversations(
            "alice",
            base,
            project_state_dir=project_state_dir,
        )
    ] == ["main"]
    assert history.list_project_messages(
        "alice",
        project_id,
        project_state_dir=project_state_dir,
    )[0]["content"] == "保留"
    assert project_state_dir.joinpath("chat.db").is_file()
    assert not (tmp_path / "state" / "alice" / project_id / "chat.db").exists()


def test_visible_history_hides_trace_and_strips_assistant_replay(
    monkeypatch,
    tmp_path,
):
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(tmp_path / "state"))
    history = SQLiteChatHistory()
    scope = ChatScope(kind="home")

    history.append_message("admin", scope, "user", "你好")
    history.append_message(
        "admin",
        scope,
        "trace",
        "-> ai_anime_pipeline_status\ncompleted",
    )
    history.append_message("admin", scope, "assistant", "第一段")
    history.append_message("admin", scope, "assistant", "第一段第二段")

    messages = history.list_messages("admin", scope)

    assert [message["role"] for message in messages] == [
        "user",
        "assistant",
        "assistant",
    ]
    assert [message["content"] for message in messages] == ["你好", "第一段", "第二段"]


def test_project_history_hides_trace_messages(monkeypatch, tmp_path):
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(tmp_path / "state"))
    history = SQLiteChatHistory()

    history.append_project_message("admin", "show-1", "user", "你好")
    history.append_project_message(
        "admin",
        "show-1",
        "trace",
        "-> ai_anime_pipeline_status\ncompleted",
    )
    history.append_project_message("admin", "show-1", "assistant", "你好！")

    messages = history.list_project_messages("admin", "show-1")

    assert [message["role"] for message in messages] == ["user", "assistant"]
    assert all(
        "ai_anime_pipeline_status" not in message["content"] for message in messages
    )


def test_project_trace_messages_support_batch_append_and_full_replace(
    monkeypatch,
    tmp_path,
):
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(tmp_path / "state"))
    history = SQLiteChatHistory()
    history.append_project_message("admin", "show-1", "user", "keep")

    appended = history.append_project_trace_messages(
        "admin",
        "show-1",
        [" first ", "", "second"],
    )
    assert [message["content"] for message in appended] == ["first", "second"]
    assert history.list_project_trace_contents("admin", "show-1") == [
        "first",
        "second",
    ]

    history.replace_project_trace_messages(
        "admin",
        "show-1",
        [
            {
                "role": "trace",
                "content": "replacement",
                "media": [],
                "created_at": "2026-07-28T00:00:00+00:00",
            }
        ],
    )

    assert history.list_project_trace_contents("admin", "show-1") == ["replacement"]
    assert [
        message["content"]
        for message in history.list_project_messages("admin", "show-1")
    ] == ["keep"]


def test_ui_events_are_attached_to_the_matching_assistant_turn(
    monkeypatch,
    tmp_path,
):
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(tmp_path / "state"))
    history = SQLiteChatHistory()
    scope = ChatScope(kind="project", id="show-1")
    history.append_message("alice", scope, "user", "start", turn_id="turn-1")
    history.append_message("alice", scope, "assistant", "done", turn_id="turn-1")

    event = history.append_ui_event(
        "alice",
        scope,
        "turn-1",
        {"type": "task.completed", "task_id": "task-1"},
    )
    messages = history.list_messages("alice", scope)

    assistant = messages[-1]
    assert assistant["ui_events"] == [
        {
            "id": event["id"],
            "type": "task.completed",
            "turn_id": "turn-1",
            "created_at": event["created_at"],
            "task_id": "task-1",
        }
    ]


def test_inflight_ui_events_do_not_attach_to_unscoped_task_notification(
    monkeypatch,
    tmp_path,
):
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(tmp_path / "state"))
    history = SQLiteChatHistory()
    scope = ChatScope(kind="project", id="show-1")
    history.append_message("alice", scope, "user", "继续", turn_id="turn-1")
    history.append_message("alice", scope, "assistant", "角色肖像已完成")
    event = history.append_ui_event(
        "alice",
        scope,
        "turn-1",
        {
            "type": "tool.call",
            "tool_call_id": "call-1",
            "name": "ai_anime_wait_task",
        },
    )

    messages = history.list_messages("alice", scope)

    assert messages[0]["role"] == "user"
    assert messages[0]["ui_events"] == [
        {
            "id": event["id"],
            "type": "tool.call",
            "turn_id": "turn-1",
            "created_at": event["created_at"],
            "tool_call_id": "call-1",
            "name": "ai_anime_wait_task",
        }
    ]
    assert "ui_events" not in messages[1]


def test_project_ui_events_use_project_state_database_and_survive_refresh(tmp_path):
    history = SQLiteChatHistory()
    project_state_dir = tmp_path / "project-state"
    scope = ChatScope(kind="project", id="show-1")
    history.append_project_message(
        "alice",
        "show-1",
        "user",
        "自动生成整集",
        turn_id="turn-1",
        project_state_dir=project_state_dir,
    )
    event = history.append_ui_event(
        "alice",
        scope,
        "turn-1",
        {
            "type": "tool.call",
            "tool_call_id": "call-1",
            "name": "ai_anime_pipeline_status",
        },
        project_state_dir=project_state_dir,
    )

    messages = history.list_project_messages(
        "alice",
        "show-1",
        project_state_dir=project_state_dir,
    )

    assert project_state_dir.joinpath("chat.db").is_file()
    assert messages[0]["ui_events"] == [
        {
            "id": event["id"],
            "type": "tool.call",
            "turn_id": "turn-1",
            "created_at": event["created_at"],
            "tool_call_id": "call-1",
            "name": "ai_anime_pipeline_status",
        }
    ]


def test_history_defaults_to_last_50_messages(monkeypatch, tmp_path):
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(tmp_path / "state"))
    history = SQLiteChatHistory()
    scope = ChatScope(kind="home")
    for index in range(55):
        history.append_message("alice", scope, "user", f"message-{index:02d}")

    messages = history.list_messages("alice", scope)

    assert len(messages) == 50
    assert messages[0]["content"] == "message-05"
    assert messages[-1]["content"] == "message-54"


def test_project_history_defaults_to_last_50_messages(monkeypatch, tmp_path):
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(tmp_path / "state"))
    history = SQLiteChatHistory()
    for index in range(60):
        history.append_project_message(
            "admin",
            "show-1",
            "assistant",
            f"message-{index:02d}",
        )

    messages = history.list_project_messages("admin", "show-1")

    assert len(messages) == 50
    assert messages[0]["content"] == "message-10"
    assert messages[-1]["content"] == "message-59"
    assert [
        message["content"]
        for message in history.list_project_messages("admin", "show-1", limit=0)
    ] == ["message-59"]


def test_message_context_policy_persists_without_deleting_history(
    monkeypatch,
    tmp_path,
):
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(tmp_path / "state"))
    history = SQLiteChatHistory()
    scope = ChatScope(kind="home")
    first = history.append_message(
        "alice",
        scope,
        "user",
        "必须完整保留",
        turn_id="turn-pinned",
    )
    history.append_message("alice", scope, "assistant", "中间回复")
    latest = history.append_message("alice", scope, "user", "最新消息")

    pinned = history.set_message_context_state(
        "alice",
        scope,
        str(first["id"]),
        "pinned",
    )

    assert pinned is not None
    assert pinned["context_state"] == "pinned"
    assert [
        message["id"] for message in history.list_messages("alice", scope, limit=1)
    ] == [first["id"], latest["id"]]

    excluded = history.set_message_context_state(
        "alice",
        scope,
        "user-turn-pinned",
        "excluded",
    )

    assert excluded is not None
    assert excluded["context_state"] == "excluded"
    assert excluded["context_rebuild_required"] is True
    policy = history.load_context_policy("alice", scope)
    assert policy["revision"] == excluded["context_revision"]
    assert policy["rebuild_required"] is True
    assert "必须完整保留" not in {
        message["content"] for message in policy["messages"]
    }

    database = history.db_for("alice", scope)
    with sqlite3.connect(database) as conn:
        stored = conn.execute(
            "SELECT content, context_state FROM chat_messages WHERE id = ?",
            (first["id"],),
        ).fetchone()
    assert stored == ("必须完整保留", "excluded")

    assert history.mark_context_rebuilt(
        "alice",
        scope,
        excluded["context_revision"] + 1,
    ) is False
    assert history.mark_context_rebuilt(
        "alice",
        scope,
        excluded["context_revision"],
    ) is True
    assert history.load_context_policy("alice", scope)["rebuild_required"] is False
