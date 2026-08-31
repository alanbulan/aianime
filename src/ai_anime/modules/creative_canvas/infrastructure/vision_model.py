"""Creative Canvas vision-model transport."""

from __future__ import annotations

from ai_anime.modules.creative_canvas.application.vision_analysis import (
    AnalyzeCreativeCanvasVisionCommand,
    CreativeCanvasVisionInput,
)
async def call_creative_canvas_vision_model(
    *,
    prompt: str,
    images: list[CreativeCanvasVisionInput],
    timeout_seconds: float = 120.0,
) -> tuple[str, str]:
    """Run one vision task through the selected cloud or BYOK text model."""
    if not images:
        raise ValueError("at least one image is required")

    from pydantic_ai import Agent, BinaryContent

    from ai_anime.modules.model_usage.public import get_text_pydantic_model
    from ai_anime.modules.model_usage.public import resolve_model_for_role

    model = resolve_model_for_role("TEXT")
    agent = Agent(
        get_text_pydantic_model(
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
            timeout_seconds=command.timeout_seconds,
        )
