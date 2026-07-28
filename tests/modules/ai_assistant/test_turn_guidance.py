import pytest

from ai_anime.modules.ai_assistant.domain import (
    reingest_confirmation_reply,
    script_creation_guidance_prompt,
)


def test_reingest_confirmation_reply_requires_confirmation_block():
    assert reingest_confirmation_reply("普通聊天消息") is None


def test_reingest_confirmation_reply_requests_overwrite_choice():
    prompt = """创建视频

[AI_ANIME_REINGEST_CONFIRMATION]
stage: choose_overwrite
ai_anime_project_id: project-a
filename: novel.docx
[/AI_ANIME_REINGEST_CONFIRMATION]"""

    assert reingest_confirmation_reply(prompt) == (
        "当前项目已有摄入内容，继续会覆盖现有项目。是否要覆盖当前项目？\n\n"
        "请回复 `覆盖` 进入下一步确认。"
    )


def test_reingest_confirmation_reply_requires_final_clear_confirmation():
    prompt = """覆盖

[AI_ANIME_REINGEST_CONFIRMATION]
stage: confirm_clear
ai_anime_project_id: project-a
filename: novel.docx
[/AI_ANIME_REINGEST_CONFIRMATION]"""

    assert reingest_confirmation_reply(prompt) == (
        "覆盖会清空/重建当前项目已有角色、分集、脚本、草图、音频、视频等"
        "流水线结果。是否继续？\n\n请回复 `确定` 或 `继续` 后才会开始覆盖。"
    )


@pytest.mark.parametrize(
    "prompt",
    [
        "",
        "帮我写剧本\n[AI_ANIME_INGEST_AUTOMATION]",
        "帮我写剧本\n[AI_ANIME_UPLOADED_FILES]",
        "帮我写剧本\n[CHAT_ATTACHMENTS]\n1. novel.docx\n[/CHAT_ATTACHMENTS]",
        "继续生成短剧",
        "查看当前任务状态",
    ],
)
def test_script_creation_guidance_skips_existing_pipeline_context(prompt):
    assert script_creation_guidance_prompt(prompt) is None


@pytest.mark.parametrize(
    "user_prompt",
    ["帮我写一个复仇短剧", "赛博朋克风格短剧"],
)
def test_script_creation_guidance_redirects_new_script_requests(user_prompt):
    prompt = script_creation_guidance_prompt(f"  {user_prompt}  ")

    assert prompt is not None
    assert prompt.startswith("[AI_ANIME_SCRIPT_UPLOAD_GUIDANCE]\n")
    assert "AI anime 助手不提供生成剧本功能" in prompt
    assert "引导用户去“素材导入”上传已有剧本文档" in prompt
    assert "不要调用任何工具" in prompt
    assert prompt.endswith(
        f"[/AI_ANIME_SCRIPT_UPLOAD_GUIDANCE]\n\n\n用户原话：{user_prompt}"
    )
