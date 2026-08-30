"""Preset speech generation adapter for reusable account voices."""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import Awaitable, Callable
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any

from ai_anime.modules.creative_canvas.application.audio_library import (
    CreateCreativeCanvasPresetVoiceCommand,
    GeneratedCreativeCanvasPresetVoice,
)
from ai_anime.shared.infrastructure.project_stores import (
    make_sqlite_store_for_context,
)

StoreFactory = Callable[[Any], Awaitable[Any]]


class ModelCreativeCanvasPresetVoiceGenerator:
    def __init__(
        self,
        store_factory: StoreFactory = make_sqlite_store_for_context,
    ) -> None:
        self._store_factory = store_factory

    async def generate(
        self,
        command: CreateCreativeCanvasPresetVoiceCommand,
    ) -> GeneratedCreativeCanvasPresetVoice:
        from ai_anime.modules.creative_canvas.infrastructure.audio_generation import (
            generate_freezone_audio_speech,
        )

        store = await self._store_factory(command.context)
        try:
            with TemporaryDirectory(prefix="ai-anime-preset-voice-") as temp_dir:
                generated = await generate_freezone_audio_speech(
                    store=store,
                    username=command.context.owner_username,
                    project=command.context.project_name,
                    account_voice_username=command.context.requester_username,
                    project_dir=Path(temp_dir),
                    job_id=f"preset_voice_{uuid.uuid4().hex}",
                    text=command.text,
                    emotion_prompt="",
                    mode="SPEECH",
                    voice=command.voice,
                    voice_ref=None,
                    model_selector=command.model_selector,
                )
                content = await asyncio.to_thread(generated.audio_path.read_bytes)
                return GeneratedCreativeCanvasPresetVoice(
                    filename=generated.audio_path.name,
                    content=content,
                    mime_type=generated.mime_type,
                    model=generated.model,
                )
        finally:
            close = getattr(store, "close", None)
            if close is not None:
                await close()


__all__ = ["ModelCreativeCanvasPresetVoiceGenerator"]
