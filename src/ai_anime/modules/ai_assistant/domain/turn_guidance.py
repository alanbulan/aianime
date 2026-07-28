"""Pure guidance rules for an assistant turn."""

from __future__ import annotations

import re

_REINGEST_CONFIRMATION_BLOCK_RE = re.compile(
    r"\[AI_ANIME_REINGEST_CONFIRMATION\](.*?)\[/AI_ANIME_REINGEST_CONFIRMATION\]",
    re.DOTALL,
)
_CHAT_ATTACHMENTS_BLOCK_RE = re.compile(
    r"\[CHAT_ATTACHMENTS\].*?\[/CHAT_ATTACHMENTS\]",
    re.DOTALL,
)
_AI_ANIME_INGEST_AUTOMATION_RE = re.compile(
    r"\[AI_ANIME_(?:INGEST_AUTOMATION|REINGEST_CONFIRMATION|UPLOADED_FILES)\]",
)
_SCRIPT_CREATION_REQUEST_RE = re.compile(
    r"(?:帮我|给我|请|想要|我要|创建|生成|写|做|制作|创作|起草|来一个|出一个)"
    r"[\s\S]{0,40}(?:剧本|短剧|短片剧本|短视频剧本|网剧)",
    re.IGNORECASE,
)
_STYLE_SHORT_DRAMA_REQUEST_RE = re.compile(
    r"(?:[\w\u4e00-\u9fff]+风格|主题|题材|赛博朋克|末世|复仇|女总裁|玄幻|都市|悬疑)"
    r"[\s\S]{0,30}(?:短剧|短片剧本|短视频剧本|网剧)",
    re.IGNORECASE,
)
_CONTINUE_PIPELINE_RE = re.compile(
    r"(?:继续|恢复|接着|下一步|当前|已有|已上传|刚才上传)"
)
_SCRIPT_UPLOAD_GUIDANCE = """[AI_ANIME_SCRIPT_UPLOAD_GUIDANCE]
用户正在请求创建、生成或编写剧本/短剧，但当前消息没有上传剧本文档。

你必须只用自然中文回复用户，不要调用任何工具，不要创建项目，不要生成剧本，不要构造基础脚本，不要启动摄入或流水线。

回复目标：
- 语气自然，不要像系统错误提示。
- 明确表达：AI anime 助手不提供生成剧本功能。
- 引导用户去“素材导入”上传已有剧本文档。
- 说明上传后你可以继续帮他推进分集、画面、配音、成片等后续制作。
- 只回复 1-2 句，不要列步骤，不要输出 markdown 标题。
[/AI_ANIME_SCRIPT_UPLOAD_GUIDANCE]
"""


def reingest_confirmation_reply(prompt: str) -> str | None:
    confirmation = _REINGEST_CONFIRMATION_BLOCK_RE.search(prompt)
    if not confirmation:
        return None
    body = confirmation.group(1)
    if re.search(r"(?m)^\s*stage:\s*confirm_clear\s*$", body):
        return (
            "覆盖会清空/重建当前项目已有角色、分集、脚本、草图、音频、视频等"
            "流水线结果。是否继续？\n\n请回复 `确定` 或 `继续` 后才会开始覆盖。"
        )
    return (
        "当前项目已有摄入内容，继续会覆盖现有项目。是否要覆盖当前项目？\n\n"
        "请回复 `覆盖` 进入下一步确认。"
    )


def script_creation_guidance_prompt(prompt: str) -> str | None:
    if not prompt:
        return None
    if _AI_ANIME_INGEST_AUTOMATION_RE.search(prompt):
        return None
    if _CHAT_ATTACHMENTS_BLOCK_RE.search(prompt):
        return None

    text = _CHAT_ATTACHMENTS_BLOCK_RE.sub("", prompt).strip()
    if _CONTINUE_PIPELINE_RE.search(text):
        return None
    if _SCRIPT_CREATION_REQUEST_RE.search(text) or _STYLE_SHORT_DRAMA_REQUEST_RE.search(
        text
    ):
        return f"{_SCRIPT_UPLOAD_GUIDANCE}\n\n用户原话：{text}"
    return None
