import pytest

from ai_anime.modules.ai_assistant.application import DeterministicProjectReplies
from ai_anime.modules.ai_assistant.public import get_project_chat_messages


@pytest.mark.anyio
async def test_deterministic_project_reply_redacts_local_paths(monkeypatch, tmp_path):
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(tmp_path / "state"))
    monkeypatch.setenv("AI_ANIME_OUTPUT_DIR", str(tmp_path / "output"))
    events = []

    async def on_event(event):
        events.append(event)

    replies = DeterministicProjectReplies(get_project_chat_messages())
    message = await replies.stream(
        "admin",
        "project-a",
        "临时路径：~/Works/ai-anime-fe/src",
        on_event,
    )

    assert "~/Works/ai-anime-fe" not in message["content"]
    assert message["content"] == "临时路径：[本地路径]"
    assert events[0] == {
        "type": "assistant_delta",
        "text": "临时路径：[本地路径]",
    }
    assert events[1] == {"type": "done", "message": message}
