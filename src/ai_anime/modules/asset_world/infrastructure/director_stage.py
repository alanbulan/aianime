"""Local Beat Director Stage persistence adapter."""

from __future__ import annotations

import base64
import json
from collections.abc import Mapping
from pathlib import Path
from typing import Any

from ai_anime.modules.asset_world.infrastructure.director_world.paths import (
    beat_blocking_path,
)
from ai_anime.modules.asset_world.infrastructure.director_world.store import (
    load_beat_blocking,
    save_beat_blocking,
)
from ai_anime.modules.asset_world.application.dto import DirectorControlFrameExport
from ai_anime.shared.utils.path_resolver import PathResolver


class LocalBeatDirectorStageFiles:
    def overlay_path(
        self,
        project_dir: Path,
        episode_num: int,
        beat_num: int,
    ) -> Path:
        return beat_blocking_path(project_dir, episode_num, beat_num)

    def load_overlay(
        self,
        project_dir: Path,
        episode_num: int,
        beat_num: int,
    ) -> dict[str, Any] | None:
        return load_beat_blocking(project_dir, episode_num, beat_num)

    def save_overlay(
        self,
        project_dir: Path,
        episode_num: int,
        beat_num: int,
        payload: dict[str, Any],
    ) -> Path:
        return save_beat_blocking(project_dir, episode_num, beat_num, payload)

    def control_frame_path(
        self,
        project_dir: Path,
        episode_num: int,
        beat_num: int,
    ) -> Path:
        return PathResolver(str(project_dir), int(episode_num)).director_render(
            int(beat_num)
        )

    def exists(self, path: Path) -> bool:
        return path.exists()

    def project_relative_path(self, project_dir: Path, path: Path) -> str | None:
        try:
            return path.relative_to(project_dir).as_posix()
        except ValueError:
            return None

    def export_control_frame(
        self,
        project_dir: Path,
        episode_num: int,
        beat_num: int,
        *,
        images: Mapping[str, str],
        meta: Mapping[str, Any],
    ) -> DirectorControlFrameExport:
        target_dir = self.control_frame_path(
            project_dir,
            episode_num,
            beat_num,
        ).parent
        target_dir.mkdir(parents=True, exist_ok=True)
        paths: dict[str, Path] = {}
        relative_paths: dict[str, str] = {}
        for kind, filename in (
            ("combined", "combined.png"),
            ("env_only", "env_only.png"),
        ):
            path = target_dir / filename
            path.write_bytes(self._decode_png_data_url(images[kind]))
            paths[kind] = path
            relative_paths[kind] = path.relative_to(project_dir).as_posix()

        persisted_meta = dict(meta)
        persisted_meta["paths"] = dict(relative_paths)
        meta_path = target_dir / "frame_meta.json"
        meta_path.write_text(
            json.dumps(persisted_meta, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        paths["frame_meta"] = meta_path
        relative_paths["frame_meta"] = meta_path.relative_to(project_dir).as_posix()
        return DirectorControlFrameExport(
            directory=target_dir,
            paths=paths,
            relative_paths=relative_paths,
            meta=persisted_meta,
        )

    @staticmethod
    def _decode_png_data_url(data_url: str) -> bytes:
        prefix = "data:image/png;base64,"
        if not data_url.startswith(prefix):
            raise ValueError("expected PNG data URL")
        return base64.b64decode(data_url[len(prefix) :], validate=True)
