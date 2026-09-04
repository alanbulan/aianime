"""Creative Canvas vision-model transport."""

from __future__ import annotations

import asyncio
import io
import logging
import math
import threading

from ai_anime.modules.creative_canvas.application.vision_analysis import (
    AnalyzeCreativeCanvasVisionCommand,
    CreativeCanvasVisionInput,
)


# The commercial model relay accepts at most 4 MiB of JSON. Binary image content
# grows by roughly one third when encoded as base64, so keep the complete raw
# image batch below 2.4 MB and leave room for the prompt/envelope.
CREATIVE_CANVAS_VISION_MAX_RAW_IMAGE_BYTES = 2_400_000
CREATIVE_CANVAS_VISION_MAX_SOURCE_BYTES = 64 * 1024 * 1024
CREATIVE_CANVAS_VISION_MAX_SOURCE_PIXELS = 40_000_000
CREATIVE_CANVAS_VISION_MAX_EDGE = 1280

_VISION_IMAGE_COMPACTION_SLOTS = threading.BoundedSemaphore(1)
_VISION_JPEG_PROFILES = (
    (1280, 90),
    (1280, 78),
    (1024, 82),
    (896, 74),
    (768, 68),
    (640, 60),
    (512, 52),
    (384, 44),
    (320, 36),
    (256, 28),
    (192, 22),
    (128, 18),
)
logger = logging.getLogger(__name__)


def _encode_vision_image_with_budget(
    source_input: CreativeCanvasVisionInput,
    *,
    max_bytes: int,
) -> CreativeCanvasVisionInput:
    from PIL import Image, ImageOps

    if len(source_input.data) > CREATIVE_CANVAS_VISION_MAX_SOURCE_BYTES:
        raise ValueError(
            "vision image exceeds source byte limit: "
            f"{len(source_input.data)} > {CREATIVE_CANVAS_VISION_MAX_SOURCE_BYTES}"
        )

    with Image.open(io.BytesIO(source_input.data)) as opened:
        source_width, source_height = opened.size
        if source_width <= 0 or source_height <= 0:
            raise ValueError("vision image dimensions must be positive")
        source_pixels = source_width * source_height
        if source_pixels > CREATIVE_CANVAS_VISION_MAX_SOURCE_PIXELS:
            raise ValueError(
                "vision image exceeds pixel limit: "
                f"{source_pixels} > {CREATIVE_CANVAS_VISION_MAX_SOURCE_PIXELS}"
            )

        oriented = ImageOps.exif_transpose(opened)
        try:
            has_alpha = oriented.mode in {"RGBA", "LA"} or (
                oriented.mode == "P" and "transparency" in oriented.info
            )
            if has_alpha:
                rgba = oriented.convert("RGBA")
                try:
                    image = Image.new("RGB", rgba.size, (255, 255, 255))
                    image.paste(rgba, mask=rgba.getchannel("A"))
                finally:
                    rgba.close()
            elif oriented.mode == "RGB":
                image = oriented.copy()
            else:
                image = oriented.convert("RGB")
        finally:
            if oriented is not opened:
                oriented.close()

    try:
        smallest: bytes | None = None
        source_long_edge = max(image.size)
        for configured_edge, quality in _VISION_JPEG_PROFILES:
            target_edge = min(configured_edge, CREATIVE_CANVAS_VISION_MAX_EDGE)
            if source_long_edge > target_edge:
                scale = target_edge / source_long_edge
                candidate = image.resize(
                    (
                        max(1, int(round(image.width * scale))),
                        max(1, int(round(image.height * scale))),
                    ),
                    Image.Resampling.LANCZOS,
                )
            else:
                candidate = image
            try:
                with io.BytesIO() as buffer:
                    candidate.save(
                        buffer,
                        format="JPEG",
                        quality=quality,
                        optimize=True,
                    )
                    encoded = buffer.getvalue()
            finally:
                if candidate is not image:
                    candidate.close()
            if smallest is None or len(encoded) < len(smallest):
                smallest = encoded
            if len(encoded) <= max_bytes:
                return CreativeCanvasVisionInput(
                    data=encoded,
                    media_type="image/jpeg",
                )
    finally:
        image.close()

    encoded_size = len(smallest or b"")
    raise ValueError(
        "vision image cannot fit request budget: "
        f"{encoded_size} > {max_bytes}"
    )


def _compact_vision_inputs(
    images: tuple[CreativeCanvasVisionInput, ...],
    *,
    max_total_bytes: int,
) -> tuple[CreativeCanvasVisionInput, ...]:
    if max_total_bytes <= 0:
        raise ValueError("max_total_bytes must be positive")
    if not images:
        return ()

    original_bytes = sum(len(image.data) for image in images)
    if original_bytes <= max_total_bytes:
        return images

    per_image_budget = max(1, math.floor(max_total_bytes / len(images)))
    with _VISION_IMAGE_COMPACTION_SLOTS:
        compacted = tuple(
            _encode_vision_image_with_budget(image, max_bytes=per_image_budget)
            for image in images
        )
    compact_bytes = sum(len(image.data) for image in compacted)
    if compact_bytes > max_total_bytes:
        raise ValueError(
            "vision image batch cannot fit request budget: "
            f"{compact_bytes} > {max_total_bytes}"
        )
    logger.info(
        "Creative Canvas vision images compacted: count=%d "
        "original_bytes=%d compact_bytes=%d",
        len(images),
        original_bytes,
        compact_bytes,
    )
    return compacted


async def compact_creative_canvas_vision_inputs(
    images: tuple[CreativeCanvasVisionInput, ...],
    *,
    max_total_bytes: int = CREATIVE_CANVAS_VISION_MAX_RAW_IMAGE_BYTES,
) -> tuple[CreativeCanvasVisionInput, ...]:
    """Keep model-bound image batches inside the relay's JSON body limit."""
    if sum(len(image.data) for image in images) <= max_total_bytes:
        return images
    return await asyncio.to_thread(
        _compact_vision_inputs,
        images,
        max_total_bytes=max_total_bytes,
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

    compacted_images = await compact_creative_canvas_vision_inputs(tuple(images))

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
                for image in compacted_images
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
