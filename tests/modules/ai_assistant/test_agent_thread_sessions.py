import json
from datetime import datetime, timezone

import pytest

from ai_anime.modules.ai_assistant.infrastructure import FileAgentThreadSessions
from ai_anime.modules.ai_assistant.public import get_agent_thread_sessions


def test_agent_thread_session_composition_returns_one_process_instance():
    assert get_agent_thread_sessions() is get_agent_thread_sessions()


def test_active_thread_is_user_scoped_and_backend_specific(monkeypatch, tmp_path):
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(tmp_path / "state"))
    sessions = FileAgentThreadSessions()

    sessions.set_active("admin", "claude", "claude-session-1")
    assert sessions.get_active("admin", "claude") == "claude-session-1"
    assert sessions.get_active("admin", "codex") is None

    sessions.set_active("admin", "codex", "codex-thread-1")
    assert sessions.get_active("admin", "claude") is None
    assert sessions.get_active("admin", "codex") == "codex-thread-1"


def test_agent_thread_sessions_are_isolated_by_user(monkeypatch, tmp_path):
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(tmp_path / "state"))
    sessions = FileAgentThreadSessions()

    sessions.set_active("alice", "claude", "alice-thread")

    assert sessions.get_active("alice", "claude") == "alice-thread"
    assert sessions.get_active("bob", "claude") is None


def test_agent_thread_session_writes_existing_file_contract(monkeypatch, tmp_path):
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(tmp_path / "state"))
    sessions = FileAgentThreadSessions()

    sessions.set_active("admin", "claude", "  thread-1  ")

    state_file = tmp_path / "state" / "admin" / "agent_sessions.json"
    payload = json.loads(state_file.read_text(encoding="utf-8"))
    assert payload["backend"] == "claude"
    assert payload["thread_id"] == "thread-1"
    updated_at = datetime.fromisoformat(payload["updated_at"])
    assert updated_at.tzinfo == timezone.utc


def test_blank_thread_id_does_not_replace_active_session(monkeypatch, tmp_path):
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(tmp_path / "state"))
    sessions = FileAgentThreadSessions()
    sessions.set_active("admin", "claude", "thread-1")

    sessions.set_active("admin", "codex", "  ")

    assert sessions.get_active("admin", "claude") == "thread-1"
    assert sessions.get_active("admin", "codex") is None


@pytest.mark.parametrize("content", ["not-json", "[]", '{"backend": "claude"}'])
def test_invalid_or_incomplete_session_state_has_no_active_thread(
    monkeypatch,
    tmp_path,
    content,
):
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(tmp_path / "state"))
    sessions = FileAgentThreadSessions()
    state_file = sessions._state_path("admin")
    state_file.parent.mkdir(parents=True)
    state_file.write_text(content, encoding="utf-8")

    assert sessions.get_active("admin", "claude") is None
