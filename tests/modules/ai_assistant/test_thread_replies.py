from types import SimpleNamespace

import pytest

from ai_anime.modules.ai_assistant.application import AgentThreadReplies
from ai_anime.modules.ai_assistant.public import get_agent_thread_replies


def _event(event_type, **values):
    return SimpleNamespace(
        type=event_type,
        thread_id=values.get("thread_id"),
        turn_id=values.get("turn_id"),
        text=values.get("text"),
    )


class StubThread:
    def __init__(self, events):
        self.events = events
        self.prompts = []

    async def stream(self, prompt):
        self.prompts.append(prompt)
        for event in self.events:
            yield event


class StubThreadRuntime:
    def __init__(self, thread):
        self.thread = thread
        self.opened = []
        self.remembered = []

    def open_claude(self, username, project, agent_token):
        self.opened.append(("claude", username, project, agent_token))
        return self.thread

    def open_codex(self, username, project, agent_token):
        self.opened.append(("codex", username, project, agent_token))
        return self.thread

    def remember(self, username, backend, thread_id):
        self.remembered.append((username, backend, thread_id))


class StubPromptContext:
    def __init__(self):
        self.calls = []

    def build(self, username, project, prompt):
        self.calls.append((username, project, prompt))
        return f"context:{prompt}"


class StubPageSessions:
    def __init__(self):
        self.calls = []

    async def create_token(self, username, project, *, agent_kind):
        self.calls.append((username, project, agent_kind))
        return f"token:{agent_kind}"


class StubProjectMedia:
    def __init__(self):
        self.calls = []

    def extract(self, content, username, project, *, project_dir=None):
        self.calls.append((content, username, project, project_dir))
        return [{"kind": "image", "url": "/static/result.png"}]


class StubProjectMessages:
    def __init__(self):
        self.traces = []
        self.assistants = []

    def append_traces(
        self,
        username,
        project,
        contents,
        *,
        project_dir=None,
        project_state_dir=None,
    ):
        self.traces.append(
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
        self.assistants.append(
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


class StubPresentation:
    def normalize_reply(self, content):
        return f"normalized:{content}"


def _build_replies(events):
    thread = StubThread(events)
    runtime = StubThreadRuntime(thread)
    prompt_context = StubPromptContext()
    page_sessions = StubPageSessions()
    project_media = StubProjectMedia()
    project_messages = StubProjectMessages()
    replies = AgentThreadReplies(
        runtime,
        prompt_context,
        page_sessions,
        project_media,
        project_messages,
        StubPresentation(),
    )
    return (
        replies,
        thread,
        runtime,
        prompt_context,
        page_sessions,
        project_media,
        project_messages,
    )


def test_agent_thread_replies_composition_returns_one_process_instance():
    assert get_agent_thread_replies() is get_agent_thread_replies()


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("backend", "expected_tool_events", "expected_traces"),
    [
        ("claude", ["trace-a\n", "trace-b\n"], ["trace-b"]),
        (
            "codex",
            ["trace-a\n", "trace-a\ntrace-b\n"],
            ["trace-a\ntrace-b"],
        ),
    ],
)
async def test_agent_thread_replies_preserve_backend_tool_stream_semantics(
    backend,
    expected_tool_events,
    expected_traces,
    tmp_path,
):
    events = [
        _event("thread_started", thread_id="thread-1", turn_id="turn-1"),
        _event("assistant_delta", text="Hello"),
        _event("assistant_delta", text=" world"),
        _event("tool_update", text="trace-a\n"),
        _event("tool_update", text="trace-b\n"),
        _event("complete", thread_id="thread-1", text="Final answer"),
    ]
    (
        replies,
        thread,
        runtime,
        prompt_context,
        page_sessions,
        project_media,
        project_messages,
    ) = _build_replies(events)
    emitted = []

    async def on_event(event):
        emitted.append(event)

    result = await replies.stream(
        backend,
        "alice",
        "project-a",
        "question",
        on_event,
        project_dir=tmp_path / "output",
        project_state_dir=tmp_path / "state",
    )

    assert runtime.opened == [(backend, "alice", "project-a", f"token:{backend}")]
    assert runtime.remembered == [
        ("alice", backend, "thread-1"),
        ("alice", backend, "thread-1"),
    ]
    assert thread.prompts == ["context:question"]
    assert prompt_context.calls == [("alice", "project-a", "question")]
    assert page_sessions.calls == [("alice", "project-a", backend)]
    assert [
        event["text"] for event in emitted if event["type"] == "assistant_delta"
    ] == [
        "Hello",
        "Hello world",
    ]
    assert [event["text"] for event in emitted if event["type"] == "tool_update"] == (
        expected_tool_events
    )
    assert project_messages.traces == [
        (
            "alice",
            "project-a",
            expected_traces,
            tmp_path / "output",
            tmp_path / "state",
        )
    ]
    assert project_media.calls == [
        (
            "normalized:Final answer",
            "alice",
            "project-a",
            tmp_path / "output",
        )
    ]
    assert project_messages.assistants[0][2] == "normalized:Final answer"
    assert emitted[-1] == {"type": "done", "message": result}


@pytest.mark.anyio
async def test_agent_thread_replies_persist_empty_completion_fallback(tmp_path):
    (
        replies,
        _thread,
        _runtime,
        _prompt_context,
        _page_sessions,
        _project_media,
        project_messages,
    ) = _build_replies([_event("complete", text="stop=end_turn")])
    emitted = []

    async def on_event(event):
        emitted.append(event)

    result = await replies.stream(
        "codex",
        "alice",
        "project-a",
        "question",
        on_event,
        project_dir=tmp_path / "output",
        project_state_dir=tmp_path / "state",
    )

    assert result["content"] == "normalized:已执行，但没有返回正文。"
    assert project_messages.traces == []
    assert emitted == [{"type": "done", "message": result}]
