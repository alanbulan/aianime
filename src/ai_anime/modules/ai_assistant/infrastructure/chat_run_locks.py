"""Process-safe local chat run locks."""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

from ai_anime.modules.ai_assistant.infrastructure.local_state import local_state_root

_CHAT_RUN_LOCK_KEY = "active_chat_run"
_CHAT_RUN_LOCK_TTL_SECONDS = 10 * 60
_CHAT_RUN_LOCK_MAX_SECONDS = 60 * 60
_CHAT_RUN_LOCK_HEARTBEAT_SECONDS = 30.0
_CHAT_RUN_LOCK_BIRTH_GRACE_SECONDS = 5.0


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_iso_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def _pid_is_alive(pid: int | None) -> bool:
    if pid is None or pid <= 0:
        return False
    if os.name == "nt":
        import ctypes
        from ctypes import wintypes

        process_query_limited_information = 0x1000
        still_active = 259
        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        open_process = kernel32.OpenProcess
        open_process.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
        open_process.restype = wintypes.HANDLE
        get_exit_code_process = kernel32.GetExitCodeProcess
        get_exit_code_process.argtypes = [
            wintypes.HANDLE,
            ctypes.POINTER(wintypes.DWORD),
        ]
        get_exit_code_process.restype = wintypes.BOOL
        close_handle = kernel32.CloseHandle
        close_handle.argtypes = [wintypes.HANDLE]
        close_handle.restype = wintypes.BOOL

        handle = open_process(process_query_limited_information, False, pid)
        if not handle:
            return ctypes.get_last_error() == 5
        try:
            exit_code = wintypes.DWORD()
            if not get_exit_code_process(handle, ctypes.byref(exit_code)):
                return True
            return exit_code.value == still_active
        finally:
            close_handle(handle)
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def _parse_chat_run_lock(
    value: str | None,
) -> tuple[str | None, int | None, datetime | None, datetime | None]:
    if not value:
        return None, None, None, None
    try:
        payload = json.loads(value)
    except json.JSONDecodeError:
        return value, None, None, None
    if not isinstance(payload, dict):
        return None, None, None, None
    lock_id = payload.get("lock_id")
    owner_pid = payload.get("owner_pid")
    started_at = payload.get("started_at")
    updated_at = payload.get("updated_at") or started_at
    return (
        str(lock_id).strip() or None if lock_id is not None else None,
        int(owner_pid) if isinstance(owner_pid, int) else None,
        _parse_iso_datetime(str(started_at)) if started_at is not None else None,
        _parse_iso_datetime(str(updated_at)) if updated_at is not None else None,
    )


def _chat_run_lock_is_stale(
    started_at: datetime | None,
    updated_at: datetime | None = None,
) -> bool:
    now = datetime.now(timezone.utc)
    if started_at is not None:
        if started_at.tzinfo is None:
            started_at = started_at.replace(tzinfo=timezone.utc)
        if (now - started_at).total_seconds() > _CHAT_RUN_LOCK_MAX_SECONDS:
            return True
    heartbeat_at = updated_at or started_at
    if heartbeat_at is None:
        return False
    if heartbeat_at.tzinfo is None:
        heartbeat_at = heartbeat_at.replace(tzinfo=timezone.utc)
    return (now - heartbeat_at).total_seconds() > _CHAT_RUN_LOCK_TTL_SECONDS


class FileChatRunLocks:
    @staticmethod
    def _lock_path(username: str, project: str) -> Path:
        lock_key = _CHAT_RUN_LOCK_KEY
        digest = hashlib.sha256(lock_key.encode("utf-8")).hexdigest()
        locks_dir = local_state_root() / username / "chat_agent_locks"
        locks_dir.mkdir(parents=True, exist_ok=True)
        return locks_dir / f"{digest}.lock"

    @staticmethod
    def _read_lock_file(
        path: Path,
    ) -> tuple[str | None, int | None, datetime | None, datetime | None]:
        try:
            value = path.read_text(encoding="utf-8")
        except FileNotFoundError:
            return None, None, None, None
        except OSError:
            return None, None, None, None
        return _parse_chat_run_lock(value)

    @staticmethod
    def _remove_lock_file(path: Path) -> None:
        try:
            path.unlink()
        except FileNotFoundError:
            pass

    @staticmethod
    def _atomic_write_lock_file(path: Path, payload: str) -> None:
        tmp_path = path.with_name(f".{path.name}.{os.getpid()}.{uuid.uuid4().hex}.tmp")
        try:
            tmp_path.write_text(payload, encoding="utf-8")
            tmp_path.replace(path)
        finally:
            tmp_path.unlink(missing_ok=True)

    @staticmethod
    def _lock_payload(lock_id: str, *, started_at: str | None = None) -> str:
        now = _now_iso()
        return json.dumps(
            {
                "lock_id": lock_id,
                "owner_pid": os.getpid(),
                "started_at": started_at or now,
                "updated_at": now,
            },
            ensure_ascii=False,
        )

    @staticmethod
    def _lock_file_is_new(path: Path) -> bool:
        try:
            mtime = path.stat().st_mtime
        except FileNotFoundError:
            return False
        except OSError:
            return True
        return (
            datetime.now(timezone.utc).timestamp() - mtime
        ) < _CHAT_RUN_LOCK_BIRTH_GRACE_SECONDS

    def acquire(self, username: str, project: str) -> str:
        lock_path = self._lock_path(username, project)
        lock_id = uuid.uuid4().hex
        lock_payload = self._lock_payload(lock_id)
        payload_bytes = lock_payload.encode("utf-8")
        for _attempt in range(3):
            try:
                fd = os.open(
                    str(lock_path),
                    os.O_CREAT | os.O_EXCL | os.O_WRONLY,
                    0o600,
                )
            except FileExistsError:
                existing_lock_id, owner_pid, started_at, updated_at = (
                    self._read_lock_file(lock_path)
                )
                if not existing_lock_id and self._lock_file_is_new(lock_path):
                    raise RuntimeError("当前用户已有 AI 对话正在处理中，请稍后再试。")
                if (
                    existing_lock_id
                    and _pid_is_alive(owner_pid)
                    and not _chat_run_lock_is_stale(started_at, updated_at)
                ):
                    raise RuntimeError("当前用户已有 AI 对话正在处理中，请稍后再试。")
                self._remove_lock_file(lock_path)
                continue
            try:
                with os.fdopen(fd, "wb") as file:
                    file.write(payload_bytes)
                return lock_id
            except Exception:
                try:
                    os.close(fd)
                except OSError:
                    pass
                self._remove_lock_file(lock_path)
                raise
        raise RuntimeError("当前用户已有 AI 对话正在处理中，请稍后再试。")

    def release(self, username: str, project: str, lock_id: str) -> None:
        lock_path = self._lock_path(username, project)
        current_lock_id, _owner_pid, _started_at, _updated_at = self._read_lock_file(
            lock_path
        )
        if current_lock_id == lock_id:
            self._remove_lock_file(lock_path)

    def _heartbeat(self, username: str, project: str, lock_id: str) -> bool:
        lock_path = self._lock_path(username, project)
        current_lock_id, _owner_pid, started_at, _updated_at = self._read_lock_file(
            lock_path
        )
        if current_lock_id != lock_id:
            return False
        payload = self._lock_payload(
            lock_id,
            started_at=started_at.isoformat() if started_at else None,
        )
        try:
            self._atomic_write_lock_file(lock_path, payload)
        except OSError:
            return False
        return True

    def is_active(self, username: str, project: str = "") -> bool:
        lock_path = self._lock_path(username, project)
        existing_lock_id, owner_pid, started_at, updated_at = self._read_lock_file(
            lock_path
        )
        if (
            existing_lock_id
            and _pid_is_alive(owner_pid)
            and not _chat_run_lock_is_stale(started_at, updated_at)
        ):
            return True
        self._remove_lock_file(lock_path)
        return False

    def force_release(self, username: str, project: str) -> None:
        self._remove_lock_file(self._lock_path(username, project))

    async def maintain(self, username: str, project: str, lock_id: str) -> None:
        while True:
            await asyncio.sleep(_CHAT_RUN_LOCK_HEARTBEAT_SECONDS)
            if not self._heartbeat(username, project, lock_id):
                return
