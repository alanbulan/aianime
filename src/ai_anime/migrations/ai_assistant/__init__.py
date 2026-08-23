"""AI-assistant persistence migrations."""

from .runner import MIGRATION_VERSION, run_chat_history_migrations

__all__ = ["MIGRATION_VERSION", "run_chat_history_migrations"]
