"""Local user preference storage."""

from pathlib import Path

from ai_anime.modules.ai_assistant.infrastructure.local_state import local_state_root

_DEFAULT_PREFERENCES = (
    "# User Preferences\n\n"
    "Record stable cross-project preferences here, such as visual taste, "
    "brand/style defaults, pacing habits, and recurring workflow choices.\n"
)


class FileUserPreferences:
    @staticmethod
    def _path(username: str) -> Path:
        return local_state_root() / username / "preferences.md"

    def load(self, username: str) -> str:
        path = self._path(username)
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            path.write_text(_DEFAULT_PREFERENCES, encoding="utf-8")
        return path.read_text(encoding="utf-8").strip()
