"""Runtime composition for AI Assistant."""

from ai_anime.modules.ai_assistant.application import (
    AgentBackend,
    AgentBackendPrewarmer,
    AgentBackendService,
    AgentPromptContext,
    AgentThreadReplies,
    AgentThreadRuntime,
    ChatHistory,
    ChatPresentation,
    ChatRunLocks,
    DisplayFallbacks,
    DeterministicProjectReplies,
    HermesHomeReplies,
    HermesProjectReplies,
    HermesRuntime,
    PageAgentSessions,
    ProjectAssistantReplies,
    ProjectChatTurns,
    ProjectChatMessages,
    ProjectMedia,
)
from ai_anime.modules.ai_assistant.infrastructure import (
    FileAgentThreadSessions,
    FileChatRunLocks,
    FileJsonRenderErrors,
    FileUserPreferences,
    HttpDisplayFallbackGateway,
    LocalAgentBackendRuntime,
    LocalAgentThreadRuntime,
    LocalAgentToolConfiguration,
    LocalAgentWorkspace,
    LocalHermesRuntime,
    LocalProjectMediaFiles,
    SQLiteChatHistory,
)

_agent_backend = AgentBackendService(LocalAgentBackendRuntime())
_agent_tool_configuration = LocalAgentToolConfiguration()
_agent_workspace = LocalAgentWorkspace()
_agent_prompt_context = AgentPromptContext(FileUserPreferences())
_agent_thread_sessions = FileAgentThreadSessions()
_agent_thread_runtime = LocalAgentThreadRuntime(
    _agent_backend,
    _agent_thread_sessions,
    _agent_workspace,
    _agent_tool_configuration,
)
_chat_history = SQLiteChatHistory()
_chat_presentation = ChatPresentation(FileJsonRenderErrors())
_chat_run_locks = FileChatRunLocks()
_hermes_runtime = LocalHermesRuntime()
_agent_backend_prewarmer = AgentBackendPrewarmer(_agent_backend, _hermes_runtime)
_display_fallbacks = DisplayFallbacks(HttpDisplayFallbackGateway())
_page_agent_sessions = PageAgentSessions()
_project_media = ProjectMedia(LocalProjectMediaFiles())
_project_chat_messages = ProjectChatMessages(_chat_history, _project_media)
_deterministic_project_replies = DeterministicProjectReplies(_project_chat_messages)
_hermes_home_replies = HermesHomeReplies(_hermes_runtime, _chat_history)
_agent_thread_replies = AgentThreadReplies(
    _agent_thread_runtime,
    _agent_prompt_context,
    _page_agent_sessions,
    _project_media,
    _project_chat_messages,
    _chat_presentation,
)
_hermes_project_replies = HermesProjectReplies(
    _hermes_runtime,
    _agent_prompt_context,
    _project_chat_messages,
    _project_media,
    _chat_presentation,
    _page_agent_sessions,
    _display_fallbacks,
)
_project_assistant_replies = ProjectAssistantReplies(
    _agent_backend,
    _agent_thread_replies,
    _chat_run_locks,
    _deterministic_project_replies,
    _hermes_project_replies,
)
_project_chat_turns = ProjectChatTurns(
    _project_assistant_replies,
    _project_chat_messages,
)


def get_agent_backend() -> AgentBackend:
    return _agent_backend


def get_agent_backend_prewarmer() -> AgentBackendPrewarmer:
    return _agent_backend_prewarmer


def get_agent_prompt_context() -> AgentPromptContext:
    return _agent_prompt_context


def get_agent_thread_runtime() -> AgentThreadRuntime:
    return _agent_thread_runtime


def get_chat_history() -> ChatHistory:
    return _chat_history


def get_chat_presentation() -> ChatPresentation:
    return _chat_presentation


def get_chat_run_locks() -> ChatRunLocks:
    return _chat_run_locks


def get_hermes_runtime() -> HermesRuntime:
    return _hermes_runtime


def get_hermes_home_replies() -> HermesHomeReplies:
    return _hermes_home_replies


def get_display_fallbacks() -> DisplayFallbacks:
    return _display_fallbacks


def get_page_agent_sessions() -> PageAgentSessions:
    return _page_agent_sessions


def get_project_media() -> ProjectMedia:
    return _project_media


def get_project_chat_messages() -> ProjectChatMessages:
    return _project_chat_messages


def get_project_assistant_replies() -> ProjectAssistantReplies:
    return _project_assistant_replies


def get_project_chat_turns() -> ProjectChatTurns:
    return _project_chat_turns
