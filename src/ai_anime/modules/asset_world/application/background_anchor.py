"""Beat background-anchor application use cases."""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path
from typing import Any

from ai_anime.models import sync_beat_asset_refs
from ai_anime.modules.asset_world.application.director_stage import (
    resolve_beat_scene_name,
)
from ai_anime.modules.asset_world.application.dto import (
    CropBeatBackgroundCommand,
    SelectBeatBackgroundCommand,
    UploadBeatBackgroundCommand,
)
from ai_anime.modules.asset_world.application.errors import BackgroundAnchorRejected
from ai_anime.modules.asset_world.application.ports import (
    BeatAssetWriter,
    BeatBackgroundAnchorFiles,
)
from ai_anime.modules.asset_world.domain.background_anchor import (
    ANCHOR_SELECTED_BACKGROUND,
    BACKGROUND_SOURCE_ANCHORS,
    SNAPSHOT_SOURCE_ANCHORS,
    background_anchor_label,
    current_background_source,
    normalize_background_anchor_id,
    selected_background_scene_ref,
)

AssetUrl = Callable[[Path], str]


class BeatBackgroundAnchorUseCases:
    def __init__(self, files: BeatBackgroundAnchorFiles) -> None:
        self._files = files

    def list_anchors(
        self,
        *,
        project_dir: Path,
        beat: dict[str, Any],
        episode_num: int,
        beat_num: int,
        asset_url: AssetUrl | None = None,
    ) -> dict[str, Any]:
        scene_name = resolve_beat_scene_name(beat)
        scene_ref = beat.get("scene_ref")
        scene_ref = scene_ref if isinstance(scene_ref, dict) else {}
        inferred_source = ""
        raw_source = str(scene_ref.get("render_anchor_source_id") or "").strip()
        normalized_source = (
            normalize_background_anchor_id(raw_source) if raw_source else ""
        )
        if (
            normalize_background_anchor_id(
                str(scene_ref.get("render_anchor_id") or "")
            )
            == ANCHOR_SELECTED_BACKGROUND
            and normalized_source not in BACKGROUND_SOURCE_ANCHORS
            and scene_name
        ):
            inferred_source = self._files.infer_selected_source(
                project_dir,
                scene_name,
                episode_num=int(episode_num),
                beat_num=int(beat_num),
            )
        stored_anchor, current_source = current_background_source(
            scene_ref,
            inferred_source=inferred_source,
        )

        if not scene_name:
            return {
                "episode": int(episode_num),
                "beat_num": int(beat_num),
                "scene_id": "",
                "can_choose": False,
                "render_anchor_id": stored_anchor,
                "current_source": current_source,
                "current_anchor": current_source,
                "current_reference": None,
                "display_reference": None,
                "render_input": None,
                "anchors": [],
                "error": "当前 Beat 没有关联场景，不能选择背景",
            }

        render_input = self._reference_payload(
            project_dir=project_dir,
            scene_name=scene_name,
            episode_num=episode_num,
            beat_num=beat_num,
            anchor_id=stored_anchor,
            reference_id=stored_anchor,
            asset_url=asset_url,
        )
        display_reference = self._reference_payload(
            project_dir=project_dir,
            scene_name=scene_name,
            episode_num=episode_num,
            beat_num=beat_num,
            anchor_id=current_source,
            reference_id=current_source,
            asset_url=asset_url,
        )
        if display_reference is None and render_input is not None:
            display_reference = {
                **render_input,
                "id": current_source,
                "label": background_anchor_label(current_source),
            }

        return {
            "episode": int(episode_num),
            "beat_num": int(beat_num),
            "scene_id": scene_name,
            "can_choose": True,
            "render_anchor_id": stored_anchor,
            "current_source": current_source,
            "current_anchor": current_source,
            "current_reference": display_reference,
            "display_reference": display_reference,
            "render_input": render_input,
            "anchors": [
                self._anchor_item(
                    project_dir=project_dir,
                    scene_name=scene_name,
                    episode_num=episode_num,
                    beat_num=beat_num,
                    anchor_id=anchor_id,
                    current_anchor=current_source,
                    asset_url=asset_url,
                )
                for anchor_id in BACKGROUND_SOURCE_ANCHORS
            ],
            "error": "",
        }

    async def select_anchor(
        self,
        *,
        asset_writer: BeatAssetWriter | None,
        project_dir: Path,
        beat: dict[str, Any],
        episode_num: int,
        beat_num: int,
        command: SelectBeatBackgroundCommand,
        asset_url: AssetUrl | None = None,
    ) -> dict[str, Any]:
        scene_name = self._require_scene_name(
            beat,
            "当前 Beat 没有关联场景，不能选择背景",
        )
        normalized = normalize_background_anchor_id(command.anchor_id)
        if normalized not in BACKGROUND_SOURCE_ANCHORS:
            raise BackgroundAnchorRejected(
                f"Unsupported background anchor: {command.anchor_id}"
            )

        if normalized in SNAPSHOT_SOURCE_ANCHORS:
            source_path = self._files.anchor_path(
                project_dir,
                scene_name,
                episode_num=int(episode_num),
                beat_num=int(beat_num),
                anchor_id=normalized,
            )
            if source_path is None or not self._files.exists(source_path):
                raise BackgroundAnchorRejected(
                    f"{background_anchor_label(normalized)} 背景图不存在"
                )
            self._files.copy_to_selected(
                project_dir,
                int(episode_num),
                int(beat_num),
                source_path,
            )
            source_anchor = normalized
        else:
            selected_path = self._files.selected_background_path(
                project_dir,
                int(episode_num),
                int(beat_num),
            )
            if not self._files.exists(selected_path):
                raise BackgroundAnchorRejected(
                    "当前 beat 还没有 selected_background.png"
                )
            source_anchor = ANCHOR_SELECTED_BACKGROUND

        return await self._finish_write(
            asset_writer=asset_writer,
            project_dir=project_dir,
            beat=beat,
            episode_num=episode_num,
            beat_num=beat_num,
            scene_name=scene_name,
            source_anchor=source_anchor,
            asset_url=asset_url,
        )

    async def crop_anchor(
        self,
        *,
        asset_writer: BeatAssetWriter | None,
        project_dir: Path,
        beat: dict[str, Any],
        episode_num: int,
        beat_num: int,
        command: CropBeatBackgroundCommand,
        asset_url: AssetUrl | None = None,
    ) -> dict[str, Any]:
        scene_name = self._require_scene_name(
            beat,
            "当前 Beat 没有关联场景，不能裁剪背景参考",
        )
        normalized = normalize_background_anchor_id(command.anchor_id)
        if normalized not in SNAPSHOT_SOURCE_ANCHORS:
            raise BackgroundAnchorRejected(
                f"Unsupported background crop source: {normalized}"
            )

        source_path = self._files.anchor_path(
            project_dir,
            scene_name,
            episode_num=int(episode_num),
            beat_num=int(beat_num),
            anchor_id=normalized,
        )
        if source_path is None or not self._files.exists(source_path):
            raise BackgroundAnchorRejected(
                f"{background_anchor_label(normalized)} 背景图不存在"
            )

        self._files.crop_to_selected(
            project_dir,
            int(episode_num),
            int(beat_num),
            source_path,
            x=int(command.x or 0),
            y=int(command.y or 0),
            width=int(command.width or 0),
            height=int(command.height or 0),
        )
        return await self._finish_write(
            asset_writer=asset_writer,
            project_dir=project_dir,
            beat=beat,
            episode_num=episode_num,
            beat_num=beat_num,
            scene_name=scene_name,
            source_anchor=normalized,
            asset_url=asset_url,
        )

    async def upload_anchor(
        self,
        *,
        asset_writer: BeatAssetWriter | None,
        project_dir: Path,
        beat: dict[str, Any],
        episode_num: int,
        beat_num: int,
        command: UploadBeatBackgroundCommand,
        asset_url: AssetUrl | None = None,
    ) -> dict[str, Any]:
        scene_name = self._require_scene_name(
            beat,
            "当前 Beat 没有关联场景，不能上传背景参考",
        )
        self._files.save_uploaded_image(
            project_dir,
            int(episode_num),
            int(beat_num),
            command.image,
        )
        return await self._finish_write(
            asset_writer=asset_writer,
            project_dir=project_dir,
            beat=beat,
            episode_num=episode_num,
            beat_num=beat_num,
            scene_name=scene_name,
            source_anchor=ANCHOR_SELECTED_BACKGROUND,
            asset_url=asset_url,
        )

    def _reference_payload(
        self,
        *,
        project_dir: Path,
        scene_name: str,
        episode_num: int,
        beat_num: int,
        anchor_id: str,
        reference_id: str | None,
        asset_url: AssetUrl | None,
    ) -> dict[str, Any] | None:
        normalized = normalize_background_anchor_id(anchor_id)
        path = self._files.anchor_path(
            project_dir,
            scene_name,
            episode_num=int(episode_num),
            beat_num=int(beat_num),
            anchor_id=normalized,
        )
        if path is None or not self._files.exists(path):
            return None

        display_id = normalize_background_anchor_id(reference_id or normalized)
        rel_path = self._files.project_relative_path(project_dir, path)
        return {
            "id": display_id,
            "label": background_anchor_label(display_id),
            "anchor_id": normalized,
            "path": path.as_posix(),
            "rel_path": rel_path,
            "url": asset_url(path) if asset_url is not None else None,
        }

    def _anchor_item(
        self,
        *,
        project_dir: Path,
        scene_name: str,
        episode_num: int,
        beat_num: int,
        anchor_id: str,
        current_anchor: str,
        asset_url: AssetUrl | None,
    ) -> dict[str, Any]:
        normalized = normalize_background_anchor_id(anchor_id)
        path = self._files.anchor_path(
            project_dir,
            scene_name,
            episode_num=int(episode_num),
            beat_num=int(beat_num),
            anchor_id=normalized,
        )
        exists = bool(path is not None and self._files.exists(path))
        rel_path = (
            self._files.project_relative_path(project_dir, path)
            if exists and path is not None
            else None
        )
        return {
            "id": normalized,
            "anchor_id": normalized,
            "label": background_anchor_label(normalized),
            "current": normalized == current_anchor,
            "exists": exists,
            "path": path.as_posix() if path is not None else "",
            "rel_path": rel_path,
            "url": (
                asset_url(path)
                if exists and path is not None and asset_url is not None
                else None
            ),
            "snapshot_to_selected_background": normalized
            in SNAPSHOT_SOURCE_ANCHORS,
        }

    async def _finish_write(
        self,
        *,
        asset_writer: BeatAssetWriter | None,
        project_dir: Path,
        beat: dict[str, Any],
        episode_num: int,
        beat_num: int,
        scene_name: str,
        source_anchor: str,
        asset_url: AssetUrl | None,
    ) -> dict[str, Any]:
        beat["scene_ref"] = selected_background_scene_ref(
            beat.get("scene_ref") if isinstance(beat.get("scene_ref"), dict) else None,
            scene_name=scene_name,
            source_anchor_id=source_anchor,
        )
        sync_beat_asset_refs(beat)
        payload = self.list_anchors(
            project_dir=project_dir,
            beat=beat,
            episode_num=int(episode_num),
            beat_num=int(beat_num),
            asset_url=asset_url,
        )
        if asset_writer is not None:
            await asset_writer.update_beat_asset(
                episode_number=int(episode_num),
                beat_number=int(beat_num),
                scene_ref=dict(beat.get("scene_ref") or {}),
            )
        return payload

    @staticmethod
    def _require_scene_name(beat: dict[str, Any], message: str) -> str:
        scene_name = resolve_beat_scene_name(beat)
        if not scene_name:
            raise BackgroundAnchorRejected(message)
        return scene_name
