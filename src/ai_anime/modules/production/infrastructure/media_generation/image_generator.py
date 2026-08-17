"""Commercial image generation over the cloud/BYOK model-access transport."""

from __future__ import annotations

import base64
import time
from pathlib import Path
from typing import Any, Optional

from pydantic import BaseModel

from ai_anime.modules.production.infrastructure.media_generation_settings import (
    IMAGE_DEFAULT_HEIGHT,
    IMAGE_DEFAULT_STYLE,
    IMAGE_DEFAULT_WIDTH,
    apply_style_reference,
    get_style_preset,
)
from ai_anime.modules.model_usage.public import is_insufficient_credits_error


class ImageGenResult(BaseModel):
    """Normalized image-generation result."""

    success: bool
    image_path: Optional[str] = None
    image_base64: Optional[str] = None
    error: Optional[str] = None
    generation_time: float = 0.0


def _mime_type(path: str) -> str:
    suffix = Path(path).suffix.lower()
    if suffix == ".png":
        return "image/png"
    if suffix == ".webp":
        return "image/webp"
    return "image/jpeg"


def _aspect_ratio(width: int, height: int) -> str:
    safe_width = max(1, int(width))
    safe_height = max(1, int(height))
    return f"{safe_width}:{safe_height}"


async def _generate_commercial_image(
    *,
    model: str,
    prompt: str,
    reference_images: list[tuple[bytes, str] | tuple[str, bytes, str]] | None,
    aspect_ratio: str,
) -> tuple[bytes | None, str]:
    from ai_anime.modules.production.infrastructure.media_generation.nanobanana_grid import (
        _call_newapi_image_api,
    )

    image_bytes, _text, error = await _call_newapi_image_api(
        prompt=prompt,
        reference_images=reference_images,
        image_config={"aspect_ratio": aspect_ratio, "image_size": "1K"},
    )
    return image_bytes, error


class CommercialImageGenerator:
    """Small compatibility adapter over the single commercial image protocol."""

    def __init__(self, model: str | None = None) -> None:
        self.model = str(model or "").strip()
        if not self.model:
            raise ValueError("image model is required")
        self.default_width = IMAGE_DEFAULT_WIDTH
        self.default_height = IMAGE_DEFAULT_HEIGHT
        self.default_style = IMAGE_DEFAULT_STYLE

    async def generate(
        self,
        prompt: str,
        output_path: Optional[str] = None,
        negative_prompt: str = "",
        width: Optional[int] = None,
        height: Optional[int] = None,
        style: Optional[str] = None,
        project_dir: str = "",
        reference_image: Optional[str] = None,
        reference_strength: float = 0.7,
    ) -> ImageGenResult:
        del reference_strength
        started_at = time.time()
        resolved_width = width or self.default_width
        resolved_height = height or self.default_height
        style_preset = get_style_preset(
            style or self.default_style,
            project_dir=project_dir,
        )
        prompt_parts = [
            str(style_preset.get("style_instructions") or "").strip(),
            str(prompt or "").strip(),
        ]
        avoid = ", ".join(
            part
            for part in (
                str(style_preset.get("avoid_instructions") or "").strip(),
                str(negative_prompt or "").strip(),
            )
            if part
        )
        if avoid:
            prompt_parts.append(f"Avoid: {avoid}")
        resolved_prompt = ", ".join(part for part in prompt_parts if part)

        references: list[tuple[bytes, str] | tuple[str, bytes, str]] = []
        if reference_image and Path(reference_image).is_file():
            references.append((Path(reference_image).read_bytes(), _mime_type(reference_image)))
        resolved_prompt, references = apply_style_reference(
            resolved_prompt,
            references,
            style_preset,
        )

        try:
            image_bytes, error = await _generate_commercial_image(
                model=self.model,
                prompt=resolved_prompt,
                reference_images=references or None,
                aspect_ratio=_aspect_ratio(resolved_width, resolved_height),
            )
            if image_bytes is None:
                return ImageGenResult(
                    success=False,
                    error=error or "Image model returned no image data",
                    generation_time=time.time() - started_at,
                )
            if output_path:
                target = Path(output_path)
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(image_bytes)
            return ImageGenResult(
                success=True,
                image_path=output_path,
                image_base64=base64.b64encode(image_bytes).decode("ascii"),
                generation_time=time.time() - started_at,
            )
        except Exception as exc:
            if is_insufficient_credits_error(exc):
                raise
            return ImageGenResult(
                success=False,
                error=str(exc),
                generation_time=time.time() - started_at,
            )


def create_image_generator(*, model: str | None = None):
    """Create the production adapter."""
    return CommercialImageGenerator(model)


async def generate_character_reference_unified(
    character_name: str,
    appearance_prompt: str,
    output_dir: str,
    character_tag: str = "",
    count: int = 3,
    style: str | None = None,
    ethnicity: str = "Chinese",
    prompt_only: bool = False,
    model: str | None = None,
    project_dir: str = "",
    usage_task_type: str = "character_portrait",
    usage_scope: str = "",
    identity_name: str = "",
    raise_on_error: bool = False,
) -> list[str]:
    """Generate character references through the selected platform model SKU."""
    resolved_model = str(model or "").strip()
    if not resolved_model:
        if raise_on_error:
            raise RuntimeError("character image model is required")
        return []

    try:
        from ai_anime.modules.production.infrastructure.media_generation.nanobanana_character import (
            NanoBananaCharacterGenerator,
        )

        result = await NanoBananaCharacterGenerator(
            model=resolved_model
        ).generate_character_portrait(
            character_name=character_name,
            character_prompt=appearance_prompt,
            character_tag=character_tag,
            output_dir=output_dir,
            style=style,
            ethnicity=ethnicity,
            prompt_only=prompt_only,
            project_dir=project_dir,
            usage_task_type=usage_task_type,
            usage_scope=usage_scope,
            identity_name=identity_name,
        )
    except (ImportError, ValueError) as exc:
        if raise_on_error:
            raise RuntimeError(str(exc)) from exc
        return []

    if result.success:
        return result.reference_paths
    if is_insufficient_credits_error(message=result.error or ""):
        raise RuntimeError("INSUFFICIENT_CREDITS")
    if raise_on_error:
        raise RuntimeError(result.error or f"{resolved_model} image generation failed")
    return []


async def generate_identity_image_unified(
    character_name: str,
    identity_prompt: str,
    reference_image_path: str,
    output_path: str,
    character_tag: str = "",
    ethnicity: str = "Chinese",
    style: str | None = None,
    dry_run: bool = False,
    model: str | None = None,
    project_dir: str = "",
    costume_image_path: str = "",
    usage_task_type: str = "identity_image",
    usage_scope: str = "",
    identity_name: str = "",
    raise_on_error: bool = False,
) -> dict[str, Any] | bool:
    """Generate an identity image through the selected platform model SKU."""
    resolved_model = str(model or "").strip()
    if not resolved_model:
        if raise_on_error:
            raise RuntimeError("identity image model is required")
        return False
    try:
        from ai_anime.modules.production.infrastructure.media_generation.nanobanana_character import (
            NanoBananaCharacterGenerator,
        )

        result = await NanoBananaCharacterGenerator(
            model=resolved_model
        ).generate_identity_with_reference(
            character_name=character_name,
            identity_prompt=identity_prompt,
            reference_image_path=reference_image_path,
            output_path=output_path,
            character_tag=character_tag,
            ethnicity=ethnicity,
            style=style,
            dry_run=dry_run,
            project_dir=project_dir,
            costume_image_path=costume_image_path,
            usage_task_type=usage_task_type,
            usage_scope=usage_scope,
            identity_name=identity_name,
        )
    except (ImportError, ValueError) as exc:
        if raise_on_error:
            raise RuntimeError(str(exc)) from exc
        return False

    if dry_run:
        return {
            "success": result.success,
            "prompt": result.prompt,
            "prompt_file": result.prompt_file,
        }
    if not result.success:
        if is_insufficient_credits_error(message=result.error or ""):
            raise RuntimeError("INSUFFICIENT_CREDITS")
        if raise_on_error:
            raise RuntimeError(result.error or "Identity image generation failed")
    return result.success
