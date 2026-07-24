"""Seedance2 Beat panel status and reference-asset use cases."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from ai_anime.modules.production.application.ports import (
    ProductionSeedance2PanelGateway,
)
from ai_anime.modules.project_workspace.public import ProjectContext


@dataclass(frozen=True)
class Seedance2PanelQuery:
    project: str
    episode_num: int
    beat_num: int


@dataclass(frozen=True)
class UploadSeedance2AssetCommand:
    project: str
    episode_num: int
    beat_num: int
    filename: str
    content: bytes
    content_type: str


@dataclass(frozen=True)
class RemoveSeedance2AssetCommand:
    project: str
    episode_num: int
    beat_num: int
    media_kind: str
    path: str


@dataclass(frozen=True)
class CropSeedance2AssetCommand:
    project: str
    episode_num: int
    beat_num: int
    asset_key: str
    source_path: str
    crop_data: dict[str, Any]


@dataclass(frozen=True)
class TrimSeedance2AudioAssetCommand:
    project: str
    episode_num: int
    beat_num: int
    asset_key: str
    source_path: str
    start_seconds: float
    duration_seconds: float


class Seedance2PanelBeatMissing(Exception):
    def __init__(self, beat_num: int) -> None:
        super().__init__(f"Beat {beat_num} not found")


class Seedance2PanelOperationRejected(ValueError):
    pass


class Seedance2PanelUseCases:
    def __init__(self, gateway: ProductionSeedance2PanelGateway) -> None:
        self._gateway = gateway

    async def status(
        self,
        context: ProjectContext,
        query: Seedance2PanelQuery,
    ) -> dict[str, Any]:
        return await self._gateway.status(context, query)

    async def upload(
        self,
        context: ProjectContext,
        command: UploadSeedance2AssetCommand,
    ) -> dict[str, Any]:
        result = await self._gateway.upload(context, command)
        if result is None:
            raise Seedance2PanelOperationRejected(
                "unsupported or empty Seedance2 reference asset"
            )
        return result

    async def remove(
        self,
        context: ProjectContext,
        command: RemoveSeedance2AssetCommand,
    ) -> dict[str, Any]:
        result = await self._gateway.remove(context, command)
        if result is None:
            raise Seedance2PanelOperationRejected(
                "Seedance2 reference asset was not removed"
            )
        return result

    async def crop(
        self,
        context: ProjectContext,
        command: CropSeedance2AssetCommand,
    ) -> dict[str, Any]:
        result = await self._gateway.crop(context, command)
        if result is None:
            raise Seedance2PanelOperationRejected(
                "Seedance2 reference crop failed"
            )
        return result

    async def trim_audio(
        self,
        context: ProjectContext,
        command: TrimSeedance2AudioAssetCommand,
    ) -> dict[str, Any]:
        result = await self._gateway.trim_audio(context, command)
        if result is None:
            raise Seedance2PanelOperationRejected(
                "Seedance2 audio reference trim failed"
            )
        return result
