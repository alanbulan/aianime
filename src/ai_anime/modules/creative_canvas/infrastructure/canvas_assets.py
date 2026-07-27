"""Local director-capture and scene-asset adapters for Creative Canvas."""

from __future__ import annotations

import inspect
import logging
import os
import shutil
from collections.abc import Awaitable, Callable, Mapping, Sequence
from pathlib import Path
from typing import Any

from ai_anime.director_world import DirectorWorldService
from ai_anime.freezone import canvas_store
from ai_anime.freezone.paths import freezone_root
from ai_anime.models import beat_scene_id
from ai_anime.modules.creative_canvas.application.canvas_assets import (
    CreativeCanvasBeatNotFound,
)
from ai_anime.modules.project_workspace.public import ProjectContext
from ai_anime.shared.infrastructure.project_stores import make_sqlite_store_for_context
from ai_anime.shared.project_media import make_static_url_for_context
from ai_anime.utils.path_resolver import (
    canonical_beat_director_env_only_path,
    canonical_beat_selected_background_path,
    canonical_scene_master_path,
    canonical_scene_reverse_master_path,
)


logger = logging.getLogger(__name__)

StoreFactory = Callable[[ProjectContext], Awaitable[Any]]
StaticUrlBuilder = Callable[[ProjectContext, str, Path | None], str]

DIRECTOR_CAPTURE_FILES: tuple[tuple[str, str, str], ...] = (
    ("combined.png", "director_combined", "3GS 导演合成图"),
    ("selected_background.png", "selected_background", "selected background"),
    ("env_only.png", "director_env", "3GS environment plate"),
    ("env_actor_only.png", "director_env_actor", "3GS actor blocking plate"),
    ("actor_overlay_black.png", "actor_overlay", "actor overlay"),
    ("actor_mask.png", "actor_mask", "actor mask"),
    ("prop_staging_overlay.png", "prop_staging_overlay", "prop/staging overlay"),
    ("prop_staging_mask.png", "prop_staging_mask", "prop/staging mask"),
    ("frame_meta.json", "frame_meta", "3GS frame metadata"),
)


class LocalCreativeCanvasBeatSceneSource:
    def __init__(self, store_factory: StoreFactory | None = None) -> None:
        self._store_factory = store_factory

    async def scene_id(
        self,
        *,
        context: ProjectContext,
        episode: int,
        beat: int,
    ) -> str | None:
        store = await (self._store_factory or make_sqlite_store_for_context)(context)
        try:
            beats = await store.get_beats_as_dicts(episode)
        finally:
            await _close_store(store)
        selected = next(
            (item for item in beats if int(item.get("beat_number") or -1) == beat),
            None,
        )
        if not selected:
            raise CreativeCanvasBeatNotFound(f"beat not found: ep{episode} beat{beat}")
        return beat_scene_id(selected)


class LocalCreativeCanvasDirectorCaptureStorage:
    def __init__(self, static_url_builder: StaticUrlBuilder | None = None) -> None:
        self._static_url_builder = static_url_builder

    def list_files(
        self,
        *,
        context: ProjectContext,
        project_dir: Path,
        episode: int,
        beat: int,
    ) -> Sequence[Mapping[str, Any]]:
        base_dir = self.capture_dir(project_dir, episode, beat)
        base_relative = base_dir.relative_to(project_dir).as_posix()
        files: list[dict[str, Any]] = []
        for filename, role, label in DIRECTOR_CAPTURE_FILES:
            relative_path = f"{base_relative}/{filename}"
            path = base_dir / filename
            exists = path.exists()
            stat = path.stat() if exists else None
            files.append(
                {
                    "filename": filename,
                    "role": role,
                    "label": label,
                    "rel_path": relative_path,
                    "exists": exists,
                    "url": (
                        (self._static_url_builder or make_static_url_for_context)(
                            context,
                            relative_path,
                            path,
                        )
                        if exists
                        else None
                    ),
                    "media_type": (
                        "image"
                        if Path(filename).suffix.lower()
                        in {".png", ".jpg", ".jpeg", ".webp"}
                        else "json"
                    ),
                    "size": stat.st_size if stat else 0,
                    "modified_at": (
                        canvas_store.timestamp_utc_iso(stat.st_mtime) if stat else None
                    ),
                }
            )
        return files

    @staticmethod
    def capture_dir(project_dir: Path, episode: int, beat: int) -> Path:
        return (
            LocalCreativeCanvasDirectorCaptureStorage.control_frames_dir(project_dir)
            / f"ep{episode:03d}"
            / f"beat_{beat:02d}"
        )

    @staticmethod
    def control_frames_dir(project_dir: Path) -> Path:
        return freezone_root(project_dir) / "director_control_frames"

    @staticmethod
    def sync_background(project_dir: Path, episode: int, beat: int) -> bool:
        try:
            env_only_path = canonical_beat_director_env_only_path(
                project_dir,
                episode,
                beat,
            )
            if not env_only_path.is_file():
                return False
            selected_path = canonical_beat_selected_background_path(
                project_dir,
                episode,
                beat,
            )
            env_modified_at = env_only_path.stat().st_mtime
            if (
                selected_path.exists()
                and env_modified_at <= selected_path.stat().st_mtime
            ):
                return False
            selected_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(env_only_path, selected_path)
            os.utime(selected_path, (env_modified_at, env_modified_at))
            logger.info(
                "[director-capture] mirrored env_only to selected_background "
                "ep=%s beat=%s",
                episode,
                beat,
            )
            return True
        except Exception as exc:  # noqa: BLE001 - mirror must not block callers
            logger.warning("[director-capture] env_only mirror failed: %s", exc)
            return False

    def scene_asset_urls(
        self,
        *,
        context: ProjectContext,
        project_dir: Path,
        episode: int,
        beat: int,
        scene_id: str | None,
    ) -> Mapping[str, str | None]:
        def resolve(path: Path | None) -> str | None:
            if path is None or not path.is_file():
                return None
            try:
                relative_path = path.relative_to(project_dir).as_posix()
            except ValueError:
                return None
            return (self._static_url_builder or make_static_url_for_context)(
                context,
                relative_path,
                path,
            )

        urls: dict[str, str | None] = {
            "master_url": None,
            "reverse_url": None,
            "director_env_only_url": resolve(
                canonical_beat_director_env_only_path(project_dir, episode, beat)
            ),
            "pano_360_url": None,
            "ply_url": None,
        }
        if not scene_id:
            return urls
        urls["master_url"] = resolve(canonical_scene_master_path(project_dir, scene_id))
        urls["reverse_url"] = resolve(
            canonical_scene_reverse_master_path(project_dir, scene_id)
        )
        try:
            from ai_anime.director_world import stage_manifest

            urls["pano_360_url"] = resolve(
                stage_manifest.resolve_pano_path(project_dir, scene_id)
            )
            urls["ply_url"] = resolve(
                stage_manifest.resolve_ply_path(project_dir, scene_id)
            )
        except Exception as exc:  # noqa: BLE001 - manifest issues are non-fatal
            logger.warning(
                "scene-assets-for-beat: stage_manifest lookup failed: %s", exc
            )
        return urls


class LocalCreativeCanvasDirectorStageLinkBuilder:
    @staticmethod
    def build(
        *,
        context: ProjectContext,
        project_dir: Path,
        episode: int,
        beat: int,
        scene_id: str,
        control_frames_dir: Path,
    ) -> str | None:
        try:
            return DirectorWorldService(project_dir).make_3gs_editor_url(
                episode=episode,
                scene_id=scene_id,
                slate_beat=beat,
                user=context.owner_username,
                project=context.project_name,
                control_frames_dir=control_frames_dir,
            )
        except Exception as exc:  # noqa: BLE001 - stage links are optional
            logger.warning("failed to build 3GS director stage url: %s", exc)
            return None


async def _close_store(store: Any) -> None:
    close = getattr(store, "close", None)
    if not close:
        return
    closed = close()
    if inspect.isawaitable(closed):
        await closed


__all__ = [
    "LocalCreativeCanvasBeatSceneSource",
    "LocalCreativeCanvasDirectorCaptureStorage",
    "LocalCreativeCanvasDirectorStageLinkBuilder",
]
