"""PydanticAI adapters for Creative Canvas text generation."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field
from pydantic_ai import Agent

from ai_anime.modules.creative_canvas.domain.text_generation import (
    CREATIVE_CANVAS_STORY_SCRIPT_SYSTEM_PROMPT,
    CREATIVE_CANVAS_TRANSLATION_SYSTEM_PROMPT,
    CreativeCanvasTextNodeType,
    build_creative_canvas_story_script_task,
    build_creative_canvas_character_story_script_task,
    build_creative_canvas_translation_task,
    build_creative_canvas_video_story_script_task,
)


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
    character_2: str = Field(default="", description="角色2")
    character_description_2: str = Field(default="", description="角色描述2")
    character_image_2: str = Field(default="", description="角色图2，占位字段")
    reference: str = Field(default="", description="参考")
    keyframe_index: int = Field(default=0, description="对应输入关键帧序号")
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


def _create_translation_agent(model: str, model_selector: str | None) -> Agent:
    from ai_anime.modules.model_usage.public import (
        get_structured_output_model_settings,
        get_text_pydantic_model,
    )

    transport_model = get_text_pydantic_model(
        model_name_override=model,
        model_selector=model_selector,
    )
    return Agent(
        transport_model,
        system_prompt=CREATIVE_CANVAS_TRANSLATION_SYSTEM_PROMPT,
        model_settings=get_structured_output_model_settings(),
        output_type=_CreativeCanvasTranslationResult,
        retries={"output": 1},
        name="Freezone Prompt Translator",
    )


async def _run_agent_with_readable_json_errors(
    agent: Agent,
    task: str,
    *,
    label: str,
):
    try:
        return await agent.run(task)
    except Exception as exc:
        message = str(exc)
        if (
            "Unterminated string" in message
            or "Expecting value" in message
            or "Extra data" in message
        ):
            raise RuntimeError(
                f"{label}模型响应不完整（返回内容被截断，无法解析为 JSON），"
                "请检查云端模型网关或稍后重试"
            ) from exc
        raise

def _create_story_script_agent(model: str, model_selector: str | None) -> Agent:
    from ai_anime.modules.model_usage.public import (
        get_structured_output_model_settings,
        get_text_pydantic_model,
    )

    llm_model = get_text_pydantic_model(
        timeout_seconds_override=300.0,
        model_name_override=model,
        model_selector=model_selector,
    )
    return Agent(
        llm_model,
        system_prompt=CREATIVE_CANVAS_STORY_SCRIPT_SYSTEM_PROMPT,
        model_settings=get_structured_output_model_settings(),
        output_type=_CreativeCanvasStoryScriptResult,
        # 多字段结构化脚本偶尔需要多轮校验反馈才能修正字段类型。
        retries={"output": 3},
        name="Freezone Story Script Generator",
    )

async def translate_creative_canvas_text(
    *,
    text: str,
    model: str,
    model_selector: str | None = None,
    node_type: CreativeCanvasTextNodeType = "generic",
) -> tuple[str, Literal["zh", "en"], Literal["zh", "en"]]:
    if not text or not text.strip():
        return "", "zh", "en"

    task = build_creative_canvas_translation_task(
        text=text,
        node_type=node_type,
    )
    response = await _run_agent_with_readable_json_errors(
        _create_translation_agent(model, model_selector),
        task,
        label="翻译",
    )
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
    model: str,
    model_selector: str | None = None,
    character_refs: Sequence[Mapping[str, Any]] | None = None,
) -> dict[str, Any]:
    if not source_text or not source_text.strip():
        raise ValueError("source_text is required")

    task = build_creative_canvas_story_script_task(
        source_text=source_text,
        prompt=prompt,
    )
    response = await _run_agent_with_readable_json_errors(
        _create_story_script_agent(model, model_selector),
        task,
        label="故事脚本",
    )
    payload = response.output.model_dump()
    return bind_story_script_assets(payload, character_refs=character_refs)


async def generate_creative_canvas_story_script_with_vision(
    *,
    frame_paths: Sequence[str | Path] = (),
    character_image_paths: Sequence[str | Path] = (),
    source_text: str = "",
    prompt: str = "",
    duration_sec: float | None = None,
    character_refs: Sequence[Mapping[str, Any]] | None = None,
    model: str,
    model_selector: str | None = None,
) -> dict[str, Any]:
    from pydantic_ai import BinaryContent

    from ai_anime.modules.creative_canvas.application.vision_analysis import (
        creative_canvas_image_media_type,
    )

    frames = [Path(path) for path in frame_paths if Path(path).exists()]
    character_images = [
        Path(path) for path in character_image_paths if Path(path).exists()
    ]
    if not frames and not character_images:
        raise ValueError("vision story script requires at least one image")
    task = (
        build_creative_canvas_video_story_script_task(
            frame_count=len(frames),
            prompt=prompt,
            duration_sec=duration_sec,
            character_refs=character_refs,
        )
        if frames
        else build_creative_canvas_character_story_script_task(
            image_count=len(character_images),
            prompt=prompt,
            source_text=source_text,
            character_refs=character_refs,
        )
    )
    attachments = [
        BinaryContent(
            data=path.read_bytes(),
            media_type=creative_canvas_image_media_type(str(path)),
        )
        for path in (*frames, *character_images)
    ]
    response = await _run_agent_with_readable_json_errors(
        _create_story_script_agent(model, model_selector),
        [task, *attachments],
        label="视觉故事脚本",
    )
    return response.output.model_dump()


def bind_story_script_assets(
    payload: dict[str, Any],
    *,
    frame_urls: Sequence[str] = (),
    character_refs: Sequence[Mapping[str, Any]] | None = None,
) -> dict[str, Any]:
    frames = [url for url in frame_urls if url]
    by_name = {
        str(reference.get("name") or "").strip().casefold(): str(
            reference.get("image_url") or ""
        ).strip()
        for reference in character_refs or ()
        if str(reference.get("name") or "").strip()
        and str(reference.get("image_url") or "").strip()
    }
    ordered_images = [
        str(reference.get("image_url") or "").strip()
        for reference in character_refs or ()
        if str(reference.get("image_url") or "").strip()
    ]

    def match_character(name: object) -> str:
        folded = str(name or "").strip().casefold()
        if not folded:
            return ""
        if folded in by_name:
            return by_name[folded]
        for candidate, url in by_name.items():
            if candidate in folded or folded in candidate:
                return url
        return ""

    rows = payload.get("rows")
    if not isinstance(rows, list):
        return payload
    for index, raw_row in enumerate(rows):
        if not isinstance(raw_row, dict):
            continue
        try:
            keyframe_index = int(raw_row.get("keyframe_index") or 0)
        except (TypeError, ValueError):
            keyframe_index = 0
        if not 1 <= keyframe_index <= len(frames):
            keyframe_index = index + 1 if index < len(frames) else 0
        raw_row["keyframe_index"] = keyframe_index
        raw_row["reference"] = frames[keyframe_index - 1] if keyframe_index else ""
        raw_row["character_image_1"] = match_character(raw_row.get("character_1"))
        raw_row["character_image_2"] = match_character(raw_row.get("character_2"))
        if not raw_row["character_image_1"] and len(ordered_images) == 1:
            raw_row["character_image_1"] = ordered_images[0]
    if frames:
        payload["frame_urls"] = frames
    return payload
