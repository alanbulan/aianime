"""Creative Canvas video asset library application use cases."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping, Protocol, Sequence

from ai_anime.modules.creative_canvas.application.media_sources import (
    CreativeCanvasExistingMediaSourceResolver,
)
from ai_anime.modules.creative_canvas.domain.video_asset_library import (
    delete_video_asset_library_item,
    upsert_video_asset_library_item,
)
from ai_anime.modules.project_workspace.public import ProjectContext


class InvalidCreativeCanvasVideoAssetRequest(ValueError):
    pass


class CreativeCanvasVideoAssetMissing(FileNotFoundError):
    def __init__(self, item_id: str) -> None:
        self.item_id = item_id
        super().__init__(f"video character library item not found: {item_id}")


class CreativeCanvasVideoAssetSourceMissing(FileNotFoundError):
    pass


@dataclass(frozen=True)
class AddCreativeCanvasVideoAssetCommand:
    project_dir: Path
    name: str
    media: str = "image"
    image_urls: tuple[str, ...] = ()
    video_url: str | None = None
    audio_url: str | None = None
    source: str = "upload"


@dataclass(frozen=True)
class SyncCreativeCanvasVideoAssetsCommand:
    context: ProjectContext
    project_dir: Path


@dataclass(frozen=True)
class CreativeCanvasVideoAssetSyncResult:
    items: tuple[Mapping[str, Any], ...]
    synced: int


class CreativeCanvasVideoAssetReader(Protocol):
    def list_items(self, project_dir: Path) -> tuple[Mapping[str, Any], ...]: ...


class CreativeCanvasVideoAssetRepository(CreativeCanvasVideoAssetReader, Protocol):
    def save_items(
        self,
        project_dir: Path,
        items: Sequence[Mapping[str, Any]],
    ) -> None: ...


class CreativeCanvasMainlineVideoAssetSource(Protocol):
    async def list_assets(
        self,
        *,
        context: ProjectContext,
        project_dir: Path,
    ) -> tuple[Mapping[str, Any], ...]: ...


class CreativeCanvasVideoAssetIdGenerator(Protocol):
    def new_id(self) -> str: ...


class CreativeCanvasClock(Protocol):
    def now_isoformat(self) -> str: ...


class CreativeCanvasVideoAssetLibraryUseCases:
    def __init__(
        self,
        repository: CreativeCanvasVideoAssetRepository,
        media_sources: CreativeCanvasExistingMediaSourceResolver,
        mainline_assets: CreativeCanvasMainlineVideoAssetSource,
        ids: CreativeCanvasVideoAssetIdGenerator,
        clock: CreativeCanvasClock,
    ) -> None:
        self._repository = repository
        self._media_sources = media_sources
        self._mainline_assets = mainline_assets
        self._ids = ids
        self._clock = clock

    def list_items(self, project_dir: Path) -> tuple[Mapping[str, Any], ...]:
        return tuple(dict(item) for item in self._repository.list_items(project_dir))

    def add_item(
        self,
        command: AddCreativeCanvasVideoAssetCommand,
    ) -> Mapping[str, Any]:
        name = command.name.strip()
        if not name:
            raise InvalidCreativeCanvasVideoAssetRequest("name is required")
        self._validate_media(command)

        items = self._repository.list_items(command.project_dir)
        stored_items, item = upsert_video_asset_library_item(
            items,
            item_id=self._ids.new_id(),
            name=name,
            media=command.media,
            source=command.source,
            image_urls=command.image_urls,
            video_url=command.video_url,
            audio_url=command.audio_url,
            updated_at=self._clock.now_isoformat(),
        )
        self._repository.save_items(command.project_dir, stored_items)
        return dict(item)

    def delete_item(self, project_dir: Path, item_id: str) -> None:
        items = self._repository.list_items(project_dir)
        stored_items, deleted = delete_video_asset_library_item(items, item_id)
        if not deleted:
            raise CreativeCanvasVideoAssetMissing(item_id)
        self._repository.save_items(project_dir, stored_items)

    async def sync_from_mainline(
        self,
        command: SyncCreativeCanvasVideoAssetsCommand,
    ) -> CreativeCanvasVideoAssetSyncResult:
        assets = await self._mainline_assets.list_assets(
            context=command.context,
            project_dir=command.project_dir,
        )
        items = [dict(item) for item in self._repository.list_items(command.project_dir)]
        for asset in assets:
            media = str(asset.get("media") or "image")
            url = str(asset.get("url") or "")
            if not url:
                continue
            items, _item = upsert_video_asset_library_item(
                items,
                item_id=str(asset.get("id") or ""),
                name=str(asset.get("name") or ""),
                media=media,
                source=str(asset.get("source") or "upload"),
                image_urls=(url,) if media == "image" else (),
                video_url=url if media == "video" else None,
                audio_url=url if media == "audio" else None,
                updated_at=self._clock.now_isoformat(),
            )
        if assets:
            self._repository.save_items(command.project_dir, items)
        return CreativeCanvasVideoAssetSyncResult(
            items=tuple(dict(item) for item in items),
            synced=len(assets),
        )

    def _validate_media(self, command: AddCreativeCanvasVideoAssetCommand) -> None:
        if command.media == "video":
            if not command.video_url:
                raise InvalidCreativeCanvasVideoAssetRequest(
                    "video_url is required when media=video"
                )
            self._require_local(command.project_dir, command.video_url, "video")
            return
        if command.media == "audio":
            if not command.audio_url:
                raise InvalidCreativeCanvasVideoAssetRequest(
                    "audio_url is required when media=audio"
                )
            self._require_local(command.project_dir, command.audio_url, "audio")
            return
        if not command.image_urls:
            raise InvalidCreativeCanvasVideoAssetRequest(
                "image_urls is required (non-empty)"
            )
        for url in command.image_urls:
            self._require_local(command.project_dir, url, "image")

    def _require_local(self, project_dir: Path, url: str, label: str) -> None:
        try:
            path = self._media_sources.resolve(project_dir, url)
        except ValueError as exc:
            raise InvalidCreativeCanvasVideoAssetRequest(str(exc)) from exc
        if not self._media_sources.exists(path):
            raise CreativeCanvasVideoAssetSourceMissing(f"{label} not found: {path}")


__all__ = [
    "AddCreativeCanvasVideoAssetCommand",
    "CreativeCanvasClock",
    "CreativeCanvasMainlineVideoAssetSource",
    "CreativeCanvasVideoAssetIdGenerator",
    "CreativeCanvasVideoAssetLibraryUseCases",
    "CreativeCanvasVideoAssetMissing",
    "CreativeCanvasVideoAssetReader",
    "CreativeCanvasVideoAssetRepository",
    "CreativeCanvasVideoAssetSourceMissing",
    "CreativeCanvasVideoAssetSyncResult",
    "InvalidCreativeCanvasVideoAssetRequest",
    "SyncCreativeCanvasVideoAssetsCommand",
]
