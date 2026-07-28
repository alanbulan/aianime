import sqlite3
from pathlib import Path

import pytest

from ai_anime.modules.ai_assistant.infrastructure import SQLiteChatHistory
from ai_anime.modules.ai_assistant.public import ChatScope, get_chat_history


def test_chat_history_composition_returns_one_process_instance():
    assert get_chat_history() is get_chat_history()


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


def test_project_database_path_migrates_legacy_database_and_sidecars(
    monkeypatch,
    tmp_path,
):
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(tmp_path / "state"))
    project_dir = tmp_path / "output" / "admin" / "show-1"
    legacy_database = project_dir / ".chat" / "chat.db"
    legacy_database.parent.mkdir(parents=True)
    expected_contents = {
        "": b"database",
        "-wal": b"write-ahead-log",
        "-shm": b"shared-memory",
    }
    for suffix, content in expected_contents.items():
        Path(f"{legacy_database}{suffix}").write_bytes(content)

    database = SQLiteChatHistory().project_db_for(
        "admin",
        "show-1",
        project_dir=project_dir,
    )

    for suffix, content in expected_contents.items():
        assert Path(f"{database}{suffix}").read_bytes() == content
        assert not Path(f"{legacy_database}{suffix}").exists()
    assert not legacy_database.parent.exists()


def test_existing_message_table_is_migrated_in_place(monkeypatch, tmp_path):
    state_root = tmp_path / "state"
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(state_root))
    database = state_root / "alice" / "_home" / "chat.db"
    database.parent.mkdir(parents=True)
    with sqlite3.connect(database) as connection:
        connection.execute(
            """
            CREATE TABLE chat_messages (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              role TEXT NOT NULL,
              content TEXT NOT NULL,
              media_json TEXT NOT NULL DEFAULT '[]',
              created_at TEXT NOT NULL
            )
            """
        )

    history = SQLiteChatHistory()
    history.append_message("alice", ChatScope(kind="home"), "user", "hello")

    with sqlite3.connect(database) as connection:
        columns = {
            row[1] for row in connection.execute("PRAGMA table_info(chat_messages)")
        }
        tables = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }
    assert {"turn_id", "metadata_json"} <= columns
    assert {"chat_messages", "chat_ui_events", "chat_settings"} <= tables


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
