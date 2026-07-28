"""Local active Agent thread persistence."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from ai_anime.modules.ai_assistant.infrastructure.local_state import local_state_root


class FileAgentThreadSessions:
    @staticmethod
    def _state_path(username: str) -> Path:
        return local_state_root() / username / "agent_sessions.json"

    def _load(self, username: str) -> dict[str, str]:
        path = self._state_path(username)
        if not path.exists():
            return {}
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}
        if not isinstance(payload, dict):
            return {}
        return {
            str(key): str(value).strip()
            for key, value in payload.items()
            if str(value or "").strip()
        }

    def _save(self, username: str, payload: dict[str, str]) -> None:
        path = self._state_path(username)
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = path.with_suffix(".tmp")
        tmp_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        tmp_path.replace(path)

    def get_active(self, username: str, backend: str) -> str | None:
        payload = self._load(username)
        active_backend = str(payload.get("backend", "") or "").strip()
        if active_backend != backend:
            return None
        return str(payload.get("thread_id", "") or "").strip() or None

    def set_active(self, username: str, backend: str, thread_id: str) -> None:
        normalized = str(thread_id or "").strip()
        if not normalized:
            return
        self._save(
            username,
            {
                "backend": backend,
                "thread_id": normalized,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
        )
