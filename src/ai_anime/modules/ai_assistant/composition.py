"""Runtime composition for AI Assistant."""

from ai_anime.modules.ai_assistant.application import ChatHistory, ChatRunLocks
from ai_anime.modules.ai_assistant.infrastructure import (
    FileChatRunLocks,
    SQLiteChatHistory,
)

_chat_history = SQLiteChatHistory()
_chat_run_locks = FileChatRunLocks()


def get_chat_history() -> ChatHistory:
    return _chat_history


def get_chat_run_locks() -> ChatRunLocks:
    return _chat_run_locks
