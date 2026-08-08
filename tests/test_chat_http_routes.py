from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from ai_anime.api.routes.ai_assistant.schemas import (
    ChatNotificationIn,
    ChatScopePayload,
    ChatUiEventIn,
)
from ai_anime.api.routes.ai_assistant import http as chat_http_routes


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.anyio
async def test_cancel_chat_turn_delegates_to_worker_lifecycle(monkeypatch):
    seen = []

    class StubChatWorkerLifecycle:
        async def cancel(self, username):
            seen.append(username)
            return True

    monkeypatch.setattr(
        chat_http_routes,
        "chat_worker_lifecycle",
        StubChatWorkerLifecycle(),
    )

    result = await chat_http_routes.cancel_chat_turn(user={"username": "alice"})

    assert result == {"ok": True, "data": {"cancelled": True}}
    assert seen == ["alice"]


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
