from types import SimpleNamespace

import pytest

from ai_anime.modules.ai_assistant.application.hermes_session_commands import (
    HermesSessionCommands,
    UnsupportedSessionCommand,
)
from ai_anime.modules.ai_assistant.domain import ChatScope


class RecordingThread:
    def __init__(self) -> None:
        self.calls = []

    async def stream(self, prompt, *, current_project=None):
        self.calls.append((prompt, current_project))
        yield SimpleNamespace(type="thread_started", text=None)
        yield SimpleNamespace(
            type="context_usage",
            text=None,
            raw={"used": 18149, "size": 131072},
        )
        yield SimpleNamespace(type="assistant_delta", text="模型上下文：8 条消息")
        yield SimpleNamespace(type="complete", text="")


class RecordingRuntime:
    def __init__(self, thread) -> None:
        self.thread = thread
        self.calls = []

    async def get_for_user(self, username, **kwargs):
        self.calls.append((username, kwargs))
        return self.thread


@pytest.mark.anyio
async def test_session_command_executes_in_scope_without_chat_persistence() -> None:
    thread = RecordingThread()
    runtime = RecordingRuntime(thread)
    commands = HermesSessionCommands(runtime)
    scope = ChatScope(
        kind="project",
        id="project-a",
        conversation_id="conversation-2",
    )

    result = await commands.execute("alice", scope, "/context")

    assert result.text == "模型上下文：8 条消息"
    assert result.usage is not None
    assert result.usage.used == 18149
    assert result.usage.size == 131072
    assert runtime.calls == [
        (
            "alice",
            {
                "scope_kind": "project",
                "project_id": "project-a",
                "conversation_id": "conversation-2",
            },
        )
    ]
    assert thread.calls == [("/context", "project-a")]


@pytest.mark.anyio
async def test_session_command_rejects_non_ui_prompts() -> None:
    commands = HermesSessionCommands(RecordingRuntime(RecordingThread()))

    with pytest.raises(UnsupportedSessionCommand):
        await commands.execute("alice", ChatScope(kind="home"), "help")
