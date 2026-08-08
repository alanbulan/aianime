"""Filesystem reference collection for Creative Canvas presets."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from PIL import Image

from ai_anime.modules.creative_canvas.domain import (
    PresetRef,
    preset_identity_name as _identity_name,
)
from ai_anime.shared.utils.path_resolver import (
    canonical_identity_path,
    canonical_portrait_path,
    canonical_prop_reference_path,
    canonical_scene_master_path,
    canonical_scene_reverse_master_path,
)
from ai_anime.shared.utils.static_urls import project_static_url

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp"}
VIDEO_EXTS = {".mp4", ".mov", ".webm"}
AUDIO_EXTS = {".mp3", ".m4a", ".wav", ".aac", ".flac", ".ogg"}
TEXT_EXTS = {".json", ".txt", ".md"}


def _make_url(project_id: str, project_dir: Path, rel_path: str) -> str:
    if not project_id:
        raise ValueError("project_id is required for preset static URLs")
    return project_static_url(project_id, rel_path, local_path=project_dir / rel_path)


def _path_rel_if_inside(project_dir: Path, path: Path) -> str | None:
    try:
        return path.relative_to(project_dir).as_posix()
    except ValueError:
        return None


def _rel(project_dir: Path, path: Path) -> str:
    return path.relative_to(project_dir).as_posix()


def _greatest_common_divisor(a: int, b: int) -> int:
    x = abs(int(a))
    y = abs(int(b))
    while y:
        x, y = y, x % y
    return x or 1


def _image_aspect_ratio(path: Path) -> str:
    if not path.exists() or path.suffix.lower() not in IMAGE_EXTS:
        return "1:1"
    try:
        with Image.open(path) as image:
            width, height = image.size
    except Exception:
        return "1:1"
    if width <= 0 or height <= 0:
        return "1:1"
    gcd = _greatest_common_divisor(width, height)
    return f"{round(width / gcd)}:{round(height / gcd)}"


def _media_type_for_path(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix in IMAGE_EXTS:
        return "image"
    if suffix in VIDEO_EXTS:
        return "video"
    if suffix in AUDIO_EXTS:
        return "audio"
    if suffix in TEXT_EXTS:
        return "text"
    return "file"


def _aspect_ratio_for_ref(path: Path) -> str:
    media_type = _media_type_for_path(path)
    if media_type == "image":
        return _image_aspect_ratio(path)
    if media_type == "video":
        # Avoid probing video during canvas creation; frontend can refine from
        # metadata after loading, while 16:9 is the common ai_anime beat slot.
        return "16:9"
    return "1:1"


def _add_file_ref(
    refs: list[PresetRef],
    *,
    project_id: str,
    username: str,
    project: str,
    project_dir: Path,
    kind: str,
    role: str,
    label: str,
    rel_path: str,
    required: bool = False,
    placeholder_aspect_ratio: str | None = None,
    meta: dict[str, Any] | None = None,
) -> None:
    path = project_dir / rel_path
    exists = path.exists()
    if not exists and not required:
        return
    refs.append(
        PresetRef(
            kind=kind,
            role=role,
            label=label,
            rel_path=rel_path,
            url=_make_url(project_id, project_dir, rel_path) if exists else None,
            exists=exists,
            media_type=_media_type_for_path(path),
            aspect_ratio=(
                _aspect_ratio_for_ref(path)
                if exists
                else (placeholder_aspect_ratio or _aspect_ratio_for_ref(path))
            ),
            meta=meta or {},
        )
    )


def _add_character_refs(
    refs: list[PresetRef],
    *,
    project_id: str,
    username: str,
    project: str,
    project_dir: Path,
    character: str,
    identity_id: str | None,
) -> None:
    if not character:
        return
    if identity_id:
        _add_file_ref(
            refs,
            project_id=project_id,
            username=username,
            project=project,
            project_dir=project_dir,
            kind="identity",
            role="character_identity",
            label=identity_id,
            rel_path=_rel(
                project_dir,
                canonical_identity_path(
                    project_dir,
                    character,
                    _identity_name(identity_id, character),
                ),
            ),
            required=True,
            meta={"character": character, "identity_id": identity_id},
        )
    _add_file_ref(
        refs,
        project_id=project_id,
        username=username,
        project=project,
        project_dir=project_dir,
        kind="identity",
        role="character_portrait",
        label=f"{character} portrait",
        rel_path=_rel(project_dir, canonical_portrait_path(project_dir, character)),
        meta={"character": character},
    )


def _add_character_identity_ref(
    refs: list[PresetRef],
    *,
    project_id: str,
    username: str,
    project: str,
    project_dir: Path,
    character: str,
    identity_id: str,
) -> None:
    if not character or not identity_id:
        return
    _add_file_ref(
        refs,
        project_id=project_id,
        username=username,
        project=project,
        project_dir=project_dir,
        kind="identity",
        role="character_identity",
        label=identity_id,
        rel_path=_rel(
            project_dir,
            canonical_identity_path(
                project_dir,
                character,
                _identity_name(identity_id, character),
            ),
        ),
        required=True,
        meta={"character": character, "identity_id": identity_id},
    )


def _add_mainline_identity_ref(
    refs: list[PresetRef],
    *,
    project_id: str,
    username: str,
    project: str,
    project_dir: Path,
    character: str,
    identity_id: str,
    include_portrait_fallback: bool = True,
) -> None:
    """Add the single identity image consumed by EP/Beat mainline canvases.

    Asset canvases may expose portrait/identity as separate production
    steps. EP/Beat canvases only consume the selected identity concept; if the
    canonical identity file is missing, a portrait file can visually stand in
    for that identity without changing the semantic role.

    `include_portrait_fallback`: when False, no fallback to portrait /
    reference images — if the canonical identity image is missing, no node is
    emitted. EP-scope canvas uses this to avoid surfacing portrait nodes for
    identities that haven't been generated yet (users found portrait stand-ins
    confusing at the EP scope). Beat workbench keeps the fallback on so the
    workflow always has *some* image to anchor against.
    """
    if not character or not identity_id:
        return
    canonical_path = canonical_identity_path(
        project_dir,
        character,
        _identity_name(identity_id, character),
    )
    candidates: list[tuple[Path, str]] = [(canonical_path, "character_identity")]
    if include_portrait_fallback:
        candidates.append(
            (canonical_portrait_path(project_dir, character), "character_portrait")
        )
    for path, source_role in candidates:
        if not path.exists():
            continue
        _add_file_ref(
            refs,
            project_id=project_id,
            username=username,
            project=project,
            project_dir=project_dir,
            kind="identity",
            role="character_identity",
            label=identity_id,
            rel_path=_rel(project_dir, path),
            meta={
                "character": character,
                "identity_id": identity_id,
                "source_role": source_role,
            },
        )
        return


def _add_prop_refs(
    refs: list[PresetRef],
    *,
    project_id: str,
    username: str,
    project: str,
    project_dir: Path,
    prop_id: str,
    meta: dict[str, Any],
) -> None:
    if not prop_id:
        return
    canonical = canonical_prop_reference_path(project_dir, prop_id)
    _add_file_ref(
        refs,
        project_id=project_id,
        username=username,
        project=project,
        project_dir=project_dir,
        kind="prop",
        role="prop_reference",
        label=prop_id,
        rel_path=_rel(project_dir, canonical),
        required=True,
        placeholder_aspect_ratio="1:1",
        meta=meta,
    )


def _add_selected_background_ref(
    refs: list[PresetRef],
    *,
    project_id: str,
    username: str,
    project: str,
    project_dir: Path,
    episode: int,
    beat: int,
    scene_id: str = "",
) -> None:
    ep_dir = f"ep{episode:03d}"
    beat_dir = f"beat_{beat:02d}"
    _add_file_ref(
        refs,
        project_id=project_id,
        username=username,
        project=project,
        project_dir=project_dir,
        kind="director",
        role="selected_background",
        label=f"当前背景 · Beat {beat}",
        rel_path=f"director_control_frames/{ep_dir}/{beat_dir}/selected_background.png",
        meta={"episode": episode, "beat": beat, "scene_id": scene_id},
    )


def _add_scene_refs(
    refs: list[PresetRef],
    *,
    project_id: str,
    username: str,
    project: str,
    project_dir: Path,
    scene_name: str,
    scene_info: dict[str, Any] | None = None,
    include_derived_assets: bool = True,
) -> None:
    if not scene_name:
        return
    scene_info = scene_info or {}
    effective_environment_prompt = str(
        scene_info.get("effective_environment_prompt")
        or scene_info.get("environment_prompt")
        or ""
    ).strip()
    scene_meta = {
        "scene": scene_name,
        "environment_prompt": effective_environment_prompt,
        "raw_environment_prompt": str(
            scene_info.get("environment_prompt") or ""
        ).strip(),
        "variant_prompt": str(scene_info.get("variant_prompt") or "").strip(),
        "base_scene_id": str(scene_info.get("base_scene_id") or "").strip(),
        "base_master_url": str(scene_info.get("base_master_url") or "").strip(),
        "base_master_rel_path": str(
            scene_info.get("base_master_rel_path") or ""
        ).strip(),
        "base_environment_prompt": str(
            scene_info.get("base_environment_prompt") or ""
        ).strip(),
        "base_description": str(scene_info.get("base_description") or "").strip(),
        "base_scene_type": str(scene_info.get("base_scene_type") or "").strip(),
        "variant_id": str(scene_info.get("variant_id") or "").strip(),
        "time_of_day": str(scene_info.get("time_of_day") or "").strip(),
        "description": str(scene_info.get("description") or "").strip(),
        "scene_type": str(scene_info.get("scene_type") or "").strip(),
        "style_name": str(scene_info.get("style_name") or "").strip(),
        "style_prompt": str(scene_info.get("style_prompt") or "").strip(),
        "avoid_instructions": str(scene_info.get("avoid_instructions") or "").strip(),
    }
    director_pano_path: Path | None = None
    director_ply_paths: list[tuple[Path, str, str, str]] = []
    if include_derived_assets:
        try:
            from ai_anime.modules.asset_world.public import stage_manifest

            director_pano_path = stage_manifest.resolve_pano_path(
                project_dir,
                scene_name,
            ) or (stage_manifest.stage_dir(project_dir, scene_name) / "pano_360.png")
            seen_ply_paths: set[str] = set()
            for ply_kind, role, label in [
                ("master", "scene_3gs_master_ply", f"{scene_name} 3D 世界（正面）"),
                ("reverse", "scene_3gs_reverse_ply", f"{scene_name} 3D 世界（背面）"),
                ("pano", "scene_3gs_pano_ply", f"{scene_name} 3D 世界（360）"),
            ]:
                path = stage_manifest.resolve_ply_path(
                    project_dir, scene_name, ply_kind=ply_kind
                )
                if path is None:
                    continue
                rel = _rel(project_dir, path)
                if rel in seen_ply_paths:
                    continue
                seen_ply_paths.add(rel)
                director_ply_paths.append((path, role, label, ply_kind))
        except Exception:
            director_pano_path = None
            director_ply_paths = []
    # scene_360 is the direct panorama workflow/slot. Assets > Scenes uses
    # scene_director_pano_360 as the canonical director-world pano, so the
    # preset intentionally does not emit scene_360 as a mainline scene asset.
    # The direct-360 workflow itself remains available through freezone.scene_360
    # and scene_360_candidate outputs.
    for path, role, label, required, placeholder_aspect_ratio in [
        (
            canonical_scene_master_path(project_dir, scene_name),
            "scene_master",
            f"{scene_name} master",
            True,
            "16:9",
        ),
        (
            canonical_scene_reverse_master_path(project_dir, scene_name),
            "scene_reverse_master",
            f"{scene_name} reverse master",
            True,
            "16:9",
        ),
        (
            director_pano_path,
            "scene_director_pano_360",
            f"{scene_name} director pano 360",
            True,
            "2:1",
        ),
    ]:
        if path is None:
            continue
        if not include_derived_assets and role == "scene_director_pano_360":
            continue
        _add_file_ref(
            refs,
            project_id=project_id,
            username=username,
            project=project,
            project_dir=project_dir,
            kind="scene",
            role=role,
            label=label,
            rel_path=_rel(project_dir, path),
            required=required,
            placeholder_aspect_ratio=placeholder_aspect_ratio,
            meta={**scene_meta, "scene_id": scene_name},
        )
    for path, role, label, ply_kind in director_ply_paths:
        _add_file_ref(
            refs,
            project_id=project_id,
            username=username,
            project=project,
            project_dir=project_dir,
            kind="scene",
            role=role,
            label=label,
            rel_path=_rel(project_dir, path),
            meta={**scene_meta, "scene_id": scene_name, "ply_kind": ply_kind},
        )
