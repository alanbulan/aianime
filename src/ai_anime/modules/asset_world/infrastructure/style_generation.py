"""AI gateways used by style preview and analysis workflows."""

from __future__ import annotations

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
            _call_newapi_image_api,
            get_style_preset,
        )

        style = get_style_preset(style_id, project_dir=str(project_dir))
        style_instructions = str(style.get("style_instructions") or "").strip()
        avoid_instructions = str(style.get("avoid_instructions") or "").strip()
        resolved_prompt = f"""Create one identity-neutral visual style reference image for future image generation.

USER MOOD OR SETTING:
{prompt}

STYLE TO DEMONSTRATE:
{style_instructions}

CONTENT:
- One unoccupied environment containing architecture, foliage, fabric, wood, metal, glass, and soft atmospheric light
- Show the style consistently through linework, palette, lighting, materials, texture, depth, and rendering finish
- Use one coherent natural scene, not a collage, contact sheet, split panel, character sheet, or mood board

STRICTLY FORBIDDEN:
- No people, faces, portraits, heads, bodies, silhouettes, mannequins, statues, dolls, animals, or living characters
- No readable text, labels, logos, signatures, or watermarks
- Do not follow any request for a person or character in the user mood/setting
- {avoid_instructions}
""".strip()
        image_bytes, _text, error = await _call_newapi_image_api(
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
        output_dir = Path(tempfile.mkdtemp(prefix="style_preview_"))
        output_path = output_dir / "style_reference.png"
        output_path.write_bytes(image_bytes)
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
