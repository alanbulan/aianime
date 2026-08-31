from types import SimpleNamespace

import pytest

from ai_anime.modules.ai_assistant.application import HermesHomeReplies
from ai_anime.modules.ai_assistant.application import (
    hermes_home_replies as replies_module,
)
from ai_anime.modules.ai_assistant.public import ChatScope, get_hermes_home_replies


def _event(event_type, **values):
    return SimpleNamespace(
        type=event_type,
        thread_id=values.get("thread_id"),
        turn_id=values.get("turn_id"),
        text=values.get("text"),
        name=values.get("name"),
        success=values.get("success"),
        error=values.get("error"),
        raw=values.get("raw"),
    )


class StubThread:
    def __init__(self, events, *, error=None, thread_id="thread-1"):
        self.id = thread_id
        self.events = events
        self.error = error
        self.calls = []
        self.model_route_applied = False
        self.model_route_applied_before_stream = []

    async def stream(self, prompt, *, current_project=None):
        self.model_route_applied_before_stream.append(self.model_route_applied)
        self.calls.append((prompt, current_project))
        for event in self.events:
            yield event
        if self.error is not None:
            raise self.error


class StubHermesRuntime:
    def __init__(self, thread):
        self.thread = thread
        self.calls = []
        self.forgotten = []

    async def get_for_user(
        self, username, *, scope_kind, project_id, conversation_id
    ):
        self.calls.append((username, scope_kind, project_id, conversation_id))
        return self.thread

    async def forget_conversation(
        self, username, *, scope_kind, project_id, conversation_id
    ):
        self.forgotten.append(
            (username, scope_kind, project_id, conversation_id)
        )


class StubSessionModels:
    async def apply_to(self, thread, _username, _scope):
        thread.model_route_applied = True
        return (None, "none")


class StubHistory:
    def __init__(self, messages=None, context_policy=None):
        self.messages = list(messages or [])
        self.context_policy = context_policy
        self.appended = []
        self.rebuilt_revisions = []

    def list_messages(self, username, scope, *, limit=50):
        return list(self.messages)

    def load_context_policy(self, username, scope):
        if self.context_policy is not None:
            return self.context_policy
        return {
            "revision": 0,
            "rebuild_required": False,
            "messages": list(self.messages),
        }

    def mark_context_rebuilt(self, username, scope, revision):
        self.rebuilt_revisions.append(revision)
        return True

    def append_message(
        self,
        username,
        scope,
        role,
        content,
        media=None,
        *,
        turn_id=None,
        metadata=None,
    ):
        self.appended.append((username, scope, role, content, media, turn_id, metadata))
        message = {
            "id": len(self.appended),
            "role": role,
            "content": content,
        }
        if scope.kind == "home":
            self.messages.append(message)
        return message


def _build_replies(events, *, error=None, messages=None, context_policy=None):
    thread = StubThread(events, error=error)
    runtime = StubHermesRuntime(thread)
    history = StubHistory(messages, context_policy=context_policy)
    return (
        HermesHomeReplies(runtime, history, StubSessionModels()),
        thread,
        runtime,
        history,
    )


def _stub_project_snapshots(monkeypatch, *snapshots):
    calls = []

    async def list_projects(user):
        snapshot = snapshots[min(len(calls), len(snapshots) - 1)]
        calls.append(user)
        return [SimpleNamespace(name=name) for name in snapshot]

    monkeypatch.setattr(replies_module, "list_project_workspaces", list_projects)
    return calls


@pytest.mark.anyio
async def test_hermes_home_replies_streams_and_persists_turn(monkeypatch):
    project_calls = _stub_project_snapshots(monkeypatch, {"existing"}, {"existing"})
    replies, thread, runtime, history = _build_replies(
        [
            _event(
                "thread_started",
                thread_id="thread-2",
                turn_id="worker-turn",
            ),
            _event("assistant_delta", text="处理中"),
            _event("tool_update", name="CreateProject", text="working"),
            _event("complete", text="已完成"),
        ],
        messages=[{"role": "assistant", "content": "上一条回复"}],
    )
    scope = ChatScope(kind="home")
    attachments = [
        {
            "fileName": "script.txt",
            "type": "text",
            "mimeType": "text/plain",
            "content": "scene one",
        }
    ]
    emitted = []

    async def on_event(event):
        emitted.append(event)

    await replies.stream(
        "alice",
        scope,
        "继续处理",
        attachments,
        "turn-1",
        on_event,
    )

    assert get_hermes_home_replies() is get_hermes_home_replies()
    assert runtime.calls == [("alice", "home", None, "main")]
    assert thread.model_route_applied_before_stream == [True]
    assert thread.calls[0][1] is None
    assert thread.calls[0][0].startswith("继续处理\n\n[CHAT_ATTACHMENTS]")
    assert "fileName=script.txt" in thread.calls[0][0]
    assert history.appended[0] == (
        "alice",
        scope,
        "user",
        "继续处理",
        attachments,
        "turn-1",
        None,
    )
    assert history.appended[1][2:4] == ("assistant", "已完成")
    assert [event["type"] for event in emitted] == [
        "thread.started",
        "thread.started",
        "assistant.delta",
        "tool.result",
        "assistant.message",
        "chat.done",
    ]
    assert emitted[1]["thread_id"] == "thread-2"
    assert emitted[1]["turn_id"] == "worker-turn"
    assert emitted[3]["name"] == "CreateProject"
    assert emitted[3]["result"] == {"text": "working"}
    assert project_calls == [{"username": "alice"}, {"username": "alice"}]


@pytest.mark.anyio
async def test_hermes_home_replies_preserves_failed_tool_status(monkeypatch):
    _stub_project_snapshots(monkeypatch, set(), set())
    replies, _thread, _runtime, _history = _build_replies(
        [
            _event(
                "tool_update",
                name="Generate",
                text="failed",
                success=False,
                error="远端模型调用失败",
            ),
            _event("complete", text="生成失败"),
        ]
    )
    emitted = []

    async def on_event(event):
        emitted.append(event)

    await replies.stream(
        "alice",
        ChatScope(kind="home"),
        "生成",
        [],
        "turn-failed-tool",
        on_event,
    )

    tool_result = next(item for item in emitted if item["type"] == "tool.result")
    assert tool_result["success"] is False
    assert tool_result["error"] == "远端模型调用失败"


@pytest.mark.anyio
async def test_hermes_home_replies_maps_nested_tool_result_failure(monkeypatch):
    _stub_project_snapshots(monkeypatch, set(), set())
    replies, _thread, _runtime, history = _build_replies(
        [
            _event(
                "tool_update",
                name="ai_anime_create_style",
                text="completed",
                success=True,
                raw={
                    "status": "completed",
                    "content": [{"type": "text", "text": '{"ok":false,"error":"Style id is required"}'}],
                },
            ),
            _event("complete", text="风格已经创建成功。"),
        ]
    )
    emitted = []

    async def on_event(event):
        emitted.append(event)

    await replies.stream(
        "alice",
        ChatScope(kind="home"),
        "创建风格",
        [],
        "turn-nested-tool-failure",
        on_event,
    )

    tool_result = next(item for item in emitted if item["type"] == "tool.result")
    assert tool_result["success"] is False
    assert tool_result["error"] == "任务执行失败：Style id is required"
    assistant = next(
        item[3] for item in history.appended if item[2] == "assistant"
    )
    assert assistant == "任务执行失败：Style id is required"


@pytest.mark.anyio
async def test_hermes_home_replies_persists_partial_reply_on_error(monkeypatch):
    _stub_project_snapshots(monkeypatch, set())
    replies, _thread, _runtime, history = _build_replies(
        [_event("assistant_delta", text="部分回复")],
        error=RuntimeError("stream failed"),
    )
    emitted = []

    async def on_event(event):
        emitted.append(event)

    with pytest.raises(RuntimeError, match="stream failed"):
        await replies.stream(
            "alice",
            ChatScope(kind="home"),
            "问题",
            [],
            "turn-2",
            on_event,
        )

    assert [item[2:4] for item in history.appended] == [
        ("user", "问题"),
        ("assistant", "部分回复"),
    ]
    assert [event["type"] for event in emitted] == [
        "thread.started",
        "assistant.delta",
        "chat.done",
    ]


@pytest.mark.anyio
async def test_hermes_home_replies_announces_new_projects_in_stable_order(monkeypatch):
    _stub_project_snapshots(
        monkeypatch,
        {"existing"},
        {"existing", "project-z", "project-a"},
    )
    replies, _thread, _runtime, history = _build_replies(
        [_event("complete", text="项目已创建")]
    )
    emitted = []

    async def on_event(event):
        emitted.append(event)

    await replies.stream(
        "alice",
        ChatScope(kind="home"),
        "创建项目",
        [],
        "turn-3",
        on_event,
    )

    system_messages = [item for item in history.appended if item[2] == "system"]
    assert [(item[1].id, item[3]) for item in system_messages] == [
        ("project-a", "Created from home conversation turn turn-3."),
        ("project-z", "Created from home conversation turn turn-3."),
    ]
    assert [
        event["project"] for event in emitted if event["type"] == "project.created"
    ] == ["project-a", "project-z"]


@pytest.mark.anyio
async def test_hermes_home_replies_retries_failed_done_delivery(monkeypatch):
    _stub_project_snapshots(monkeypatch, set(), set())
    replies, _thread, _runtime, history = _build_replies(
        [_event("complete", text="完成")]
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

    await replies.stream(
        "alice",
        ChatScope(kind="home"),
        "问题",
        [],
        "turn-4",
        on_event,
    )

    assert done_attempts == 2
    assert len([event for event in attempts if event["type"] == "chat.done"]) == 2
    assert len([item for item in history.appended if item[2] == "assistant"]) == 1


@pytest.mark.anyio
async def test_hermes_home_replies_stops_stream_and_persists_partial_on_disconnect(
    monkeypatch,
):
    _stub_project_snapshots(monkeypatch, set())
    replies, _thread, _runtime, history = _build_replies(
        [
            _event("assistant_delta", text="部分回复"),
            _event("assistant_delta", text="不应继续生成"),
        ]
    )
    attempted = []

    async def on_event(event):
        attempted.append(event)
        if event["type"] == "assistant.delta":
            raise ConnectionError("disconnected")

    with pytest.raises(ConnectionError, match="disconnected"):
        await replies.stream(
            "alice",
            ChatScope(kind="home"),
            "问题",
            [],
            "turn-disconnected",
            on_event,
        )

    assert [event["type"] for event in attempted].count("assistant.delta") == 1
    assistant_messages = [item for item in history.appended if item[2] == "assistant"]
    assert len(assistant_messages) == 1
    assert assistant_messages[0][3] == "部分回复"
