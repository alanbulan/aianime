"""Runtime composition for AI Assistant."""

from ai_anime.modules.ai_assistant.application import (
    AgentBackend,
    AgentBackendService,
    AgentWorkspace,
    AgentPromptContext,
    AgentThreadSessions,
    AgentToolConfiguration,
    ChatHistory,
    ChatPresentation,
    ChatRunLocks,
    DisplayFallbacks,
    PageAgentSessions,
    ProjectMedia,
)
from ai_anime.modules.ai_assistant.infrastructure import (
    FileAgentThreadSessions,
    FileChatRunLocks,
    FileJsonRenderErrors,
    FileUserPreferences,
    HttpDisplayFallbackGateway,
    LocalAgentBackendRuntime,
    LocalAgentToolConfiguration,
    LocalAgentWorkspace,
    LocalProjectMediaFiles,
    SQLiteChatHistory,
)

_agent_backend = AgentBackendService(LocalAgentBackendRuntime())
_agent_tool_configuration = LocalAgentToolConfiguration()
_agent_workspace = LocalAgentWorkspace()
_agent_prompt_context = AgentPromptContext(FileUserPreferences())
_agent_thread_sessions = FileAgentThreadSessions()
_chat_history = SQLiteChatHistory()
_chat_presentation = ChatPresentation(FileJsonRenderErrors())
_chat_run_locks = FileChatRunLocks()
_display_fallbacks = DisplayFallbacks(HttpDisplayFallbackGateway())
_page_agent_sessions = PageAgentSessions()
_project_media = ProjectMedia(LocalProjectMediaFiles())


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


def get_chat_presentation() -> ChatPresentation:
    return _chat_presentation


def get_chat_run_locks() -> ChatRunLocks:
    return _chat_run_locks


def get_display_fallbacks() -> DisplayFallbacks:
    return _display_fallbacks


def get_page_agent_sessions() -> PageAgentSessions:
    return _page_agent_sessions


def get_project_media() -> ProjectMedia:
    return _project_media
