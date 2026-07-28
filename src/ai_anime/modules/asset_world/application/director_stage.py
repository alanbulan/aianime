"""Beat Director Stage application use cases."""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ai_anime.modules.narrative_planning.public import beat_scene_id
from ai_anime.modules.asset_world.application.dto import (
    ExportBeatDirectorControlFrameCommand,
    SaveBeatDirectorOverlayCommand,
)
from ai_anime.modules.asset_world.application.errors import SceneViewerRejected
from ai_anime.modules.asset_world.application.ports import (
    BeatAssetWriter,
    BeatDirectorStageFiles,
    BeatDirectorStageRepository,
)
from ai_anime.modules.asset_world.domain.director_stage import (
    director_control_frame_meta,
    director_control_scope,
    director_overlay_payload,
    overlay_detected_props,
    same_scene_beat_options,
)

AssetUrl = Callable[[Path], str]


def resolve_beat_scene_name(beat: Mapping[str, Any]) -> str:
    return str(beat_scene_id(beat) or beat.get("location") or "").strip()


class BeatDirectorStageUseCases:
    def __init__(self, files: BeatDirectorStageFiles) -> None:
        self._files = files

    def control_frame_status(
        self,
        *,
        project_dir: Path,
        episode_num: int,
        beat_num: int,
        asset_url: AssetUrl,
    ) -> dict[str, Any]:
        control_frame = self._files.control_frame_path(
            project_dir,
            episode_num,
            beat_num,
        )
        ready = self._files.exists(control_frame)
        rel_path = (
            self._files.project_relative_path(project_dir, control_frame)
            if ready
            else None
        )
        return {
            "episode": int(episode_num),
            "beat_num": int(beat_num),
            "ready": ready,
            "path": control_frame.as_posix(),
            "rel_path": rel_path,
            "url": asset_url(control_frame) if rel_path else None,
            "scope": director_control_scope(episode_num, beat_num),
        }

    async def load_overlay(
        self,
        *,
        repository: BeatDirectorStageRepository,
        project_dir: Path,
        episode_num: int,
        beat_num: int,
        scene_name: str,
    ) -> dict[str, Any]:
        path = self._files.overlay_path(project_dir, episode_num, beat_num)
        beats = await repository.get_beats_as_dicts(int(episode_num))
        same_scene = self._same_scene_beats(beats, scene_name)
        current = self._files.load_overlay(project_dir, episode_num, beat_num)
        if current:
            return {
                "status": "current",
                "overlay": current,
                "path": path.as_posix(),
                "same_scene_beats": same_scene,
            }

        inherited: dict[str, Any] | None = None
        inherited_from: int | None = None
        for item in same_scene:
            candidate_beat = int(item["beat"])
            if candidate_beat >= int(beat_num):
                continue
            candidate = self._files.load_overlay(
                project_dir,
                episode_num,
                candidate_beat,
            )
            if candidate:
                inherited = candidate
                inherited_from = candidate_beat
        if inherited:
            return {
                "status": "inherited",
                "overlay": inherited,
                "path": path.as_posix(),
                "inherited_from_beat": inherited_from,
                "same_scene_beats": same_scene,
            }
        return {
            "status": "missing",
            "overlay": None,
            "path": path.as_posix(),
            "same_scene_beats": same_scene,
        }

    async def save_overlay(
        self,
        *,
        repository: BeatDirectorStageRepository,
        asset_writer: BeatAssetWriter | None,
        project_dir: Path,
        episode_num: int,
        beat_num: int,
        scene_name: str,
        beat: Mapping[str, Any],
        command: SaveBeatDirectorOverlayCommand,
    ) -> dict[str, Any]:
        payload = director_overlay_payload(
            episode_num=episode_num,
            beat_num=beat_num,
            scene_name=scene_name,
            beat=beat,
            frame_aspect=command.frame_aspect,
            source=command.source,
            frame_meta=command.frame_meta,
            snapshot=command.snapshot,
            camera=command.camera,
            actors=command.actors,
            props=command.props,
            stagings=command.stagings,
            command_log=command.command_log,
            deleted_keys=command.deleted_keys,
            saved_at=datetime.now(timezone.utc).isoformat(),
        )
        path = self._files.save_overlay(
            project_dir,
            episode_num,
            beat_num,
            payload,
        )
        if asset_writer is not None:
            await asset_writer.update_beat_asset(
                episode_number=int(episode_num),
                beat_number=int(beat_num),
                detected_props=overlay_detected_props(payload),
            )
        beats = await repository.get_beats_as_dicts(int(episode_num))
        return {
            "status": "saved",
            "overlay": payload,
            "path": path.as_posix(),
            "same_scene_beats": self._same_scene_beats(beats, scene_name),
        }

    def export_control_frame(
        self,
        *,
        project_dir: Path,
        scene_name: str,
        episode_num: int,
        beat_num: int,
        command: ExportBeatDirectorControlFrameCommand,
        asset_url: AssetUrl,
    ) -> dict[str, Any]:
        images = command.images if isinstance(command.images, dict) else {}
        submitted_meta = command.frame_meta
        if not isinstance(submitted_meta, dict) or not submitted_meta:
            raise SceneViewerRejected("combined, env_only and frame_meta are required")
        if any(
            not isinstance(images.get(kind), str) or not images.get(kind)
            for kind in ("combined", "env_only")
        ):
            raise SceneViewerRejected("combined, env_only and frame_meta are required")

        meta = director_control_frame_meta(
            submitted_meta=submitted_meta,
            scene_name=scene_name,
            episode_num=episode_num,
            beat_num=beat_num,
            frame_aspect=command.frame_aspect,
            snapshot=command.snapshot,
            actors=command.actors,
            props=command.props,
            stagings=command.stagings,
        )
        try:
            exported = self._files.export_control_frame(
                project_dir,
                episode_num,
                beat_num,
                images={kind: str(images[kind]) for kind in ("combined", "env_only")},
                meta=meta,
            )
        except (TypeError, ValueError) as exc:
            raise SceneViewerRejected(str(exc)) from exc

        paths = {kind: path.as_posix() for kind, path in exported.paths.items()}
        urls = {kind: asset_url(path) for kind, path in exported.paths.items()}
        return {
            "dir": exported.directory.as_posix(),
            "paths": paths,
            "rel_paths": dict(exported.relative_paths),
            "urls": urls,
            "meta": dict(exported.meta),
        }

    @staticmethod
    def _same_scene_beats(
        beats: Sequence[Mapping[str, Any]],
        scene_name: str,
    ) -> list[dict[str, Any]]:
        beat_scenes: list[tuple[int, str]] = []
        for beat in beats:
            beat_number = (
                beat.get("beat_number") or beat.get("beat") or beat.get("number")
            )
            try:
                normalized_beat = int(beat_number)
            except (TypeError, ValueError):
                continue
            beat_scenes.append((normalized_beat, resolve_beat_scene_name(beat)))
        return same_scene_beat_options(beat_scenes, scene_name)
