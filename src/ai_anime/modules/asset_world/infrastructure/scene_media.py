"""Local storage for scene master, panorama, and custom-package media."""

from __future__ import annotations

import io
import shutil
import tempfile
import time
from pathlib import Path
from typing import Any, BinaryIO

from PIL import Image

from ai_anime.modules.asset_world.application.errors import InvalidSceneMediaInput
from ai_anime.modules.asset_world.infrastructure.director_world import stage_manifest
from ai_anime.shared.utils.path_resolver import (
    canonical_scene_master_path,
    compute_scene_master_path,
)


def _decoded_rgb(content: bytes) -> Image.Image:
    try:
        return Image.open(io.BytesIO(content)).convert("RGB")
    except Exception as exc:
        raise InvalidSceneMediaInput(f"Invalid image file: {exc}") from exc


class LocalSceneMediaFiles:
    def save_master(
        self,
        project_dir: Path,
        scene_name: str,
        content: bytes,
    ) -> Path:
        image = _decoded_rgb(content)
        target = canonical_scene_master_path(project_dir, scene_name)
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists():
            target.replace(target.parent / f"master_{int(time.time())}.png")
        image.save(target, format="PNG")
        return target

    def delete_master(self, project_dir: Path, scene_name: str) -> bool:
        resolved = compute_scene_master_path(project_dir, scene_name)
        if not resolved:
            return False
        Path(resolved).unlink(missing_ok=True)
        return True

    def save_pano(
        self,
        project_dir: Path,
        scene_name: str,
        content: bytes,
    ) -> Path:
        image = _decoded_rgb(content)
        width, height = image.size
        if height <= 0 or abs((width / height) - 2.0) > 0.08:
            raise InvalidSceneMediaInput(
                "360 panorama must be close to 2:1 equirectangular; "
                f"got {width}x{height}"
            )

        out_dir = stage_manifest.stage_dir(project_dir, scene_name)
        out_dir.mkdir(parents=True, exist_ok=True)
        target = out_dir / "pano_360.png"
        if target.exists():
            target.replace(out_dir / f"pano_360_{int(time.time())}.png")
        image.save(target, format="PNG")
        stage_manifest.update_manifest(
            project_dir,
            scene_name,
            clear_fields=[
                "ply_path",
                "collision_glb_path",
                "voxel_json_path",
                "pano_sharp_args",
                "splat_transform_args",
            ],
            pano_path=target.name,
            source="uploaded_360",
        )
        return target

    def delete_pano(self, project_dir: Path, scene_name: str) -> bool:
        target = stage_manifest.resolve_pano_path(project_dir, scene_name)
        deleted = target is not None
        if target is not None:
            target.unlink(missing_ok=True)
        stage_manifest.update_manifest(
            project_dir,
            scene_name,
            clear_fields=[
                "source",
                "pano_path",
                "ply_path",
                "collision_glb_path",
                "voxel_json_path",
                "pano_sharp_args",
                "splat_transform_args",
            ],
        )
        return deleted

    def save_custom_package(
        self,
        project_dir: Path,
        scene_name: str,
        suffix: str,
        stream: BinaryIO,
    ) -> dict[str, Any]:
        tmp_path: Path | None = None
        try:
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
                tmp_path = Path(tmp.name)
                try:
                    stream.seek(0)
                except (AttributeError, OSError):
                    pass
                shutil.copyfileobj(stream, tmp)
                size = tmp.tell()
            if size == 0:
                raise InvalidSceneMediaInput("Custom scene package is empty")

            from ai_anime.modules.asset_world.infrastructure.director_world.scene_package_tasks import (
                upload_scene_package,
            )

            return upload_scene_package(
                project_dir,
                scene_name,
                tmp_path,
            )
        finally:
            if tmp_path is not None:
                tmp_path.unlink(missing_ok=True)

    def delete_custom_package(self, project_dir: Path, scene_name: str) -> bool:
        custom_path = stage_manifest.resolve_ply_path(
            project_dir,
            scene_name,
            ply_kind="custom",
        )
        active_path = stage_manifest.resolve_ply_path(project_dir, scene_name)
        deleted = custom_path is not None
        if custom_path is not None:
            custom_path.unlink(missing_ok=True)

        clear_fields = ["custom_scene_path"]
        manifest = stage_manifest.load_manifest(project_dir, scene_name) or {}
        if manifest.get("source") == "custom_scene" or (
            custom_path is not None
            and active_path is not None
            and custom_path.resolve() == active_path.resolve()
        ):
            clear_fields.extend(
                [
                    "source",
                    "ply_path",
                    "collision_glb_path",
                    "voxel_json_path",
                    "splat_transform_args",
                ]
            )
        stage_manifest.update_manifest(
            project_dir,
            scene_name,
            clear_fields=clear_fields,
        )
        return deleted
