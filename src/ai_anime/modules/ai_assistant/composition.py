"""Runtime composition for AI Assistant."""

from ai_anime.modules.ai_assistant.application import (
    AgentBackend,
    AgentBackendService,
    AgentWorkspace,
    AgentPromptContext,
    AgentThreadSessions,
    AgentToolConfiguration,
    ChatHistory,
    ChatRunLocks,
    PageAgentSessions,
)
from ai_anime.modules.ai_assistant.infrastructure import (
    FileAgentThreadSessions,
    FileChatRunLocks,
    FileUserPreferences,
    LocalAgentBackendRuntime,
    LocalAgentToolConfiguration,
    LocalAgentWorkspace,
    SQLiteChatHistory,
)

_agent_backend = AgentBackendService(LocalAgentBackendRuntime())
_agent_tool_configuration = LocalAgentToolConfiguration()
_agent_workspace = LocalAgentWorkspace()
_agent_prompt_context = AgentPromptContext(FileUserPreferences())
_agent_thread_sessions = FileAgentThreadSessions()
_chat_history = SQLiteChatHistory()
_chat_run_locks = FileChatRunLocks()
_page_agent_sessions = PageAgentSessions()


def get_agent_backend() -> AgentBackend:
    return _agent_backend


def get_agent_tool_configuration() -> AgentToolConfiguration:
    return _agent_tool_configuration


def get_agent_workspace() -> AgentWorkspace:
    return _agent_workspace


def get_agent_prompt_context() -> AgentPromptContext:
    return _agent_prompt_context


def get_agent_thread_sessions() -> AgentThreadSessions:
    return _agent_thread_sessions


def get_chat_history() -> ChatHistory:
    return _chat_history


def get_chat_run_locks() -> ChatRunLocks:
    return _chat_run_locks


def get_page_agent_sessions() -> PageAgentSessions:
    return _page_agent_sessions
