import pytest

from ai_anime.modules.ai_assistant.application import AgentPromptContext
from ai_anime.modules.ai_assistant.composition import get_agent_prompt_context
from ai_anime.modules.ai_assistant.domain import (
    compose_agent_prompt,
    is_slash_command,
)
from ai_anime.modules.ai_assistant.infrastructure import FileUserPreferences
from ai_anime.modules.ai_assistant.public import build_agent_prompt_context


class StubUserPreferences:
    def __init__(self, value: str) -> None:
        self.value = value
        self.loaded_usernames: list[str] = []

    def load(self, username: str) -> str:
        self.loaded_usernames.append(username)
        return self.value


def test_agent_prompt_context_composition_returns_one_process_instance():
    assert get_agent_prompt_context() is get_agent_prompt_context()


def test_file_user_preferences_creates_default_file(monkeypatch, tmp_path):
    state_root = tmp_path / "state"
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(state_root))

    preferences = FileUserPreferences().load("admin")

    path = state_root / "admin" / "preferences.md"
    expected = (
        "# User Preferences\n\n"
        "Record stable cross-project preferences here, such as visual taste, "
        "brand/style defaults, pacing habits, and recurring workflow choices.\n"
    )
    assert path.read_text(encoding="utf-8") == expected
    assert preferences == expected.strip()


def test_file_user_preferences_reads_existing_trimmed_content(monkeypatch, tmp_path):
    state_root = tmp_path / "state"
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(state_root))
    path = state_root / "admin" / "preferences.md"
    path.parent.mkdir(parents=True)
    path.write_text(
        "\n  Keep scene colors vivid.\nUse concise beats.  \n\n",
        encoding="utf-8",
    )

    preferences = FileUserPreferences().load("admin")

    assert preferences == "Keep scene colors vivid.\nUse concise beats."


@pytest.mark.parametrize(
    ("project", "expected_scope"),
    [("project-a", "project:project-a"), ("", "home")],
)
def test_compose_agent_prompt_sets_scope(project, expected_scope):
    prompt = compose_agent_prompt(
        username="admin",
        project=project,
        prompt="Continue the current task.",
        preferences="Prefer concise replies.",
    )

    assert prompt.startswith(
        f"[AI_ANIME_USER_CONTEXT]\nusername: admin\nscope: {expected_scope}\n"
    )
    assert "[USER_PREFERENCES]\nPrefer concise replies." in prompt
    assert prompt.endswith("[USER_MESSAGE]\nContinue the current task.")


def test_agent_prompt_context_loads_preferences_for_user():
    preferences = StubUserPreferences("Prefer cinematic lighting.")

    prompt = AgentPromptContext(preferences).build("admin", "project-a", "Continue")

    assert preferences.loaded_usernames == ["admin"]
    assert "[USER_PREFERENCES]\nPrefer cinematic lighting." in prompt


def test_prompt_keeps_pinned_content_and_omits_excluded_context():
    prompt = compose_agent_prompt(
        username="admin",
        project="project-a",
        prompt="继续",
        preferences="",
        rebuild_context=True,
        current_turn_id="turn-current",
        context_messages=[
            {
                "id": 1,
                "role": "user",
                "content": "普通历史",
                "context_state": "normal",
                "turn_id": "turn-old",
            },
            {
                "id": 2,
                "role": "assistant",
                "content": "固定原文：不要压缩这句话。",
                "context_state": "pinned",
                "turn_id": "turn-pinned",
            },
            {
                "id": 3,
                "role": "user",
                "content": "绝不能进入模型的内容",
                "context_state": "excluded",
                "turn_id": "turn-excluded",
            },
            {
                "id": 4,
                "role": "user",
                "content": "当前消息不应重复注入",
                "context_state": "normal",
                "turn_id": "turn-current",
            },
        ],
    )

    assert "[AI_ANIME_PINNED_CONTEXT]" in prompt
    assert "固定原文：不要压缩这句话。" in prompt
    assert "[AI_ANIME_REBUILT_CONTEXT]" in prompt
    assert "普通历史" in prompt
    assert "绝不能进入模型的内容" not in prompt
    assert "当前消息不应重复注入" not in prompt


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("/help", True),
        (" /model provider/model ", True),
        ("请执行 /help", False),
        ("/", False),
    ],
)
def test_is_slash_command(text, expected):
    assert is_slash_command(text) is expected


def test_prompt_injects_json_render_contract(monkeypatch, tmp_path):
    monkeypatch.setenv("AI_ANIME_STATE_DIR", str(tmp_path / "state"))

    prompt = build_agent_prompt_context(
        "admin",
        "project-a",
        "查看肖像图片，用 json-render 显示",
    )

    assert "[RENDERING_CONTRACT]" in prompt
    assert "才需要调用对应的 AI anime 展示工具" in prompt
    assert "不要向用户解释内部渲染格式、渲染机制、工具调用过程或工具名" in prompt
    assert "不要用文字列表、文件名列表、Beat 名称列表或 URL 列表替代媒体展示" in prompt
    assert "必须调用对应展示工具" in prompt
    assert "若没有工具返回的可展示媒体，只说明当前暂无可展示媒体" in prompt
    assert "后端会自动把工具结果渲染为 json-render" not in prompt
    assert "不要手写、复制或粘贴 <ui-spec> JSON" not in prompt
    assert "ai_anime_get_character_media" in prompt
    assert "ai_anime_get_sketches" in prompt
    assert "ai_anime_get_scene_images" in prompt
    assert "ai_anime_get_episode_media" in prompt
    assert (
        "只有在回复需要展示图片、肖像、身份图、草图、首帧、视频、音频等可视/可播放媒体时"
        in prompt
    )
    assert "media_json" in prompt
    assert "不要猜测、拼接或改写静态资源路径" in prompt
    assert "禁止自行编造 /static/projects/{project_id}/..." in prompt
    assert "portrait_url" in prompt
    assert "image_url" in prompt
    assert "video_url" in prompt
    assert "不要使用 *_path" in prompt
    assert "发送前自检" in prompt
    assert (
        "角色列表、剧集规划、项目进度、任务状态、脚本/beat 摘要、表格、长篇正文、普通结构化说明默认使用 markdown"
        in prompt
    )
    assert "不要为纯文本、进度、脚本、表格、角色/剧集清单调用媒体展示工具" in prompt
    assert prompt.rstrip().endswith("查看肖像图片，用 json-render 显示")
