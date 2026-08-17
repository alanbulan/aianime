from ai_anime.modules.ai_assistant.application import ConversationTitles
from ai_anime.modules.ai_assistant.application.conversation_titles import (
    normalize_conversation_title,
)
from ai_anime.modules.ai_assistant.infrastructure import SQLiteChatHistory
from ai_anime.modules.ai_assistant.public import ChatScope


class RecordingTitleGenerator:
    def __init__(self, title: str) -> None:
        self.title = title
        self.calls: list[str] = []

    async def generate(self, first_user_message: str) -> str:
        self.calls.append(first_user_message)
        return self.title


def test_normalize_conversation_title_removes_model_formatting():
    assert normalize_conversation_title("标题：**第一集角色配置。**\n解释") == "第一集角色配置。"


async def test_conversation_title_is_generated_only_once(monkeypatch, tmp_path):
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(tmp_path / "state"))
    history = SQLiteChatHistory()
    generator = RecordingTitleGenerator("会话标题：第一集自动编排")
    titles = ConversationTitles(history, generator)
    scope = ChatScope(kind="project", id="show-1", conversation_id="chat_2")

    first = await titles.ensure("alice", scope, "请自动编排第一集")
    second = await titles.ensure("alice", scope, "这一条不应再次生成")

    assert first == "第一集自动编排"
    assert second == "第一集自动编排"
    assert generator.calls == ["请自动编排第一集"]
