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
        model: str,
    ) -> Sequence[str | Path]:
        from ai_anime.generators.image_generator import (
            generate_character_reference_unified,
        )

        output_dir = tempfile.mkdtemp(prefix="style_preview_")
        return await generate_character_reference_unified(
            character_name="preview",
            appearance_prompt=prompt,
            style=style_id,
            model=model,
            output_dir=output_dir,
            project_dir=output_dir,
            count=1,
        )


class PydanticStyleImageAnalyzer:
    async def analyze(
        self,
        content: bytes,
        *,
        mime_type: str,
    ) -> Mapping[str, Any]:
        from ai_anime.generators.style_analyzer import StyleAnalyzer

        return await StyleAnalyzer().analyze(content, mime_type=mime_type)
