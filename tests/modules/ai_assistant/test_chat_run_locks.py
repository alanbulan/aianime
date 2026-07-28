import json
import os
from datetime import datetime, timedelta, timezone

import pytest

from ai_anime.modules.ai_assistant.infrastructure import FileChatRunLocks
from ai_anime.modules.ai_assistant.infrastructure import chat_run_locks as lock_module
from ai_anime.modules.ai_assistant.public import get_chat_run_locks


def test_chat_run_lock_composition_returns_one_process_instance():
    assert get_chat_run_locks() is get_chat_run_locks()


def test_pid_liveness_probe_keeps_current_process_alive():
    assert lock_module._pid_is_alive(os.getpid()) is True


def test_chat_run_lock_is_user_scoped(monkeypatch, tmp_path):
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(tmp_path / "state"))
    locks = FileChatRunLocks()

    lock_id = locks.acquire("admin", "project-a")
    try:
        with pytest.raises(RuntimeError, match="当前用户已有 AI 对话"):
            locks.acquire("admin", "project-b")
    finally:
        locks.release("admin", "project-a", lock_id)

    next_lock_id = locks.acquire("admin", "project-b")
    locks.release("admin", "project-b", next_lock_id)


def test_chat_run_lock_uses_named_agent_locks_dir(monkeypatch, tmp_path):
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(tmp_path / "state"))

    lock_path = FileChatRunLocks()._lock_path("admin", "project-a")

    assert lock_path.parent == tmp_path / "state" / "admin" / "chat_agent_locks"
    assert lock_path.name.endswith(".lock")


def test_chat_run_lock_file_expires_after_ten_minutes(monkeypatch, tmp_path):
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(tmp_path / "state"))
    assert lock_module._CHAT_RUN_LOCK_TTL_SECONDS == 10 * 60
    locks = FileChatRunLocks()
    lock_path = locks._lock_path("admin", "project-a")
    stale_started_at = datetime.now(timezone.utc) - timedelta(seconds=10 * 60 + 1)
    lock_path.write_text(
        json.dumps(
            {
                "lock_id": "stale-lock",
                "owner_pid": os.getpid(),
                "started_at": stale_started_at.isoformat(),
            }
        ),
        encoding="utf-8",
    )

    lock_id = locks.acquire("admin", "project-a")
    try:
        assert lock_id != "stale-lock"
        assert lock_path.exists()
    finally:
        locks.release("admin", "project-a", lock_id)


def test_chat_run_lock_uses_updated_at_for_idle_timeout(monkeypatch, tmp_path):
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(tmp_path / "state"))
    locks = FileChatRunLocks()
    lock_path = locks._lock_path("admin", "project-a")
    old_started_at = datetime.now(timezone.utc) - timedelta(seconds=10 * 60 + 1)
    fresh_updated_at = datetime.now(timezone.utc)
    lock_path.write_text(
        json.dumps(
            {
                "lock_id": "active-long-run",
                "owner_pid": os.getpid(),
                "started_at": old_started_at.isoformat(),
                "updated_at": fresh_updated_at.isoformat(),
            }
        ),
        encoding="utf-8",
    )

    assert locks.is_active("admin", "project-a") is True
    with pytest.raises(RuntimeError, match="当前用户已有 AI 对话"):
        locks.acquire("admin", "project-a")


def test_chat_run_lock_still_has_max_runtime(monkeypatch, tmp_path):
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(tmp_path / "state"))
    locks = FileChatRunLocks()
    lock_path = locks._lock_path("admin", "project-a")
    too_old_started_at = datetime.now(timezone.utc) - timedelta(
        seconds=lock_module._CHAT_RUN_LOCK_MAX_SECONDS + 1
    )
    lock_path.write_text(
        json.dumps(
            {
                "lock_id": "too-old-lock",
                "owner_pid": os.getpid(),
                "started_at": too_old_started_at.isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        ),
        encoding="utf-8",
    )

    lock_id = locks.acquire("admin", "project-a")
    try:
        assert lock_id != "too-old-lock"
    finally:
        locks.release("admin", "project-a", lock_id)


def test_chat_run_lock_heartbeat_refreshes_updated_at(monkeypatch, tmp_path):
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(tmp_path / "state"))
    locks = FileChatRunLocks()
    atomic_writes = []
    original_atomic_write = locks._atomic_write_lock_file

    def spy_atomic_write(path, payload):
        atomic_writes.append((path, payload))
        original_atomic_write(path, payload)

    monkeypatch.setattr(locks, "_atomic_write_lock_file", spy_atomic_write)

    lock_id = locks.acquire("admin", "project-a")
    lock_path = locks._lock_path("admin", "project-a")
    try:
        _current_lock_id, _owner_pid, started_at, updated_at = locks._read_lock_file(
            lock_path
        )
        assert started_at is not None
        assert updated_at is not None
        old_updated_at = started_at - timedelta(seconds=30)
        lock_path.write_text(
            json.dumps(
                {
                    "lock_id": lock_id,
                    "owner_pid": os.getpid(),
                    "started_at": started_at.isoformat(),
                    "updated_at": old_updated_at.isoformat(),
                }
            ),
            encoding="utf-8",
        )

        assert locks._heartbeat("admin", "project-a", lock_id) is True
        assert len(atomic_writes) == 1
        assert atomic_writes[0][0] == lock_path
        assert json.loads(atomic_writes[0][1])["lock_id"] == lock_id
        refreshed_lock_id, _owner_pid, refreshed_started_at, refreshed_updated_at = (
            locks._read_lock_file(lock_path)
        )
        assert refreshed_lock_id == lock_id
        assert refreshed_started_at == started_at
        assert refreshed_updated_at is not None
        assert refreshed_updated_at > old_updated_at
    finally:
        locks.release("admin", "project-a", lock_id)


def test_chat_run_lock_treats_new_empty_lock_as_active(monkeypatch, tmp_path):
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(tmp_path / "state"))
    locks = FileChatRunLocks()
    lock_path = locks._lock_path("admin", "project-a")
    lock_path.write_text("", encoding="utf-8")

    with pytest.raises(RuntimeError, match="当前用户已有 AI 对话"):
        locks.acquire("admin", "project-a")

    assert lock_path.exists()


def test_chat_run_lock_removes_old_invalid_lock(monkeypatch, tmp_path):
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(tmp_path / "state"))
    locks = FileChatRunLocks()
    lock_path = locks._lock_path("admin", "project-a")
    lock_path.write_text("", encoding="utf-8")
    old_mtime = (
        datetime.now(timezone.utc).timestamp()
        - lock_module._CHAT_RUN_LOCK_BIRTH_GRACE_SECONDS
        - 1
    )
    os.utime(lock_path, (old_mtime, old_mtime))

    lock_id = locks.acquire("admin", "project-a")
    try:
        assert lock_path.exists()
        assert locks._read_lock_file(lock_path)[0] == lock_id
    finally:
        locks.release("admin", "project-a", lock_id)
