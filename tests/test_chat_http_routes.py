from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from ai_anime.api.routes.ai_assistant.schemas import (
    ChatNotificationIn,
    ChatScopePayload,
    ChatSlashCommandIn,
    ChatUiEventIn,
    DecisionCreateIn,
    DecisionResolveIn,
    MessageContextUpdateIn,
)
from ai_anime.api.routes.ai_assistant import http as chat_http_routes


@pytest.fixture
def anyio_backend():
    return "asyncio"


def test_decision_schema_accepts_more_than_three_questions_and_answers() -> None:
    questions = [
        {
            "id": f"choice_{index}",
            "header": f"参数{index}",
            "question": f"请选择参数 {index}",
            "options": [
                {"id": "recommended", "label": "推荐值"},
                {"id": "alternative", "label": "备选值"},
            ],
            "recommended_option_id": "recommended",
        }
        for index in range(1, 6)
    ]
    created = DecisionCreateIn.model_validate({"questions": questions})
    resolved = DecisionResolveIn.model_validate(
        {
            "answers": [
                {
                    "question_id": question["id"],
                    "option_id": "recommended",
                }
                for question in questions
            ]
        }
    )

    assert len(created.questions) == 5
    assert len(resolved.answers) == 5


@pytest.mark.anyio
async def test_cancel_chat_turn_delegates_to_worker_lifecycle(monkeypatch):
    seen = []

    class StubChatWorkerLifecycle:
        async def cancel(self, username):
            seen.append(username)
            return True

    class StubChatDecisions:
        async def cancel_for_user(self, username):
            seen.append(f"decision:{username}")
            return 1

    monkeypatch.setattr(
        chat_http_routes,
        "chat_worker_lifecycle",
        StubChatWorkerLifecycle(),
    )
    monkeypatch.setattr(chat_http_routes, "chat_decisions", StubChatDecisions())

    result = await chat_http_routes.cancel_chat_turn(user={"username": "alice"})

    assert result == {
        "ok": True,
        "data": {"cancelled": True, "cancelled_decisions": 1},
    }
    assert seen == ["decision:alice", "alice"]


@pytest.mark.anyio
async def test_create_chat_decision_requires_agent_session_and_waits(monkeypatch):
    seen = []

    class StubChatDecisions:
        async def ask(self, username, **kwargs):
            seen.append((username, kwargs))
            return {
                "decision_id": "decision-1",
                "status": "resolved",
                "answers": [
                    {
                        "question_id": "resolution",
                        "option_id": "1080p",
                        "value": "1080p",
                    }
                ],
            }

    monkeypatch.setattr(chat_http_routes, "chat_decisions", StubChatDecisions())
    payload = DecisionCreateIn.model_validate(
        {
            "title": "生成前确认",
            "project_id": "project-1",
            "questions": [
                {
                    "id": "resolution",
                    "header": "分辨率",
                    "question": "本次使用哪种分辨率？",
                    "options": [
                        {"id": "1080p", "label": "1080p"},
                        {"id": "720p", "label": "720p"},
                    ],
                    "recommended_option_id": "1080p",
                }
            ],
        }
    )

    with pytest.raises(HTTPException) as denied:
        await chat_http_routes.create_chat_decision(
            payload,
            user={"username": "alice", "credential_kind": "browser"},
        )
    assert denied.value.status_code == 403

    result = await chat_http_routes.create_chat_decision(
        payload,
        user={"username": "alice", "credential_kind": "agent_session"},
    )

    assert result["data"]["status"] == "resolved"
    assert seen[0][0] == "alice"
    assert seen[0][1]["project_id"] == "project-1"
    assert seen[0][1]["questions"][0]["recommended_option_id"] == "1080p"


@pytest.mark.anyio
async def test_resolve_chat_decision_forwards_browser_answer(monkeypatch):
    seen = []

    class StubChatDecisions:
        async def resolve(self, username, decision_id, answers):
            seen.append((username, decision_id, answers))
            return {
                "decision_id": decision_id,
                "status": "resolved",
                "answers": answers,
            }

    monkeypatch.setattr(chat_http_routes, "chat_decisions", StubChatDecisions())

    result = await chat_http_routes.resolve_chat_decision(
        "decision-1",
        DecisionResolveIn.model_validate(
            {
                "answers": [
                    {"question_id": "resolution", "option_id": "720p"}
                ]
            }
        ),
        user={"username": "alice", "credential_kind": "browser"},
    )

    assert result["data"]["status"] == "resolved"
    assert seen == [
        (
            "alice",
            "decision-1",
            [
                {
                    "question_id": "resolution",
                    "option_id": "720p",
                }
            ],
        )
    ]


@pytest.mark.anyio
async def test_append_chat_notification_persists_project_assistant_message(
    monkeypatch, tmp_path
):
    seen = {}

    async def fake_project_context(user, scope):
        seen["scope"] = scope
        return SimpleNamespace(
            output_dir=tmp_path / "out", state_dir=tmp_path / "state"
        )

    def fake_append_notification(
        username,
        scope,
        content,
        *,
        project_dir=None,
        project_state_dir=None,
    ):
        seen.update(
            {
                "username": username,
                "project": scope.id,
                "content": content,
                "project_dir": project_dir,
                "project_state_dir": project_state_dir,
            }
        )
        return {"id": "1", "role": "assistant", "content": content}

    monkeypatch.setattr(
        chat_http_routes.chat_access,
        "project_context_for_scope",
        fake_project_context,
    )
    monkeypatch.setattr(
        chat_http_routes.scoped_chat_messages,
        "append_notification",
        fake_append_notification,
    )

    result = await chat_http_routes.append_chat_notification(
        ChatNotificationIn(
            scope=ChatScopePayload(kind="project", id="demo"),
            text="  任务已完成。  ",
        ),
        user={"username": "alice"},
    )

    assert result == {
        "ok": True,
        "data": {"id": "1", "role": "assistant", "content": "任务已完成。"},
    }
    assert seen["username"] == "alice"
    assert seen["project"] == "demo"
    assert seen["content"] == "任务已完成。"
    assert seen["project_dir"] == tmp_path / "out"
    assert seen["project_state_dir"] == tmp_path / "state"


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("text", "detail"),
    [("   ", "text is required"), ("x" * 4001, "text is too long")],
)
async def test_append_chat_notification_validates_text(text, detail):
    with pytest.raises(HTTPException) as raised:
        await chat_http_routes.append_chat_notification(
            ChatNotificationIn(text=text),
            user={"username": "alice"},
        )

    assert raised.value.status_code == 400
    assert raised.value.detail == detail


@pytest.mark.anyio
async def test_execute_chat_command_is_scoped_and_not_persisted(monkeypatch):
    seen = []

    async def fake_project_context(user, scope):
        seen.append(("access", user, scope))
        return SimpleNamespace()

    class IdleLifecycle:
        def is_busy(self, username):
            seen.append(("busy", username))
            return False

    class RecordingCommands:
        async def execute(self, username, scope, command):
            seen.append(("execute", username, scope, command))
            return SimpleNamespace(
                text="模型上下文：8 条消息",
                usage=SimpleNamespace(used=18149, size=131072),
            )

    monkeypatch.setattr(
        chat_http_routes.chat_access,
        "project_context_for_scope",
        fake_project_context,
    )
    monkeypatch.setattr(chat_http_routes, "chat_worker_lifecycle", IdleLifecycle())
    monkeypatch.setattr(
        chat_http_routes,
        "hermes_session_commands",
        RecordingCommands(),
    )
    user = {"username": "alice"}
    result = await chat_http_routes.execute_chat_command(
        ChatSlashCommandIn(
            scope=ChatScopePayload(kind="project", id="project-a"),
            command="context",
        ),
        user=user,
    )

    scope = seen[0][2]
    assert result == {
        "ok": True,
        "data": {
            "command": "context",
            "text": "模型上下文：8 条消息",
            "usage": {"used": 18149, "size": 131072},
        },
    }
    assert seen == [
        ("access", user, scope),
        ("busy", "alice"),
        ("execute", "alice", scope, "context"),
    ]


@pytest.mark.anyio
async def test_execute_chat_command_rejects_while_chat_is_busy(monkeypatch):
    async def fake_project_context(_user, _scope):
        return None

    class BusyLifecycle:
        def is_busy(self, _username):
            return True

    monkeypatch.setattr(
        chat_http_routes.chat_access,
        "project_context_for_scope",
        fake_project_context,
    )
    monkeypatch.setattr(chat_http_routes, "chat_worker_lifecycle", BusyLifecycle())

    with pytest.raises(HTTPException) as raised:
        await chat_http_routes.execute_chat_command(
            ChatSlashCommandIn(
                scope=ChatScopePayload(kind="home"),
                command="version",
            ),
            user={"username": "alice"},
        )

    assert raised.value.status_code == 409
    assert "正在执行任务" in raised.value.detail


@pytest.mark.anyio
async def test_append_chat_ui_event_authorizes_project_and_persists_event(monkeypatch):
    seen = []

    async def fake_project_context(user, scope):
        seen.append(("access", user, scope))
        return SimpleNamespace()

    def fake_append_ui_event(username, scope, turn_id, event):
        seen.append(("append", username, scope, turn_id, event))
        return {"type": "selection.changed"}

    monkeypatch.setattr(
        chat_http_routes.chat_access,
        "project_context_for_scope",
        fake_project_context,
    )
    monkeypatch.setattr(
        chat_http_routes.scoped_chat_messages,
        "append_ui_event",
        fake_append_ui_event,
    )
    user = {"username": "alice"}

    result = await chat_http_routes.append_chat_ui_event(
        ChatUiEventIn(
            scope=ChatScopePayload(kind="project", id="project-a"),
            turn_id=" turn-1 ",
            event={"type": "selection.changed"},
        ),
        user=user,
    )

    scope = seen[0][2]
    assert result == {"ok": True, "data": {"type": "selection.changed"}}
    assert seen == [
        ("access", user, scope),
        (
            "append",
            "alice",
            scope,
            "turn-1",
            {"type": "selection.changed"},
        ),
    ]


@pytest.mark.anyio
async def test_append_chat_ui_event_maps_storage_validation_error(monkeypatch):
    def invalid_event(*_args):
        raise ValueError("event type is required")

    monkeypatch.setattr(
        chat_http_routes.scoped_chat_messages,
        "append_ui_event",
        invalid_event,
    )

    with pytest.raises(HTTPException) as raised:
        await chat_http_routes.append_chat_ui_event(
            ChatUiEventIn(
                scope=ChatScopePayload(kind="home"),
                turn_id="turn-1",
                event={},
            ),
            user={"username": "alice"},
        )

    assert raised.value.status_code == 400
    assert raised.value.detail == "event type is required"


@pytest.mark.anyio
async def test_update_chat_message_context_authorizes_scope_and_persists_policy(
    monkeypatch,
    tmp_path,
):
    seen = {}

    async def fake_project_context(user, scope):
        seen["access"] = (user, scope)
        return SimpleNamespace(
            output_dir=tmp_path / "output",
            state_dir=tmp_path / "state",
        )

    def fake_set_context_state(
        username,
        scope,
        message_id,
        state,
        *,
        project_dir,
        project_state_dir,
    ):
        seen["write"] = (
            username,
            scope,
            message_id,
            state,
            project_dir,
            project_state_dir,
        )
        return {"id": 7, "context_state": state}

    monkeypatch.setattr(
        chat_http_routes.chat_access,
        "project_context_for_scope",
        fake_project_context,
    )
    monkeypatch.setattr(
        chat_http_routes.scoped_chat_messages,
        "set_context_state",
        fake_set_context_state,
    )
    user = {"username": "alice"}
    payload = MessageContextUpdateIn(
        scope=ChatScopePayload(kind="project", id="show-1"),
        state="excluded",
    )

    result = await chat_http_routes.update_chat_message_context(
        "assistant-turn-1",
        payload,
        user=user,
    )

    scope = seen["access"][1]
    assert result == {
        "ok": True,
        "data": {"id": 7, "context_state": "excluded"},
    }
    assert seen["write"] == (
        "alice",
        scope,
        "assistant-turn-1",
        "excluded",
        tmp_path / "output",
        tmp_path / "state",
    )
