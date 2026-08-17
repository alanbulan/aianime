"""Project-facing Beat viewer and Director Stage use cases."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping

from ai_anime.modules.asset_world.application.background_anchor import (
    BeatBackgroundAnchorUseCases,
)
from ai_anime.modules.asset_world.application.director_stage import (
    BeatDirectorStageUseCases,
    resolve_beat_scene_name,
)
from ai_anime.modules.asset_world.application.dto import (
    CropBeatBackgroundCommand,
    ExportBeatDirectorControlFrameCommand,
    SaveBeatDirectorOverlayCommand,
    SelectBeatBackgroundCommand,
    UploadBeatBackgroundCommand,
)
from ai_anime.modules.asset_world.application.errors import SceneViewerRejected
from ai_anime.modules.asset_world.application.ports import (
    BeatViewerEpisodeSource,
    BeatViewerMediaUrls,
    BeatViewerRuntimePropMenuSource,
    BeatViewerStore,
    BeatViewerWorkspace,
)
from ai_anime.modules.asset_world.application.scene_viewer import SceneViewerUseCases
from ai_anime.modules.asset_world.domain.background_anchor import (
    ANCHOR_DIRECTOR_ENV_ONLY,
)
from ai_anime.modules.project_workspace.public import ProjectContext


@dataclass(frozen=True)
class BeatViewerQuery:
    episode_num: int
    beat_num: int


class BeatViewerBeatNotFound(LookupError):
    def __init__(self, beat_num: int) -> None:
        super().__init__(f"Beat {beat_num} not found")


class BeatViewerSceneMissing(SceneViewerRejected):
    pass


class BeatViewerUseCases:
    def __init__(
        self,
        workspace: BeatViewerWorkspace,
        media_urls: BeatViewerMediaUrls,
        scene_viewer: SceneViewerUseCases,
        director_stage: BeatDirectorStageUseCases,
        background_anchors: BeatBackgroundAnchorUseCases,
        episodes: BeatViewerEpisodeSource,
        prop_menus: BeatViewerRuntimePropMenuSource,
    ) -> None:
        self._workspace = workspace
        self._media_urls = media_urls
        self._scene_viewer = scene_viewer
        self._director_stage = director_stage
        self._background_anchors = background_anchors
        self._episodes = episodes
        self._prop_menus = prop_menus

    async def pano_background_manifest(
        self,
        context: ProjectContext,
        query: BeatViewerQuery,
    ) -> dict[str, Any]:
        async with self._workspace.session(context) as store:
            _beats, beat = await self._beat_context(store, query)
            return self._scene_viewer.beat_pano_manifest(
                project_id=context.project_id,
                project_dir=context.output_dir,
                scene_name=self._require_scene_name(beat),
                asset_url=self._media_urls.asset_url(context),
                episode_num=int(query.episode_num),
                beat_num=int(query.beat_num),
                beat=beat,
            )

    def default_director_stage_palette(self) -> dict[str, Any]:
        return self._scene_viewer.default_director_stage_palette()

    async def director_stage_manifest(
        self,
        context: ProjectContext,
        query: BeatViewerQuery,
    ) -> dict[str, Any]:
        async with self._workspace.session(context) as store:
            episode_num = int(query.episode_num)
            beats, beat = await self._beat_context(store, query)
            scene_name = self._require_scene_name(beat)
            episode = self._episodes.episode_or_none(store, episode_num)
            prop_menu = self._prop_menus.for_episode(store, episode, beats)
            return self._scene_viewer.beat_director_stage_manifest(
                project_id=context.project_id,
                project_dir=context.output_dir,
                scene_name=scene_name,
                asset_url=self._media_urls.asset_url(context),
                episode_num=episode_num,
                beat_num=int(query.beat_num),
                beat=beat,
                sketch_colors=dict(store.get_sketch_colors(episode_num) or {}),
                prop_marker_colors=self._prop_marker_colors(prop_menu),
            )

    async def load_director_stage_overlay(
        self,
        context: ProjectContext,
        query: BeatViewerQuery,
    ) -> dict[str, Any]:
        async with self._workspace.session(context) as store:
            _beats, beat = await self._beat_context(store, query)
            return await self._director_stage.load_overlay(
                repository=store,
                project_dir=context.output_dir,
                episode_num=int(query.episode_num),
                beat_num=int(query.beat_num),
                scene_name=self._require_scene_name(beat),
            )

    async def save_director_stage_overlay(
        self,
        context: ProjectContext,
        query: BeatViewerQuery,
        command: SaveBeatDirectorOverlayCommand,
    ) -> dict[str, Any]:
        async with self._workspace.session(context) as store:
            _beats, beat = await self._beat_context(store, query)
            return await self._director_stage.save_overlay(
                repository=store,
                asset_writer=store,
                project_dir=context.output_dir,
                episode_num=int(query.episode_num),
                beat_num=int(query.beat_num),
                scene_name=self._require_scene_name(beat),
                beat=beat,
                command=command,
            )

    async def export_director_stage_control_frame(
        self,
        context: ProjectContext,
        query: BeatViewerQuery,
        command: ExportBeatDirectorControlFrameCommand,
    ) -> dict[str, Any]:
        async with self._workspace.session(context) as store:
            _beats, beat = await self._beat_context(store, query)
            exported = self._director_stage.export_control_frame(
                project_dir=context.output_dir,
                scene_name=self._require_scene_name(beat),
                episode_num=int(query.episode_num),
                beat_num=int(query.beat_num),
                command=command,
                asset_url=self._media_urls.asset_url(context),
            )
            background_anchor = await self._background_anchors.select_anchor(
                asset_writer=store,
                project_dir=context.output_dir,
                beat=beat,
                episode_num=int(query.episode_num),
                beat_num=int(query.beat_num),
                command=SelectBeatBackgroundCommand(
                    anchor_id=ANCHOR_DIRECTOR_ENV_ONLY,
                ),
                asset_url=self._media_urls.asset_url(context),
            )
            return {
                **exported,
                "background_anchor": background_anchor,
            }

    def director_control_frame_status(
        self,
        context: ProjectContext,
        query: BeatViewerQuery,
    ) -> dict[str, Any]:
        return self._director_stage.control_frame_status(
            project_dir=context.output_dir,
            episode_num=int(query.episode_num),
            beat_num=int(query.beat_num),
            asset_url=self._media_urls.asset_url(context),
        )

    async def background_anchors(
        self,
        context: ProjectContext,
        query: BeatViewerQuery,
    ) -> dict[str, Any]:
        async with self._workspace.session(context) as store:
            _beats, beat = await self._beat_context(store, query)
            return self._background_anchors.list_anchors(
                project_dir=context.output_dir,
                beat=beat,
                episode_num=int(query.episode_num),
                beat_num=int(query.beat_num),
                asset_url=self._media_urls.asset_url(context),
            )

    async def select_background_anchor(
        self,
        context: ProjectContext,
        query: BeatViewerQuery,
        command: SelectBeatBackgroundCommand,
    ) -> dict[str, Any]:
        async with self._workspace.session(context) as store:
            _beats, beat = await self._beat_context(store, query)
            return await self._background_anchors.select_anchor(
                asset_writer=store,
                project_dir=context.output_dir,
                beat=beat,
                episode_num=int(query.episode_num),
                beat_num=int(query.beat_num),
                command=command,
                asset_url=self._media_urls.asset_url(context),
            )

    async def crop_background_anchor(
        self,
        context: ProjectContext,
        query: BeatViewerQuery,
        command: CropBeatBackgroundCommand,
    ) -> dict[str, Any]:
        async with self._workspace.session(context) as store:
            _beats, beat = await self._beat_context(store, query)
            return await self._background_anchors.crop_anchor(
                asset_writer=store,
                project_dir=context.output_dir,
                beat=beat,
                episode_num=int(query.episode_num),
                beat_num=int(query.beat_num),
                command=command,
                asset_url=self._media_urls.asset_url(context),
            )

    async def upload_background_anchor(
        self,
        context: ProjectContext,
        query: BeatViewerQuery,
        command: UploadBeatBackgroundCommand,
    ) -> dict[str, Any]:
        async with self._workspace.session(context) as store:
            _beats, beat = await self._beat_context(store, query)
            return await self._background_anchors.upload_anchor(
                asset_writer=store,
                project_dir=context.output_dir,
                beat=beat,
                episode_num=int(query.episode_num),
                beat_num=int(query.beat_num),
                command=command,
                asset_url=self._media_urls.asset_url(context),
            )

    @classmethod
    async def _beat_context(
        cls,
        store: BeatViewerStore,
        query: BeatViewerQuery,
    ) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        beats = await store.get_beats_as_dicts(int(query.episode_num))
        return beats, cls._require_beat(beats, query.beat_num)

    @staticmethod
    def _require_beat(
        beats: list[dict[str, Any]],
        beat_num: int,
    ) -> dict[str, Any]:
        normalized_beat_num = int(beat_num)
        beat = next(
            (
                candidate
                for candidate in beats
                if int(candidate.get("beat_number") or 0) == normalized_beat_num
            ),
            None,
        )
        if beat is None:
            raise BeatViewerBeatNotFound(normalized_beat_num)
        return beat

    @staticmethod
    def _require_scene_name(beat: Mapping[str, Any]) -> str:
        scene_name = resolve_beat_scene_name(beat)
        if not scene_name:
            raise BeatViewerSceneMissing("当前 Beat 没有关联场景")
        return scene_name

    @staticmethod
    def _prop_marker_colors(prop_menu: list[dict[str, Any]]) -> dict[str, str]:
        colors: dict[str, str] = {}
        for item in prop_menu:
            if not isinstance(item, dict):
                continue
            prop_id = str(item.get("prop_id") or "").strip()
            marker_color = str(item.get("marker_color") or "").strip()
            if prop_id and marker_color:
                colors[prop_id] = marker_color
        return colors


__all__ = [
    "BeatViewerBeatNotFound",
    "BeatViewerQuery",
    "BeatViewerSceneMissing",
    "BeatViewerUseCases",
]
