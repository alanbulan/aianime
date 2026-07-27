"""Creative Canvas image-to-3GS planning rules."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Literal

CreativeCanvasImageToThreeGsSourceKind = Literal["master", "reverse", "pano"]
SUPPORTED_IMAGE_TO_THREE_GS_SUFFIXES = frozenset({".png", ".jpg", ".jpeg", ".webp"})


class InvalidCreativeCanvasImageToThreeGsSource(ValueError):
    pass


@dataclass(frozen=True)
class CreativeCanvasImageToThreeGsPlan:
    scene_id: str
    source_kind: CreativeCanvasImageToThreeGsSourceKind
    step: str
    params: dict[str, object]


def infer_image_to_three_gs_scene_id(source_path: Path, project_dir: Path) -> str:
    try:
        parts = source_path.resolve().relative_to(project_dir.resolve()).parts
    except ValueError:
        parts = source_path.parts
    for marker in ("scenes", "director_worlds"):
        if marker in parts:
            index = parts.index(marker)
            if index + 1 < len(parts):
                return str(parts[index + 1]).strip()
    return source_path.stem or "freezone"


def plan_image_to_three_gs(
    *,
    source_path: Path,
    project_dir: Path,
    source_url: str,
    source_kind: CreativeCanvasImageToThreeGsSourceKind,
) -> CreativeCanvasImageToThreeGsPlan:
    if source_path.suffix.lower() not in SUPPORTED_IMAGE_TO_THREE_GS_SUFFIXES:
        raise InvalidCreativeCanvasImageToThreeGsSource(
            f"source must be an image: {source_path}"
        )

    common_params: dict[str, object] = {
        "device": "auto",
        "face_size": 768,
        "internal_size": 1536,
        "max_gaussians_per_face": 1_000_000,
        "timeout_seconds": 1800,
        "source_url": source_url,
    }
    if source_kind == "pano":
        params = {
            "pano_path": source_path.as_posix(),
            "depth_source": "da2",
            "depth_device": "auto",
            **common_params,
        }
        step = "pano_sharp"
    else:
        params = {
            "image_path": source_path.as_posix(),
            "source_kind": source_kind,
            "face_name": "front",
            "depth_meters": 8.0,
            **common_params,
        }
        step = "single_face_sharp"

    return CreativeCanvasImageToThreeGsPlan(
        scene_id=infer_image_to_three_gs_scene_id(source_path, project_dir),
        source_kind=source_kind,
        step=step,
        params=params,
    )
