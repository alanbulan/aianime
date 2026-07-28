"""Runtime composition for AI Assistant."""

from ai_anime.modules.ai_assistant.application import ChatHistory
from ai_anime.modules.ai_assistant.infrastructure import SQLiteChatHistory

_chat_history = SQLiteChatHistory()


def get_chat_history() -> ChatHistory:
    return _chat_history
