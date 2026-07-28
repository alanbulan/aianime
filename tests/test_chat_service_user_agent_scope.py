from types import SimpleNamespace

import pytest

from ai_anime.api.chat_schemas import ChatNotificationIn, ChatScopePayload
from ai_anime.api.routes import chat as chat_routes


@pytest.fixture
def anyio_backend():
    return "asyncio"


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
        chat_routes.chat_access,
        "project_context_for_scope",
        fake_project_context,
    )
    monkeypatch.setattr(
        chat_routes.scoped_chat_messages,
        "append_notification",
        fake_append_notification,
    )

    result = await chat_routes.append_chat_notification(
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
