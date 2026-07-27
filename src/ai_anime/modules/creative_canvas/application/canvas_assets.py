"""Creative Canvas asset-library use cases."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol
from urllib.parse import urlencode

from ai_anime.modules.project_workspace.public import ProjectContext


class CreativeCanvasBeatNotFound(LookupError):
    pass


class InvalidCreativeCanvasBeatContextQuery(ValueError):
    pass


@dataclass(frozen=True)
class ListCreativeCanvasAssetsQuery:
    context: ProjectContext
    project_id: str
    project_dir: Path


@dataclass(frozen=True)
class ListCreativeCanvasBeatContextAssetsQuery:
    context: ProjectContext
    project_id: str
    project_dir: Path
    episode: int | None
    beat: int | None


@dataclass(frozen=True)
class GetCreativeCanvasDirectorCaptureQuery:
    context: ProjectContext
    project_id: str
    project_dir: Path
    episode: int
    beat: int
    canvas_id: str | None
    node_id: str | None


@dataclass(frozen=True)
class SyncCreativeCanvasDirectorBackgroundCommand:
    project_dir: Path
    episode: int
    beat: int


@dataclass(frozen=True)
class GetCreativeCanvasSceneAssetsQuery:
    context: ProjectContext
    project_id: str
    project_dir: Path
    episode: int
    beat: int


class CreativeCanvasBeatSceneSource(Protocol):
    async def scene_id(
        self,
        *,
        context: ProjectContext,
        episode: int,
        beat: int,
    ) -> str | None: ...


class CreativeCanvasAssetCatalogGateway(Protocol):
    async def list_assets(
        self,
        *,
        context: ProjectContext,
        project_id: str,
        project_dir: Path,
    ) -> Sequence[Mapping[str, Any]]: ...

    async def list_beat_context_assets(
        self,
        *,
        context: ProjectContext,
        project_id: str,
        project_dir: Path,
        episode: int | None,
        beat: int | None,
    ) -> Mapping[str, Any]: ...


class CreativeCanvasDirectorCaptureStorage(Protocol):
    def list_files(
        self,
        *,
        context: ProjectContext,
        project_dir: Path,
        episode: int,
        beat: int,
    ) -> Sequence[Mapping[str, Any]]: ...

    def capture_dir(self, project_dir: Path, episode: int, beat: int) -> Path: ...

    def control_frames_dir(self, project_dir: Path) -> Path: ...

    def sync_background(self, project_dir: Path, episode: int, beat: int) -> bool: ...

    def scene_asset_urls(
        self,
        *,
        context: ProjectContext,
        project_dir: Path,
        episode: int,
        beat: int,
        scene_id: str | None,
    ) -> Mapping[str, str | None]: ...


class CreativeCanvasDirectorStageLinkBuilder(Protocol):
    def build(
        self,
        *,
        context: ProjectContext,
        project_dir: Path,
        episode: int,
        beat: int,
        scene_id: str,
        control_frames_dir: Path,
    ) -> str | None: ...


class CreativeCanvasAssetUseCases:
    def __init__(
        self,
        beat_scene_source: CreativeCanvasBeatSceneSource,
        capture_storage: CreativeCanvasDirectorCaptureStorage,
        stage_link_builder: CreativeCanvasDirectorStageLinkBuilder,
        asset_catalog: CreativeCanvasAssetCatalogGateway,
    ) -> None:
        self._beat_scene_source = beat_scene_source
        self._capture_storage = capture_storage
        self._stage_link_builder = stage_link_builder
        self._asset_catalog = asset_catalog

    async def list_assets(
        self,
        query: ListCreativeCanvasAssetsQuery,
    ) -> Sequence[Mapping[str, Any]]:
        return await self._asset_catalog.list_assets(
            context=query.context,
            project_id=query.project_id,
            project_dir=query.project_dir,
        )

    async def list_beat_context_assets(
        self,
        query: ListCreativeCanvasBeatContextAssetsQuery,
    ) -> Mapping[str, Any]:
        if query.episode is None and query.beat is not None:
            raise InvalidCreativeCanvasBeatContextQuery(
                "episode is required when beat is provided"
            )
        return await self._asset_catalog.list_beat_context_assets(
            context=query.context,
            project_id=query.project_id,
            project_dir=query.project_dir,
            episode=query.episode,
            beat=query.beat,
        )

    async def director_capture(
        self,
        query: GetCreativeCanvasDirectorCaptureQuery,
    ) -> Mapping[str, Any]:
        scene_id = await self._beat_scene_source.scene_id(
            context=query.context,
            episode=query.episode,
            beat=query.beat,
        )
        files = [
            dict(item)
            for item in self._capture_storage.list_files(
                context=query.context,
                project_dir=query.project_dir,
                episode=query.episode,
                beat=query.beat,
            )
        ]
        editor_url = None
        if scene_id:
            editor_url = self._stage_link_builder.build(
                context=query.context,
                project_dir=query.project_dir,
                episode=query.episode,
                beat=query.beat,
                scene_id=scene_id,
                control_frames_dir=self._capture_storage.control_frames_dir(
                    query.project_dir
                ),
            )
            if editor_url:
                return_context = {
                    "freezone_project": query.project_id,
                    "freezone_canvas": query.canvas_id or "",
                    "freezone_capture_node": query.node_id or "director_capture",
                    "return_to_freezone": "1",
                }
                separator = "&" if "?" in editor_url else "?"
                editor_url = f"{editor_url}{separator}{urlencode(return_context)}"

        return {
            "project": query.project_id,
            "episode": query.episode,
            "beat": query.beat,
            "scene_id": scene_id,
            "canvas_id": query.canvas_id,
            "node_id": query.node_id or "director_capture",
            "capture_dir": self._capture_storage.capture_dir(
                query.project_dir,
                query.episode,
                query.beat,
            ).as_posix(),
            "editor_url": editor_url,
            "can_open_stage": bool(editor_url),
            "files": files,
            "existing_count": sum(1 for item in files if item.get("exists")),
        }

    def sync_director_background(
        self,
        command: SyncCreativeCanvasDirectorBackgroundCommand,
    ) -> Mapping[str, Any]:
        return {
            "synced": self._capture_storage.sync_background(
                command.project_dir,
                command.episode,
                command.beat,
            ),
            "episode": command.episode,
            "beat": command.beat,
        }

    async def scene_assets_for_beat(
        self,
        query: GetCreativeCanvasSceneAssetsQuery,
    ) -> Mapping[str, Any]:
        scene_id = await self._beat_scene_source.scene_id(
            context=query.context,
            episode=query.episode,
            beat=query.beat,
        )
        urls = self._capture_storage.scene_asset_urls(
            context=query.context,
            project_dir=query.project_dir,
            episode=query.episode,
            beat=query.beat,
            scene_id=scene_id,
        )
        return {
            "project": query.project_id,
            "episode": query.episode,
            "beat": query.beat,
            "scene_id": scene_id,
            **dict(urls),
        }


__all__ = [
    "CreativeCanvasAssetCatalogGateway",
    "CreativeCanvasAssetUseCases",
    "CreativeCanvasBeatNotFound",
    "CreativeCanvasBeatSceneSource",
    "CreativeCanvasDirectorCaptureStorage",
    "CreativeCanvasDirectorStageLinkBuilder",
    "GetCreativeCanvasDirectorCaptureQuery",
    "GetCreativeCanvasSceneAssetsQuery",
    "InvalidCreativeCanvasBeatContextQuery",
    "ListCreativeCanvasAssetsQuery",
    "ListCreativeCanvasBeatContextAssetsQuery",
    "SyncCreativeCanvasDirectorBackgroundCommand",
]
