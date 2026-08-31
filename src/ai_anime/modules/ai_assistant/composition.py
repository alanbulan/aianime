"""Runtime composition for AI Assistant."""

from ai_anime.modules.ai_assistant.application import (
    AgentPromptContext,
    ChatDecisions,
    ChatPresentation,
    ChatWorkerLifecycle,
    ConversationTitles,
    DisplayFallbacks,
    DeterministicProjectReplies,
    HermesHomeReplies,
    HermesProjectReplies,
    HermesRuntimePrewarmer,
    HermesSessionCommands,
    HermesSessionModels,
    PageAgentSessions,
    ProjectAssistantReplies,
    ProjectChatTurns,
    ProjectChatMessages,
    ProjectMedia,
    ScopedChatMessages,
    SpeechTranscription,
)
from ai_anime.modules.ai_assistant.infrastructure import (
    FileChatRunLocks,
    FileJsonRenderErrors,
    FileUserPreferences,
    HttpDisplayFallbackGateway,
    LocalHermesRuntime,
    LocalProjectMediaFiles,
    LocalSpeechTranscriber,
    ModelChatTitleGenerator,
    SQLiteChatHistory,
)

_agent_prompt_context = AgentPromptContext(FileUserPreferences())
_chat_decisions = ChatDecisions()
_chat_history = SQLiteChatHistory()
_conversation_titles = ConversationTitles(
    _chat_history,
    ModelChatTitleGenerator(),
)
_chat_presentation = ChatPresentation(FileJsonRenderErrors())
_chat_run_locks = FileChatRunLocks()
_hermes_runtime = LocalHermesRuntime()
_chat_worker_lifecycle = ChatWorkerLifecycle(_hermes_runtime, _chat_run_locks)
_hermes_runtime_prewarmer = HermesRuntimePrewarmer(_hermes_runtime)
_hermes_session_commands = HermesSessionCommands(_hermes_runtime)
_hermes_session_models = HermesSessionModels(_chat_history)
_display_fallbacks = DisplayFallbacks(HttpDisplayFallbackGateway())
_page_agent_sessions = PageAgentSessions()
_project_media = ProjectMedia(LocalProjectMediaFiles())
_project_chat_messages = ProjectChatMessages(_chat_history, _project_media)
_scoped_chat_messages = ScopedChatMessages(_chat_history, _project_chat_messages)
_speech_transcription = SpeechTranscription(LocalSpeechTranscriber())
_deterministic_project_replies = DeterministicProjectReplies(_project_chat_messages)
_hermes_home_replies = HermesHomeReplies(
    _hermes_runtime,
    _chat_history,
    _hermes_session_models,
)
_hermes_project_replies = HermesProjectReplies(
    _hermes_runtime,
    _agent_prompt_context,
    _project_chat_messages,
    _project_media,
    _chat_presentation,
    _page_agent_sessions,
    _display_fallbacks,
    _hermes_session_models,
)
_project_assistant_replies = ProjectAssistantReplies(
    _chat_run_locks,
    _deterministic_project_replies,
    _hermes_project_replies,
)
_project_chat_turns = ProjectChatTurns(
    _project_assistant_replies,
    _project_chat_messages,
)


def get_hermes_runtime_prewarmer() -> HermesRuntimePrewarmer:
    return _hermes_runtime_prewarmer


def get_hermes_session_models() -> HermesSessionModels:
    return _hermes_session_models


def get_hermes_session_commands() -> HermesSessionCommands:
    return _hermes_session_commands


def get_agent_prompt_context() -> AgentPromptContext:
    return _agent_prompt_context


def get_chat_presentation() -> ChatPresentation:
    return _chat_presentation


def get_chat_worker_lifecycle() -> ChatWorkerLifecycle:
    return _chat_worker_lifecycle


def get_chat_decisions() -> ChatDecisions:
    return _chat_decisions


def get_conversation_titles() -> ConversationTitles:
    return _conversation_titles


def get_hermes_home_replies() -> HermesHomeReplies:
    return _hermes_home_replies


def get_display_fallbacks() -> DisplayFallbacks:
    return _display_fallbacks


def get_page_agent_sessions() -> PageAgentSessions:
    return _page_agent_sessions


def get_project_media() -> ProjectMedia:
    return _project_media


def get_project_chat_turns() -> ProjectChatTurns:
    return _project_chat_turns


def get_scoped_chat_messages() -> ScopedChatMessages:
    return _scoped_chat_messages


def get_speech_transcription() -> SpeechTranscription:
    return _speech_transcription
