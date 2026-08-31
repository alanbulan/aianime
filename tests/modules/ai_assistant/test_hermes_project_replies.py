from types import SimpleNamespace

import pytest

from ai_anime.modules.ai_assistant.application import HermesProjectReplies
from ai_anime.modules.ai_assistant.application import (
    hermes_project_replies as replies_module,
)


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
    def __init__(self, events, error=None):
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
    async def apply_to(self, thread, _username, _scope, **_kwargs):
        thread.model_route_applied = True
        return (None, "none")


class StubPromptContext:
    def build(self, username, project, prompt, **_kwargs):
        return f"context:{username}:{project}:{prompt}"


class StubProjectMessages:
    def __init__(self, assistants=None, traces=None, context_policy=None):
        self.previous_assistants = assistants or []
        self.previous_traces = traces or []
        self.context_policy = context_policy
        self.appended_traces = []
        self.appended_assistants = []
        self.rebuilt_revisions = []

    def load_context_policy(
        self,
        username,
        project,
        *,
        project_dir=None,
        project_state_dir=None,
        conversation_id="main",
    ):
        if self.context_policy is not None:
            return self.context_policy
        return {
            "revision": 0,
            "rebuild_required": False,
            "messages": [
                {
                    "id": index,
                    "role": "assistant",
                    "content": content,
                    "context_state": "normal",
                }
                for index, content in enumerate(self.previous_assistants, start=1)
            ],
        }

    def mark_context_rebuilt(
        self,
        username,
        project,
        revision,
        *,
        project_dir=None,
        project_state_dir=None,
        conversation_id="main",
    ):
        self.rebuilt_revisions.append(revision)
        return True

    def assistant_contents(
        self,
        username,
        project,
        *,
        project_dir=None,
        project_state_dir=None,
        conversation_id="main",
    ):
        return self.previous_assistants

    def trace_contents(
        self,
        username,
        project,
        *,
        project_dir=None,
        project_state_dir=None,
        conversation_id="main",
    ):
        return self.previous_traces

    def append_traces(
        self,
        username,
        project,
        contents,
        *,
        project_dir=None,
        project_state_dir=None,
        conversation_id="main",
    ):
        self.appended_traces.append(
            (
                username,
                project,
                contents,
                project_dir,
                project_state_dir,
                conversation_id,
            )
        )

    def append_assistant(
        self,
        username,
        project,
        content,
        media,
        *,
        turn_id=None,
        project_dir=None,
        project_state_dir=None,
        conversation_id="main",
    ):
        self.appended_assistants.append(
            (
                username,
                project,
                content,
                media,
                turn_id,
                project_dir,
                project_state_dir,
                conversation_id,
            )
        )
        return {"id": 1, "role": "assistant", "content": content, "media": media}


class StubProjectMedia:
    def __init__(self):
        self.calls = []

    def extract(self, content, username, project, *, project_dir=None):
        self.calls.append((content, username, project, project_dir))
        return [{"kind": "image", "url": "/static/result.png"}]


class StubPresentation:
    def extract_tool_ui_specs(self, raw):
        return list(raw.get("ui_specs", [])) if isinstance(raw, dict) else []

    def append_tool_ui_specs(self, content, specs):
        return f"{content}|specs:{len(specs)}" if specs else content

    def normalize_reply(self, content):
        return f"normalized:{content}"


class StubPageSessions:
    def __init__(self):
        self.calls = []

    async def create_token(self, username, project, *, agent_kind):
        self.calls.append((username, project, agent_kind))
        return "fallback-token"


class StubDisplayFallbacks:
    def __init__(self):
        self.calls = []

    async def build(self, project, tool_name, args, *, token):
        self.calls.append((project, tool_name, args, token))
        return [{"type": "fallback", "tool": tool_name}]


def _build_replies(
    events,
    *,
    error=None,
    assistants=None,
    traces=None,
    context_policy=None,
):
    thread = StubThread(events, error=error)
    runtime = StubHermesRuntime(thread)
    messages = StubProjectMessages(
        assistants=assistants,
        traces=traces,
        context_policy=context_policy,
    )
    media = StubProjectMedia()
    sessions = StubPageSessions()
    fallbacks = StubDisplayFallbacks()
    replies = HermesProjectReplies(
        runtime,
        StubPromptContext(),
        messages,
        media,
        StubPresentation(),
        sessions,
        fallbacks,
        StubSessionModels(),
    )
    return replies, thread, runtime, messages, media, sessions, fallbacks


@pytest.mark.anyio
async def test_hermes_project_replies_stream_and_persist_visible_events(
    monkeypatch,
    tmp_path,
):
    monkeypatch.setattr(
        replies_module, "infer_display_tool_call_from_text", lambda *_: None
    )
    events = [
        _event("thread_started", thread_id="thread-1", turn_id="turn-1"),
        _event("assistant_delta", text="Answer"),
        _event("tool_update", text="trace", name="Render"),
        _event("complete", text="Final answer"),
    ]
    replies, thread, runtime, messages, media, _sessions, _fallbacks = _build_replies(
        events
    )
    emitted = []

    async def on_event(event):
        emitted.append(event)

    result = await replies.stream(
        "alice",
        "project-a",
        "question",
        on_event,
        turn_id="turn-1",
        project_dir=tmp_path / "output",
        project_state_dir=tmp_path / "state",
    )

    assert runtime.calls == [("alice", "project", "project-a", "main")]
    assert thread.model_route_applied_before_stream == [True]
    assert thread.calls == [("context:alice:project-a:question", "project-a")]
    assert [event["type"] for event in emitted] == [
        "thread_started",
        "assistant_delta",
        "tool_update",
        "assistant_message",
        "done",
    ]
    assert messages.appended_traces == [
        (
            "alice",
            "project-a",
            ["trace"],
            tmp_path / "output",
            tmp_path / "state",
            "main",
        )
    ]
    assert media.calls == [
        (
            "normalized:Final answer",
            "alice",
            "project-a",
            tmp_path / "output",
        )
    ]
    assert emitted[-1] == {"type": "done", "message": result}
    assert messages.appended_assistants[0][4] == "turn-1"


@pytest.mark.anyio
async def test_hermes_project_replies_persist_partial_reply_after_stream_failure(
    monkeypatch,
    tmp_path,
):
    monkeypatch.setattr(
        replies_module, "infer_display_tool_call_from_text", lambda *_: None
    )
    replies, _thread, _runtime, messages, _media, _sessions, _fallbacks = (
        _build_replies(
            [_event("assistant_delta", text="Partial answer")],
            error=RuntimeError("stream failed"),
        )
    )

    async def disconnected_sink(event):
        raise ConnectionError("disconnected")

    with pytest.raises(ConnectionError, match="disconnected"):
        await replies.stream(
            "alice",
            "project-a",
            "question",
            disconnected_sink,
            turn_id="turn-partial",
            project_dir=tmp_path / "output",
            project_state_dir=tmp_path / "state",
        )

    assert len(messages.appended_assistants) == 1
    assert messages.appended_assistants[0][2] == "normalized:Partial answer"
    assert messages.appended_assistants[0][4] == "turn-partial"


@pytest.mark.anyio
async def test_hermes_project_replies_dedupe_tool_errors_and_display_fallbacks(
    monkeypatch,
):
    monkeypatch.setattr(
        replies_module,
        "tool_chat_error",
        lambda _raw, **_kwargs: "mapped error",
    )
    monkeypatch.setattr(
        replies_module,
        "extract_display_tool_call",
        lambda _raw: ("ai_anime_get_sketches", {"episode": 1}),
    )
    monkeypatch.setattr(replies_module, "dedupe_tool_ui_specs", lambda specs: specs)
    monkeypatch.setattr(
        replies_module,
        "filter_tool_ui_specs_for_prompt",
        lambda _prompt, specs: specs,
    )
    monkeypatch.setattr(
        replies_module, "infer_display_tool_call_from_text", lambda *_: None
    )
    raw = {"sessionUpdate": "tool_call"}
    events = [
        _event("tool_update", text="trace-a", name="Display", raw=raw),
        _event("tool_update", text="trace-b", name="Display", raw=raw),
        _event("complete", text="replacement completion"),
    ]
    replies, _thread, _runtime, messages, _media, sessions, fallbacks = _build_replies(
        events
    )
    emitted = []

    async def on_event(event):
        emitted.append(event)

    result = await replies.stream(
        "alice",
        "project-a",
        "question",
        on_event,
    )

    assert sessions.calls == [("alice", "project-a", "hermes-display-fallback")]
    assert fallbacks.calls == [
        (
            "project-a",
            "ai_anime_get_sketches",
            {"episode": 1},
            "fallback-token",
        )
    ]
    assert result["content"] == "normalized:mapped error|specs:1"
    assert len([event for event in emitted if event["type"] == "assistant_delta"]) == 1
    assert messages.appended_traces[0][2] == ["trace-a\ntrace-b"]


@pytest.mark.anyio
async def test_hermes_project_replies_recovers_inferred_display_call(monkeypatch):
    monkeypatch.setattr(
        replies_module,
        "infer_display_tool_call_from_text",
        lambda *_: ("ai_anime_get_sketches", {"episode": 2}),
    )
    monkeypatch.setattr(replies_module, "dedupe_tool_ui_specs", lambda specs: specs)
    monkeypatch.setattr(
        replies_module,
        "filter_tool_ui_specs_for_prompt",
        lambda _prompt, specs: specs,
    )
    replies, _thread, _runtime, _messages, _media, sessions, fallbacks = _build_replies(
        [_event("complete", text="正在展示第2集草图")]
    )

    async def on_event(event):
        return None

    result = await replies.stream(
        "alice",
        "project-a",
        "看第2集草图",
        on_event,
    )

    assert sessions.calls == [("alice", "project-a", "hermes-display-fallback")]
    assert fallbacks.calls == [
        (
            "project-a",
            "ai_anime_get_sketches",
            {"episode": 2},
            "fallback-token",
        )
    ]
    assert result["content"] == "normalized:正在展示第2集草图|specs:1"


@pytest.mark.anyio
async def test_hermes_project_replies_localizes_empty_runtime_response(monkeypatch):
    monkeypatch.setattr(
        replies_module, "infer_display_tool_call_from_text", lambda *_: None
    )
    replies, _thread, _runtime, _messages, _media, _sessions, _fallbacks = (
        _build_replies([_event("complete", text="")])
    )

    async def on_event(_event_value):
        return None

    result = await replies.stream("alice", "project-a", "你好", on_event)

    assert "助手运行时没有返回有效内容" in result["content"]
    assert "hermes returned no content" not in result["content"]


@pytest.mark.anyio
async def test_hermes_project_replies_hides_recovered_skill_lookup_failure(monkeypatch):
    monkeypatch.setattr(
        replies_module, "infer_display_tool_call_from_text", lambda *_: None
    )
    replies, _thread, _runtime, _messages, _media, _sessions, _fallbacks = (
        _build_replies(
            [
                _event(
                    "tool_update",
                    text="  failed",
                    name="skill_view",
                    error="Skill not found",
                    raw={"status": "failed", "error": "Skill not found"},
                ),
                _event("complete", text="你好！有什么我可以帮你处理的吗？"),
            ]
        )
    )
    emitted = []

    async def on_event(event):
        emitted.append(event)

    result = await replies.stream("alice", "project-a", "你好", on_event)

    assert result["content"] == "normalized:你好！有什么我可以帮你处理的吗？"
    assert not any(event["type"] == "assistant_delta" for event in emitted)


@pytest.mark.anyio
async def test_hermes_project_replies_rebuilds_runtime_after_context_exclusion(
    monkeypatch,
):
    monkeypatch.setattr(
        replies_module, "infer_display_tool_call_from_text", lambda *_: None
    )
    replies, thread, runtime, messages, *_rest = _build_replies(
        [
            _event("thread_started", thread_id="fresh", turn_id="worker-turn"),
            _event("complete", text="已按新上下文继续"),
        ],
        context_policy={
            "revision": 4,
            "rebuild_required": True,
            "messages": [
                {
                    "id": 2,
                    "role": "assistant",
                    "content": "仍然有效的历史",
                    "context_state": "normal",
                }
            ],
        },
    )
    emitted = []

    async def on_event(event):
        emitted.append(event)

    await replies.stream(
        "alice",
        "project-a",
        "继续",
        on_event,
        turn_id="turn-2",
    )

    assert runtime.forgotten == [("alice", "project", "project-a", "main")]
    assert messages.rebuilt_revisions == [4]
    assert thread.calls[0][0] == "context:alice:project-a:继续"
    assert emitted[0]["type"] == "thread_started"


@pytest.mark.anyio
async def test_hermes_project_replies_forwards_raw_slash_commands(monkeypatch):
    monkeypatch.setattr(
        replies_module, "infer_display_tool_call_from_text", lambda *_: None
    )
    commands = [{"name": "help", "description": "List commands"}]
    replies, thread, _runtime, messages, *_rest = _build_replies(
        [
            _event("available_commands", raw=commands),
            _event("complete", text="命令列表"),
        ]
    )
    emitted = []

    async def on_event(event):
        emitted.append(event)

    await replies.stream("alice", "project-a", "/help", on_event)

    assert thread.calls[0] == ("/help", "project-a")
    assert messages.rebuilt_revisions == []
    assert {
        "type": "available_commands",
        "commands": commands,
    } in emitted
