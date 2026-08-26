from ai_anime.modules.ai_assistant.application import ProjectChatMessages, ProjectMedia
from ai_anime.modules.ai_assistant.infrastructure import (
    LocalProjectMediaFiles,
    SQLiteChatHistory,
)


class StubHistory:
    def __init__(self):
        self.appended = []
        self.trace_contents = ["trace-a"]
        self.replaced = None

    def append_project_message(
        self,
        username,
        project,
        role,
        content,
        media=None,
        **kwargs,
    ):
        item = {
            "username": username,
            "project": project,
            "role": role,
            "content": content,
            "media": media,
            **kwargs,
        }
        self.appended.append(item)
        return item

    def append_project_trace_messages(
        self,
        username,
        project,
        contents,
        **kwargs,
    ):
        return [
            self.append_project_message(
                username,
                project,
                "trace",
                content,
                **kwargs,
            )
            for content in contents
        ]

    def list_project_trace_contents(self, username, project, **kwargs):
        return self.trace_contents

    def replace_project_trace_messages(
        self,
        username,
        project,
        messages,
        **kwargs,
    ):
        self.replaced = (username, project, messages, kwargs)

    def append_ui_event(self, username, scope, turn_id, event, **kwargs):
        item = (username, scope, turn_id, event, kwargs)
        self.ui_event = item
        return {"event": event}


class UnusedMedia:
    def extract(self, *args, **kwargs):
        raise AssertionError("media extraction is not expected")

    def normalize(self, *args, **kwargs):
        raise AssertionError("media normalization is not expected")


def test_project_history_keeps_text_and_media_projection(monkeypatch, tmp_path):
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(tmp_path / "state"))
    project_dir = tmp_path / "output" / "admin" / "show-1"
    image = project_dir / "images" / "frame.png"
    image.parent.mkdir(parents=True)
    image.write_bytes(b"image")
    messages = ProjectChatMessages(
        SQLiteChatHistory(),
        ProjectMedia(LocalProjectMediaFiles()),
    )

    messages.append_assistant(
        "admin",
        "show-1",
        "第一段",
        turn_id="turn-1",
        project_dir=project_dir,
    )
    messages.append_assistant(
        "admin",
        "show-1",
        "第一段第二段\nimages/frame.png",
        turn_id="turn-2",
        project_dir=project_dir,
    )

    history = messages.list(
        "admin",
        "show-1",
        project_dir=project_dir,
    )

    assert [message["content"] for message in history] == [
        "第一段",
        "第二段\nimages/frame.png",
    ]
    assert [message["turn_id"] for message in history] == ["turn-1", "turn-2"]
    assert [item["path"] for item in history[-1]["media"]] == ["images/frame.png"]


def test_project_history_keeps_uploaded_document_attachment_metadata(
    monkeypatch,
    tmp_path,
):
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(tmp_path / "state"))
    project_dir = tmp_path / "output" / "admin" / "show-1"
    messages = ProjectChatMessages(
        SQLiteChatHistory(),
        ProjectMedia(LocalProjectMediaFiles()),
    )

    messages.append_user(
        "admin",
        "show-1",
        "按文档生成第一集",
        [
            {
                "id": "attachment-1",
                "type": "file",
                "mimeType": "text/markdown",
                "fileName": "第一集.md",
                "fileSize": 128,
                "content": "原始 Markdown 内容不应进入历史响应",
            }
        ],
        turn_id="turn-1",
        project_dir=project_dir,
    )

    history = messages.list("admin", "show-1", project_dir=project_dir)

    assert history[0]["media"] == []
    assert history[0]["attachments"] == [
        {
            "id": "attachment-1",
            "type": "file",
            "mimeType": "text/markdown",
            "fileName": "第一集.md",
            "fileSize": 128,
        }
    ]


def test_project_assistant_message_redacts_local_path_before_persistence():
    history = StubHistory()
    messages = ProjectChatMessages(history, UnusedMedia())

    persisted = messages.append_assistant(
        "alice",
        "project-a",
        "local: ~/Works/ai-anime/src",
        [{"kind": "image", "url": "/frame.png"}],
        project_dir="output",
        project_state_dir="state",
    )

    assert persisted["content"] == "local: [本地路径]"
    assert persisted["role"] == "assistant"
    assert persisted["media"] == [{"kind": "image", "url": "/frame.png"}]
    assert persisted["project_dir"] == "output"
    assert persisted["project_state_dir"] == "state"


def test_project_message_use_cases_delegate_user_and_trace_operations():
    history = StubHistory()
    messages = ProjectChatMessages(history, UnusedMedia())

    user_message = messages.append_user("alice", "project-a", "hello")
    trace_messages = messages.append_traces(
        "alice",
        "project-a",
        ["trace-1", "trace-2"],
    )
    traces = messages.trace_contents("alice", "project-a")
    replacement = [{"role": "trace", "content": "replacement"}]
    messages.replace_traces("alice", "project-a", replacement)
    ui_event = messages.append_ui_event(
        "alice",
        "project-a",
        "turn-1",
        {"type": "tool.call"},
        project_state_dir="state",
    )

    assert user_message["role"] == "user"
    assert [message["content"] for message in trace_messages] == [
        "trace-1",
        "trace-2",
    ]
    assert traces == ["trace-a"]
    assert history.replaced == (
        "alice",
        "project-a",
        replacement,
        {
            "project_dir": None,
            "project_state_dir": None,
            "conversation_id": "main",
        },
    )
    assert ui_event == {"event": {"type": "tool.call"}}
    assert history.ui_event[0] == "alice"
    assert history.ui_event[1].id == "project-a"
    assert history.ui_event[1].conversation_id == "main"
    assert history.ui_event[2:] == (
        "turn-1",
        {"type": "tool.call"},
        {"project_dir": None, "project_state_dir": "state"},
    )
