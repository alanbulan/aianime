"""Creative Canvas canonical asset-slot contracts."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Union


@dataclass(frozen=True, slots=True)
class FrameTarget:
    episode: int
    beat: int
    kind: Literal["frame"] = "frame"


@dataclass(frozen=True, slots=True)
class SketchTarget:
    episode: int
    beat: int
    kind: Literal["sketch"] = "sketch"


@dataclass(frozen=True, slots=True)
class DirectorRenderTarget:
    episode: int
    beat: int
    kind: Literal["director_render"] = "director_render"


@dataclass(frozen=True, slots=True)
class SelectedBackgroundTarget:
    episode: int
    beat: int
    kind: Literal["selected_background"] = "selected_background"


@dataclass(frozen=True, slots=True)
class IdentityTarget:
    character: str
    identity_id: str
    kind: Literal["identity"] = "identity"


@dataclass(frozen=True, slots=True)
class IdentityCostumeTarget:
    character: str
    identity_id: str
    kind: Literal["identity_costume"] = "identity_costume"


@dataclass(frozen=True, slots=True)
class IdentityPortraitTarget:
    character: str
    identity_id: str
    kind: Literal["identity_portrait"] = "identity_portrait"


@dataclass(frozen=True, slots=True)
class PortraitTarget:
    character: str
    kind: Literal["portrait"] = "portrait"


@dataclass(frozen=True, slots=True)
class SceneMasterTarget:
    scene_id: str
    kind: Literal["scene_master"] = "scene_master"


@dataclass(frozen=True, slots=True)
class Scene360Target:
    scene_id: str
    kind: Literal["scene_360"] = "scene_360"


@dataclass(frozen=True, slots=True)
class SceneReverseMasterTarget:
    scene_id: str
    kind: Literal["scene_reverse_master"] = "scene_reverse_master"


@dataclass(frozen=True, slots=True)
class SceneSpatialLayoutTarget:
    scene_id: str
    kind: Literal["scene_spatial_layout"] = "scene_spatial_layout"


@dataclass(frozen=True, slots=True)
class SceneDirectorPano360Target:
    scene_id: str
    kind: Literal["scene_director_pano_360"] = "scene_director_pano_360"


@dataclass(frozen=True, slots=True)
class Scene3gsActivePlyTarget:
    scene_id: str
    kind: Literal["scene_3gs_active_ply"] = "scene_3gs_active_ply"


@dataclass(frozen=True, slots=True)
class Scene3gsMasterPlyTarget:
    scene_id: str
    kind: Literal["scene_3gs_master_ply"] = "scene_3gs_master_ply"


@dataclass(frozen=True, slots=True)
class Scene3gsReversePlyTarget:
    scene_id: str
    kind: Literal["scene_3gs_reverse_ply"] = "scene_3gs_reverse_ply"


@dataclass(frozen=True, slots=True)
class Scene3gsPanoPlyTarget:
    scene_id: str
    kind: Literal["scene_3gs_pano_ply"] = "scene_3gs_pano_ply"


@dataclass(frozen=True, slots=True)
class Scene3gsCustomSceneTarget:
    scene_id: str
    kind: Literal["scene_3gs_custom_scene"] = "scene_3gs_custom_scene"


@dataclass(frozen=True, slots=True)
class Scene3gsCollisionGlbTarget:
    scene_id: str
    kind: Literal["scene_3gs_collision_glb"] = "scene_3gs_collision_glb"


@dataclass(frozen=True, slots=True)
class PropRefTarget:
    prop_id: str
    kind: Literal["prop_ref"] = "prop_ref"


@dataclass(frozen=True, slots=True)
class VideoTarget:
    episode: int
    beat: int
    kind: Literal["video"] = "video"


@dataclass(frozen=True, slots=True)
class BeatAudioTarget:
    episode: int
    beat: int
    kind: Literal["beat_audio"] = "beat_audio"


SlotTarget = Union[
    FrameTarget,
    SketchTarget,
    DirectorRenderTarget,
    SelectedBackgroundTarget,
    IdentityTarget,
    IdentityCostumeTarget,
    IdentityPortraitTarget,
    PortraitTarget,
    SceneMasterTarget,
    Scene360Target,
    SceneReverseMasterTarget,
    SceneSpatialLayoutTarget,
    SceneDirectorPano360Target,
    Scene3gsActivePlyTarget,
    Scene3gsMasterPlyTarget,
    Scene3gsReversePlyTarget,
    Scene3gsPanoPlyTarget,
    Scene3gsCustomSceneTarget,
    Scene3gsCollisionGlbTarget,
    PropRefTarget,
    VideoTarget,
    BeatAudioTarget,
]

IMAGE_SUFFIXES = frozenset({".png", ".jpg", ".jpeg", ".webp"})
VIDEO_SUFFIXES = frozenset({".mp4", ".mov", ".webm"})
AUDIO_SUFFIXES = frozenset(
    {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".webm", ".flac", ".opus"}
)
SPLAT_PACKAGE_SUFFIXES = frozenset({".ply", ".sog", ".splat", ".ksplat"})
SCENE_PACKAGE_SUFFIXES = SPLAT_PACKAGE_SUFFIXES
GLB_SUFFIXES = frozenset({".glb"})

SCENE_3GS_PLY_TARGETS = {
    "scene_3gs_active_ply": ("active", "active.sog"),
    "scene_3gs_master_ply": ("master", "master_sharp.sog"),
    "scene_3gs_reverse_ply": ("reverse", "reverse_sharp.sog"),
    "scene_3gs_pano_ply": ("pano", "pano_depth.sog"),
    "scene_3gs_custom_scene": ("custom", "custom.sog"),
}


def validate_source_for_slot(source_path: Path, target: SlotTarget) -> None:
    """Reject media whose file type does not match the canonical slot."""
    suffix = source_path.suffix.lower()
    if target.kind == "video":
        if suffix not in VIDEO_SUFFIXES:
            raise ValueError("video slot requires a video source file")
        return
    if target.kind == "beat_audio":
        if suffix not in AUDIO_SUFFIXES:
            raise ValueError("beat_audio slot requires an audio source file")
        return
    if target.kind in SCENE_3GS_PLY_TARGETS:
        allowed_suffixes = (
            SCENE_PACKAGE_SUFFIXES
            if target.kind == "scene_3gs_custom_scene"
            else SPLAT_PACKAGE_SUFFIXES
        )
        if suffix not in allowed_suffixes:
            raise ValueError(
                f"{target.kind} slot requires a 3GS package source file"
            )
        return
    if target.kind == "scene_3gs_collision_glb":
        if suffix not in GLB_SUFFIXES:
            raise ValueError("scene_3gs_collision_glb slot requires a GLB source file")
        return
    if suffix not in IMAGE_SUFFIXES:
        raise ValueError(f"{target.kind} slot requires an image source file")
