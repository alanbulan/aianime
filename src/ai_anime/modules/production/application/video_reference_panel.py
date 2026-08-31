"""Beat video-reference panel status and asset use cases."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from ai_anime.modules.production.application.ports import (
    ProductionVideoReferencePanelGateway,
)
from ai_anime.modules.project_workspace.public import ProjectContext


@dataclass(frozen=True)
class VideoReferencePanelQuery:
    project: str
    episode_num: int
    beat_num: int


@dataclass(frozen=True)
class UploadVideoReferenceAssetCommand:
    project: str
    episode_num: int
    beat_num: int
    filename: str
    content: bytes
    content_type: str


@dataclass(frozen=True)
class RemoveVideoReferenceAssetCommand:
    project: str
    episode_num: int
    beat_num: int
    media_kind: str
    path: str


@dataclass(frozen=True)
class CropVideoReferenceAssetCommand:
    project: str
    episode_num: int
    beat_num: int
    asset_key: str
    source_path: str
    crop_data: dict[str, Any]


@dataclass(frozen=True)
class TrimVideoReferenceAudioAssetCommand:
    project: str
    episode_num: int
    beat_num: int
    asset_key: str
    source_path: str
    start_seconds: float
    duration_seconds: float


class VideoReferencePanelBeatMissing(Exception):
    def __init__(self, beat_num: int) -> None:
        super().__init__(f"Beat {beat_num} not found")


class VideoReferencePanelOperationRejected(ValueError):
    pass


class VideoReferencePanelUseCases:
    def __init__(self, gateway: ProductionVideoReferencePanelGateway) -> None:
        self._gateway = gateway

    async def status(
        self,
        context: ProjectContext,
        query: VideoReferencePanelQuery,
    ) -> dict[str, Any]:
        return await self._gateway.status(context, query)

    async def upload(
        self,
        context: ProjectContext,
        command: UploadVideoReferenceAssetCommand,
    ) -> dict[str, Any]:
        result = await self._gateway.upload(context, command)
        if result is None:
            raise VideoReferencePanelOperationRejected(
                "unsupported or empty video reference asset"
            )
        return result

    async def remove(
        self,
        context: ProjectContext,
        command: RemoveVideoReferenceAssetCommand,
    ) -> dict[str, Any]:
        result = await self._gateway.remove(context, command)
        if result is None:
            raise VideoReferencePanelOperationRejected(
                "video reference asset was not removed"
            )
        return result

    async def crop(
        self,
        context: ProjectContext,
        command: CropVideoReferenceAssetCommand,
    ) -> dict[str, Any]:
        result = await self._gateway.crop(context, command)
        if result is None:
            raise VideoReferencePanelOperationRejected(
                "video reference crop failed"
            )
        return result

    async def trim_audio(
        self,
        context: ProjectContext,
        command: TrimVideoReferenceAudioAssetCommand,
    ) -> dict[str, Any]:
        result = await self._gateway.trim_audio(context, command)
        if result is None:
            raise VideoReferencePanelOperationRejected(
                "video audio-reference trim failed"
            )
        return result
