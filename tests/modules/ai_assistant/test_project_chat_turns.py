import pytest

from ai_anime.modules.ai_assistant.application import ProjectChatTurns
from ai_anime.modules.ai_assistant.public import ChatScope, get_project_chat_turns


class StubProjectReplies:
    def __init__(self, events, *, error=None):
        self.events = events
        self.error = error
        self.calls = []

    async def stream(
        self,
        username,
        project,
        prompt,
        on_event,
        *,
        project_dir=None,
        project_state_dir=None,
    ):
        self.calls.append((username, project, prompt, project_dir, project_state_dir))
        for event in self.events:
            await on_event(event)
        if self.error is not None:
            raise self.error
        return {"role": "assistant", "content": "result"}


class StubProjectMessages:
    def __init__(self):
        self.appended = []

    def append_user(
        self,
        username,
        project,
        content,
        *,
        project_dir=None,
        project_state_dir=None,
    ):
        self.appended.append(
            (username, project, content, project_dir, project_state_dir)
        )
        return {"role": "user", "content": content}


def _build_turns(events, *, error=None):
    replies = StubProjectReplies(events, error=error)
    messages = StubProjectMessages()
    return ProjectChatTurns(replies, messages), replies, messages


def test_project_chat_turns_composition_returns_one_process_instance():
    assert get_project_chat_turns() is get_project_chat_turns()


@pytest.mark.anyio
async def test_project_chat_turns_persists_user_and_projects_reply_events(tmp_path):
    message = {"role": "assistant", "content": "最终回复"}
    turns, replies, messages = _build_turns(
        [
            {
                "type": "thread_started",
                "thread_id": "thread-1",
                "turn_id": None,
            },
            {"type": "assistant_delta", "text": "最终回复"},
            {"type": "tool_update", "name": "Search", "text": "working"},
            {"type": "assistant_message", "message": message},
            {"type": "done", "message": message},
        ]
    )
    scope = ChatScope(kind="project", id="project-a")
    attachments = [{"fileName": "script.txt", "type": "text", "mimeType": "text/plain"}]
    emitted = []

    async def on_event(event):
        emitted.append(event)

    result = await turns.stream(
        "alice",
        scope,
        "继续处理",
        attachments,
        "turn-1",
        on_event,
        project_dir=tmp_path / "output",
        project_state_dir=tmp_path / "state",
    )

    assert result == {"role": "assistant", "content": "result"}
    assert messages.appended == [
        (
            "alice",
            "project-a",
            "继续处理",
            tmp_path / "output",
            tmp_path / "state",
        )
    ]
    assert replies.calls[0][0:2] == ("alice", "project-a")
    assert replies.calls[0][2].startswith("继续处理\n\n[CHAT_ATTACHMENTS]")
    assert "fileName=script.txt" in replies.calls[0][2]
    assert [event["type"] for event in emitted] == [
        "thread.started",
        "assistant.delta",
        "tool.result",
        "assistant.message",
        "chat.done",
    ]
    assert emitted[0] == {
        "type": "thread.started",
        "scope": {"kind": "project", "id": "project-a"},
        "thread_id": "thread-1",
        "turn_id": "turn-1",
    }
    assert emitted[2]["name"] == "Search"
    assert emitted[2]["result"] == {"text": "working"}


@pytest.mark.anyio
async def test_project_chat_turns_emits_final_delta_when_done_content_changed():
    turns, _replies, _messages = _build_turns(
        [{"type": "done", "message": {"content": "最终回复"}}]
    )
    emitted = []

    async def on_event(event):
        emitted.append(event)

    await turns.stream(
        "alice",
        ChatScope(kind="project", id="project-a"),
        "问题",
        [],
        "turn-2",
        on_event,
    )

    assert emitted == [
        {
            "type": "assistant.delta",
            "text": "最终回复",
            "turn_id": "turn-2",
            "accumulated": True,
        },
        {
            "type": "chat.done",
            "turn_id": "turn-2",
            "scope": {"kind": "project", "id": "project-a"},
        },
    ]


@pytest.mark.anyio
async def test_project_chat_turns_emits_done_when_reply_fails():
    turns, _replies, messages = _build_turns(
        [{"type": "assistant_delta", "text": "部分回复"}],
        error=RuntimeError("reply failed"),
    )
    emitted = []

    async def on_event(event):
        emitted.append(event)

    with pytest.raises(RuntimeError, match="reply failed"):
        await turns.stream(
            "alice",
            ChatScope(kind="project", id="project-a"),
            "问题",
            [],
            "turn-3",
            on_event,
        )

    assert len(messages.appended) == 1
    assert [event["type"] for event in emitted] == [
        "assistant.delta",
        "chat.done",
    ]


@pytest.mark.anyio
async def test_project_chat_turns_retries_failed_done_delivery():
    turns, _replies, _messages = _build_turns(
        [{"type": "done", "message": {"content": "完成"}}]
    )
    attempts = []
    done_attempts = 0

    async def on_event(event):
        nonlocal done_attempts
        attempts.append(event)
        if event["type"] == "chat.done":
            done_attempts += 1
            if done_attempts == 1:
                raise RuntimeError("socket send failed")

    await turns.stream(
        "alice",
        ChatScope(kind="project", id="project-a"),
        "问题",
        [],
        "turn-4",
        on_event,
    )

    assert done_attempts == 2
    assert len([event for event in attempts if event["type"] == "chat.done"]) == 2
