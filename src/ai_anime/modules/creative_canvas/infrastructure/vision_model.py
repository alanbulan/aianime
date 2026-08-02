"""Creative Canvas vision-model transport."""

from __future__ import annotations

from ai_anime.modules.creative_canvas.application.vision_analysis import (
    AnalyzeCreativeCanvasVisionCommand,
    CreativeCanvasVisionInput,
)
from ai_anime.official_defaults import DEFAULT_FREEZONE_VISION_MODEL


def resolve_creative_canvas_vision_model(
    model_override: str | None = None,
) -> str:
    """Return the logical model configured for Creative Canvas vision tasks."""
    clean_override = str(model_override or "").strip()
    if clean_override:
        return clean_override

    from ai_anime.config import get_newapi_text_model_name

    return get_newapi_text_model_name(
        "FREEZONE_VISION_MODEL",
        DEFAULT_FREEZONE_VISION_MODEL,
    )


async def call_creative_canvas_vision_model(
    *,
    prompt: str,
    images: list[CreativeCanvasVisionInput],
    model_override: str | None = None,
    timeout_seconds: float = 120.0,
) -> tuple[str, str]:
    """Run one vision task through the selected cloud or BYOK text model."""
    if not images:
        raise ValueError("at least one image is required")

    from pydantic_ai import Agent, BinaryContent

    from ai_anime.config import get_newapi_text_pydantic_model
    from ai_anime.model_access_policy import (
        resolve_internal_model_for_role,
        resolve_model_for_role,
    )

    logical_model = resolve_creative_canvas_vision_model(model_override)
    model = (
        resolve_model_for_role(logical_model, "TEXT")
        if str(model_override or "").strip()
        else resolve_internal_model_for_role(logical_model, "TEXT")
    )
    agent = Agent(
        get_newapi_text_pydantic_model(
            "FREEZONE_VISION_MODEL",
            DEFAULT_FREEZONE_VISION_MODEL,
            model_name_override=model,
            timeout_seconds_override=timeout_seconds,
        ),
        output_type=str,
        name="Creative Canvas Vision Analyzer",
    )
    result = await agent.run(
        [
            prompt,
            *[
                BinaryContent(data=image.data, media_type=image.media_type)
                for image in images
            ],
        ]
    )
    text = str(result.output or "").strip()
    if not text:
        raise RuntimeError("视觉模型返回空内容")
    return model, text


class PydanticAICreativeCanvasVisionAnalyzer:
    async def analyze(
        self,
        command: AnalyzeCreativeCanvasVisionCommand,
    ) -> tuple[str, str]:
        return await call_creative_canvas_vision_model(
            prompt=command.prompt,
            images=list(command.images),
            model_override=command.model_override,
            timeout_seconds=command.timeout_seconds,
        )
