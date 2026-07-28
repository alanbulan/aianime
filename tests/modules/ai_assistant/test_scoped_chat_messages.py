import pytest

from ai_anime.modules.ai_assistant.application import ScopedChatMessages
from ai_anime.modules.ai_assistant.public import ChatScope, get_scoped_chat_messages


class StubHistory:
    def __init__(self):
        self.messages = []
        self.ui_events = []
        self.listed = []

    def append_message(self, username, scope, role, content):
        self.messages.append((username, scope, role, content))
        return {"role": role, "content": content}

    def append_ui_event(self, username, scope, turn_id, event):
        self.ui_events.append((username, scope, turn_id, event))
        return {"turn_id": turn_id, **event}

    def list_messages(self, username, scope):
        self.listed.append((username, scope))
        return [{"role": "assistant", "content": "home"}]


class StubProjectMessages:
    def __init__(self):
        self.notifications = []
        self.listed = []

    def append_assistant(
        self,
        username,
        project,
        content,
        media=None,
        *,
        project_dir=None,
        project_state_dir=None,
    ):
        self.notifications.append(
            (username, project, content, project_dir, project_state_dir)
        )
        return {"role": "assistant", "content": content}

    def list(
        self,
        username,
        project,
        *,
        project_dir=None,
        project_state_dir=None,
    ):
        self.listed.append((username, project, project_dir, project_state_dir))
        return [{"role": "assistant", "content": "project"}]


def _build_messages():
    history = StubHistory()
    projects = StubProjectMessages()
    return ScopedChatMessages(history, projects), history, projects


def test_scoped_chat_messages_composition_returns_one_process_instance():
    assert get_scoped_chat_messages() is get_scoped_chat_messages()


def test_scoped_chat_messages_appends_home_notification():
    messages, history, projects = _build_messages()
    scope = ChatScope(kind="home")

    result = messages.append_notification("alice", scope, "完成")

    assert result == {"role": "assistant", "content": "完成"}
    assert history.messages == [("alice", scope, "assistant", "完成")]
    assert projects.notifications == []


def test_scoped_chat_messages_appends_project_notification_with_paths(tmp_path):
    messages, history, projects = _build_messages()

    result = messages.append_notification(
        "alice",
        ChatScope(kind="project", id="project-a"),
        "完成",
        project_dir=tmp_path / "output",
        project_state_dir=tmp_path / "state",
    )

    assert result == {"role": "assistant", "content": "完成"}
    assert history.messages == []
    assert projects.notifications == [
        (
            "alice",
            "project-a",
            "完成",
            tmp_path / "output",
            tmp_path / "state",
        )
    ]


def test_scoped_chat_messages_appends_ui_event():
    messages, history, _projects = _build_messages()
    scope = ChatScope(kind="home")
    event = {"type": "task.completed", "task_id": "task-1"}

    result = messages.append_ui_event("alice", scope, "turn-1", event)

    assert result == {"turn_id": "turn-1", **event}
    assert history.ui_events == [("alice", scope, "turn-1", event)]


@pytest.mark.parametrize(
    ("scope", "expected_content"),
    [
        (ChatScope(kind="home"), "home"),
        (ChatScope(kind="project", id="project-a"), "project"),
    ],
)
def test_scoped_chat_messages_lists_scope_history(scope, expected_content, tmp_path):
    messages, history, projects = _build_messages()

    result = messages.list(
        "alice",
        scope,
        project_dir=tmp_path / "output",
        project_state_dir=tmp_path / "state",
    )

    assert result[0]["content"] == expected_content
    if scope.kind == "project":
        assert projects.listed == [
            (
                "alice",
                "project-a",
                tmp_path / "output",
                tmp_path / "state",
            )
        ]
        assert history.listed == []
    else:
        assert history.listed == [("alice", scope)]
        assert projects.listed == []
