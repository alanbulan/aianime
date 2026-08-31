"""AI gateways used by style preview and analysis workflows."""

from __future__ import annotations

import asyncio
import tempfile
from pathlib import Path
from typing import Any, Mapping, Sequence


class UnifiedStylePreviewGenerator:
    async def generate(
        self,
        *,
        prompt: str,
        style_id: str,
        project_dir: Path,
    ) -> Sequence[str | Path]:
        from ai_anime.modules.production.public import (
            call_image_generation_api,
            get_style_preset,
        )

        style = await asyncio.to_thread(
            get_style_preset,
            style_id,
            project_dir=str(project_dir),
        )
        style_instructions = str(style.get("style_instructions") or "").strip()
        avoid_instructions = str(style.get("avoid_instructions") or "").strip()
        style_tag = str(style.get("style_tag") or "").strip()
        style_family = str(style.get("style_family") or "").strip()
        animation_subtype = str(style.get("animation_subtype") or "").strip()
        resolved_prompt = f"""Create one polished, full-frame visual style reference image comparable to a built-in production style preset.

SUBJECT AND SCENE DIRECTION:
{prompt}

MANDATORY REFERENCE COVERAGE (takes priority over conflicting subject or scene wording):
- Include one clearly visible anonymous adult character in a medium or waist-up foreground view, with an unobscured face, eyes, hair, skin, and clothing
- Include a substantial representative environment in the same coherent frame, with visible architecture, materials, props, or foliage appropriate to the requested direction
- Show enough character detail to demonstrate facial line weight, eye rendering, hair treatment, skin shading, fabric treatment, and edge finish
- Show enough environment detail to demonstrate palette, lighting, material rendering, texture, atmospheric depth, lens treatment, and grade
- The anonymous character is only a rendering sample for this style reference and must not be treated as a reusable character identity
- If the subject or scene direction asks for an empty environment, no people, or no face, preserve its setting and mood but still satisfy the character-and-environment coverage above

STYLE CONFIGURATION:
Style tag: {style_tag}
Style family: {style_family}
Animation subtype: {animation_subtype}
{style_instructions}

OUTPUT REQUIREMENTS:
- Render the required character and requested scene direction as one coherent finished production still
- Demonstrate the style consistently through medium, linework, palette, lighting, materials, texture, depth, lens treatment, grade, and finish
- Use a single full-frame composition, not a collage, contact sheet, split panel, character sheet, or mood board
- No readable text, labels, logos, signatures, or watermarks

AVOID:
{avoid_instructions}
""".strip()
        image_bytes, _text, error = await call_image_generation_api(
            prompt=resolved_prompt,
            reference_images=None,
            image_config={
                "aspect_ratio": "16:9",
                "image_size": "1K",
                "quality": "medium",
                "output_format": "png",
            },
        )
        if not image_bytes:
            raise RuntimeError(error or "风格参考图生成失败：图片模型未返回图像")
        output_dir = Path(await asyncio.to_thread(tempfile.mkdtemp, prefix="style_preview_"))
        output_path = output_dir / "style_reference.png"
        await asyncio.to_thread(output_path.write_bytes, image_bytes)
        return [output_path]


class PydanticStyleImageAnalyzer:
    async def analyze(
        self,
        content: bytes,
        *,
        mime_type: str,
    ) -> Mapping[str, Any]:
        from ai_anime.modules.production.public import StyleAnalyzer

        return await StyleAnalyzer().analyze(content, mime_type=mime_type)
