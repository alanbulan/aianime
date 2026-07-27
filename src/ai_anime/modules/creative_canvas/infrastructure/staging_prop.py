"""DirectorWorld staging prop generator adapter."""

from __future__ import annotations

import asyncio
from typing import Any

from ai_anime.director_world.staging_prop_ai import generate_ai_staging_prop


class DirectorWorldCreativeCanvasStagingPropGenerator:
    async def generate(self, request: dict[str, object]) -> dict[str, Any]:
        return await asyncio.to_thread(generate_ai_staging_prop, request)
