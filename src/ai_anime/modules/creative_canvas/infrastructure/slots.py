"""Creative Canvas canonical asset-slot persistence."""

from __future__ import annotations

import shutil
from datetime import datetime
from pathlib import Path

from ai_anime.modules.creative_canvas.domain.slot_targets import (
    SCENE_3GS_PLY_TARGETS,
    SlotTarget,
)
from ai_anime.shared.utils.path_resolver import (
    PathResolver,
    canonical_beat_selected_background_path,
    canonical_identity_costume_path,
    canonical_identity_path,
    canonical_identity_portrait_path,
    canonical_portrait_path,
    canonical_prop_reference_path,
    canonical_scene_360_path,
    canonical_scene_master_path,
    canonical_scene_reverse_master_path,
    canonical_scene_spatial_layout_path,
)


def slot_target_path(project_dir: Path, target: SlotTarget) -> Path:
    """Return the canonical filesystem path for a slot target."""
    if target.kind == "frame":
        return PathResolver(str(project_dir), target.episode).frame(target.beat)
    if target.kind == "sketch":
        return PathResolver(str(project_dir), target.episode).sketch(target.beat)
    if target.kind == "director_render":
        return PathResolver(str(project_dir), target.episode).director_render(
            target.beat
        )
    if target.kind == "selected_background":
        return canonical_beat_selected_background_path(
            project_dir,
            target.episode,
            target.beat,
        )
    if target.kind == "identity":
        return canonical_identity_path(
            project_dir,
            target.character,
            target.identity_id,
        )
    if target.kind == "identity_costume":
        return canonical_identity_costume_path(
            project_dir,
            target.character,
            target.identity_id,
        )
    if target.kind == "identity_portrait":
        return canonical_identity_portrait_path(
            project_dir,
            target.character,
            target.identity_id,
        )
    if target.kind == "portrait":
        return canonical_portrait_path(project_dir, target.character)
    if target.kind == "scene_master":
        return canonical_scene_master_path(project_dir, target.scene_id)
    if target.kind == "scene_360":
        return canonical_scene_360_path(project_dir, target.scene_id)
    if target.kind == "scene_reverse_master":
        return canonical_scene_reverse_master_path(project_dir, target.scene_id)
    if target.kind == "scene_spatial_layout":
        return canonical_scene_spatial_layout_path(project_dir, target.scene_id)
    if target.kind == "scene_director_pano_360":
        from ai_anime.modules.asset_world.public import stage_manifest

        existing = stage_manifest.resolve_pano_path(project_dir, target.scene_id)
        return existing or (
            stage_manifest.stage_dir(project_dir, target.scene_id) / "pano_360.png"
        )
    if target.kind in SCENE_3GS_PLY_TARGETS:
        from ai_anime.modules.asset_world.public import stage_manifest

        ply_kind, default_name = SCENE_3GS_PLY_TARGETS[target.kind]
        existing = stage_manifest.resolve_ply_path(
            project_dir,
            target.scene_id,
            ply_kind=ply_kind,
        )
        return existing or (
            stage_manifest.stage_dir(project_dir, target.scene_id) / default_name
        )
    if target.kind == "scene_3gs_collision_glb":
        from ai_anime.modules.asset_world.public import stage_manifest

        existing = stage_manifest.resolve_collision_glb_path(
            project_dir,
            target.scene_id,
        )
        return existing or (
            stage_manifest.stage_dir(project_dir, target.scene_id)
            / "scene.collision.glb"
        )
    if target.kind == "prop_ref":
        return canonical_prop_reference_path(project_dir, target.prop_id)
    if target.kind == "video":
        return PathResolver(str(project_dir), target.episode).video(target.beat)
    if target.kind == "beat_audio":
        return PathResolver(str(project_dir), target.episode).audio(target.beat)
    raise ValueError(f"unknown slot target kind: {target}")


def backup_slot_if_exists(target: Path) -> Path | None:
    if not target.exists():
        return None
    backup_dir = target.parent / "_history"
    backup_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup = backup_dir / f"{target.name}.{timestamp}.bak"
    shutil.copy2(target, backup)
    return backup


def sync_slot_after_write(
    project_dir: Path,
    target: SlotTarget,
    target_path: Path,
) -> None:
    """Update sidecar manifests for canonical scene slots."""
    if (
        target.kind != "scene_director_pano_360"
        and target.kind not in SCENE_3GS_PLY_TARGETS
        and target.kind != "scene_3gs_collision_glb"
    ):
        return

    from ai_anime.modules.asset_world.public import stage_manifest

    relative_name = target_path.name
    if target.kind == "scene_director_pano_360":
        stage_manifest.update_manifest(
            project_dir,
            target.scene_id,
            source="freezone_commit",
            pano_path=relative_name,
        )
        return
    if target.kind == "scene_3gs_collision_glb":
        stage_manifest.update_manifest(
            project_dir,
            target.scene_id,
            source="freezone_commit",
            collision_glb_path=relative_name,
        )
        return

    ply_kind, _default_name = SCENE_3GS_PLY_TARGETS[target.kind]
    field_by_kind = {
        "active": "ply_path",
        "master": "master_ply_path",
        "reverse": "reverse_ply_path",
        "pano": "pano_ply_path",
        "custom": "custom_scene_path",
    }
    field = field_by_kind[ply_kind]
    updates = {"source": "freezone_commit", field: relative_name}
    if ply_kind == "active":
        updates["ply_path"] = relative_name
    stage_manifest.update_manifest(project_dir, target.scene_id, **updates)
