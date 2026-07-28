from types import SimpleNamespace

import pytest

from ai_anime.modules.ai_assistant.application import HermesProjectReplies
from ai_anime.modules.ai_assistant.application import (
    hermes_project_replies as replies_module,
)
from ai_anime.modules.ai_assistant.public import get_hermes_project_replies


def _event(event_type, **values):
    return SimpleNamespace(
        type=event_type,
        thread_id=values.get("thread_id"),
        turn_id=values.get("turn_id"),
        text=values.get("text"),
        name=values.get("name"),
        raw=values.get("raw"),
    )


class StubThread:
    def __init__(self, events, error=None):
        self.events = events
        self.error = error
        self.calls = []

    async def stream(self, prompt, *, current_project=None):
        self.calls.append((prompt, current_project))
        for event in self.events:
            yield event
        if self.error is not None:
            raise self.error


class StubHermesRuntime:
    def __init__(self, thread):
        self.thread = thread
        self.calls = []

    async def get_for_user(self, username, *, scope_kind, project_id):
        self.calls.append((username, scope_kind, project_id))
        return self.thread


class StubPromptContext:
    def build(self, username, project, prompt):
        return f"context:{username}:{project}:{prompt}"


class StubProjectMessages:
    def __init__(self, assistants=None, traces=None):
        self.previous_assistants = assistants or []
        self.previous_traces = traces or []
        self.appended_traces = []
        self.appended_assistants = []

    def assistant_contents(
        self,
        username,
        project,
        *,
        project_dir=None,
        project_state_dir=None,
    ):
        return self.previous_assistants

    def trace_contents(
        self,
        username,
        project,
        *,
        project_dir=None,
        project_state_dir=None,
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
    ):
        self.appended_traces.append(
            (username, project, contents, project_dir, project_state_dir)
        )

    def append_assistant(
        self,
        username,
        project,
        content,
        media,
        *,
        project_dir=None,
        project_state_dir=None,
    ):
        self.appended_assistants.append(
            (
                username,
                project,
                content,
                media,
                project_dir,
                project_state_dir,
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


def _build_replies(events, *, error=None, assistants=None, traces=None):
    thread = StubThread(events, error=error)
    runtime = StubHermesRuntime(thread)
    messages = StubProjectMessages(assistants=assistants, traces=traces)
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
    )
    return replies, thread, runtime, messages, media, sessions, fallbacks


def test_hermes_project_replies_composition_returns_one_process_instance():
    assert get_hermes_project_replies() is get_hermes_project_replies()


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
        project_dir=tmp_path / "output",
        project_state_dir=tmp_path / "state",
    )

    assert runtime.calls == [("alice", "project", "project-a")]
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

    with pytest.raises(RuntimeError, match="stream failed"):
        await replies.stream(
            "alice",
            "project-a",
            "question",
            disconnected_sink,
            project_dir=tmp_path / "output",
            project_state_dir=tmp_path / "state",
        )

    assert len(messages.appended_assistants) == 1
    assert messages.appended_assistants[0][2] == "normalized:Partial answer"


@pytest.mark.anyio
async def test_hermes_project_replies_dedupe_tool_errors_and_display_fallbacks(
    monkeypatch,
):
    monkeypatch.setattr(replies_module, "tool_chat_error", lambda _raw: "mapped error")
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
