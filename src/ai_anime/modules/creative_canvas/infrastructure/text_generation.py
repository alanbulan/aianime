"""PydanticAI adapters for Creative Canvas text generation."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field
from pydantic_ai import Agent

from ai_anime.modules.creative_canvas.domain.text_generation import (
    CREATIVE_CANVAS_STORY_SCRIPT_SYSTEM_PROMPT,
    CREATIVE_CANVAS_TRANSLATION_MODEL,
    CREATIVE_CANVAS_TRANSLATION_SYSTEM_PROMPT,
    CreativeCanvasTextNodeType,
    build_creative_canvas_story_script_task,
    build_creative_canvas_translation_task,
    resolve_creative_canvas_story_script_model,
)

_translation_agent: Agent | None = None
_story_script_agent: Agent | None = None


class _CreativeCanvasTranslationResult(BaseModel):
    translated_text: str = Field(description="Translated prompt text.")
    source_language: Literal["zh", "en"] = Field(
        description="Dominant natural language detected from the source text."
    )
    target_language: Literal["zh", "en"] = Field(
        description="Opposite target language used for translation."
    )


class _CreativeCanvasStoryScriptRow(BaseModel):
    shot_no: int = Field(description="镜号")
    duration: int = Field(description="时长，单位秒")
    visual_description: str = Field(description="画面描述")
    character_1: str = Field(default="", description="角色1")
    character_description_1: str = Field(default="", description="角色描述1")
    character_image_1: str = Field(default="", description="角色图1，占位字段")
    reference: str = Field(default="", description="参考")
    shot: str = Field(default="", description="景别")
    character_action: str = Field(default="", description="角色动作")
    emotion: str = Field(default="", description="情绪")
    scene_tags: str = Field(default="", description="场景标签")
    lighting_mood: str = Field(default="", description="光影氛围")
    sound: str = Field(default="", description="音效")
    dialogue: str = Field(default="", description="对白")
    shot_prompt: str = Field(default="", description="分镜提示词")
    video_motion_prompt: str = Field(default="", description="视频运动提示词")


class _CreativeCanvasStoryScriptResult(BaseModel):
    title: str = Field(default="", description="故事脚本标题")
    rows: list[_CreativeCanvasStoryScriptRow] = Field(
        default_factory=list,
        description="结构化故事脚本行",
    )


def _create_translation_agent() -> Agent:
    from ai_anime.config import get_newapi_text_pydantic_model

    model = get_newapi_text_pydantic_model(
        "FREEZONE_TRANSLATION_MODEL",
        CREATIVE_CANVAS_TRANSLATION_MODEL,
    )
    return Agent(
        model,
        system_prompt=CREATIVE_CANVAS_TRANSLATION_SYSTEM_PROMPT,
        output_type=_CreativeCanvasTranslationResult,
        name="Freezone Prompt Translator",
    )


def _get_translation_agent() -> Agent:
    global _translation_agent
    if _translation_agent is None:
        _translation_agent = _create_translation_agent()
    return _translation_agent


def _create_story_script_agent(model: str | None = None) -> Agent:
    from ai_anime.config import get_newapi_text_pydantic_model

    resolved = resolve_creative_canvas_story_script_model(model)
    llm_model = get_newapi_text_pydantic_model(
        "FREEZONE_STORY_SCRIPT_MODEL",
        resolved["model"],
    )
    return Agent(
        llm_model,
        system_prompt=CREATIVE_CANVAS_STORY_SCRIPT_SYSTEM_PROMPT,
        output_type=_CreativeCanvasStoryScriptResult,
        # 多字段结构化脚本偶尔需要多轮校验反馈才能修正字段类型。
        output_retries=3,
        name="Freezone Story Script Generator",
    )


def _get_story_script_agent(model: str | None = None) -> Agent:
    global _story_script_agent
    resolved = resolve_creative_canvas_story_script_model(model)
    if _story_script_agent is None:
        _story_script_agent = _create_story_script_agent(resolved["id"])
    return _story_script_agent


async def translate_creative_canvas_text(
    *,
    text: str,
    node_type: CreativeCanvasTextNodeType = "generic",
) -> tuple[str, Literal["zh", "en"], Literal["zh", "en"]]:
    if not text or not text.strip():
        return "", "zh", "en"

    task = build_creative_canvas_translation_task(
        text=text,
        node_type=node_type,
    )
    response = await _get_translation_agent().run(task)
    result = response.output
    target_language: Literal["zh", "en"] = result.target_language
    if target_language == result.source_language:
        target_language = "zh" if result.source_language == "en" else "en"
    return (
        result.translated_text.strip(),
        result.source_language,
        target_language,
    )


async def generate_creative_canvas_story_script(
    *,
    source_text: str,
    prompt: str = "",
    model: str | None = None,
) -> dict[str, Any]:
    if not source_text or not source_text.strip():
        raise ValueError("source_text is required")

    task = build_creative_canvas_story_script_task(
        source_text=source_text,
        prompt=prompt,
    )
    response = await _get_story_script_agent(model).run(task)
    return response.output.model_dump()
